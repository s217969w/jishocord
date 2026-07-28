create extension if not exists pgcrypto;

create table if not exists public.guild_settings (
  guild_id text primary key,
  local_dictionary_enabled boolean not null default true,
  local_entry_limit integer not null default 50 check (local_entry_limit between 0 and 1000),
  public_submission_enabled boolean not null default false,
  public_approval_enabled boolean not null default false,
  blocked_at timestamptz,
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 500),
  departed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('public', 'local')),
  guild_id text references public.guild_settings(guild_id) on update cascade on delete restrict,
  word text not null check (char_length(word) between 1 and 80),
  full_word text check (full_word is null or char_length(full_word) <= 200),
  japanese text check (japanese is null or char_length(japanese) <= 200),
  summary text not null check (char_length(summary) between 1 and 200),
  detail text not null check (char_length(detail) between 1 and 800),
  pronounce text not null check (char_length(pronounce) between 1 and 120),
  normalized_word text not null check (char_length(normalized_word) between 1 and 80),
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected')),
  source text not null default 'human' check (source in ('human', 'ai', 'seed')),
  created_by_discord_user_id text,
  reviewed_by_discord_user_id text,
  review_type text check (review_type is null or review_type in ('human', 'ai')),
  review_comment text check (review_comment is null or char_length(review_comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint dictionary_entries_scope_guild_check check (
    (scope = 'local' and guild_id is not null)
    or (scope = 'public' and guild_id is null)
  )
);

create unique index if not exists dictionary_entries_public_approved_word_uidx
  on public.dictionary_entries(normalized_word)
  where scope = 'public' and status = 'approved';
create unique index if not exists dictionary_entries_local_approved_word_uidx
  on public.dictionary_entries(guild_id, normalized_word)
  where scope = 'local' and status = 'approved';
create index if not exists dictionary_entries_local_lookup_idx
  on public.dictionary_entries(guild_id, normalized_word, status)
  where scope = 'local';
create index if not exists dictionary_entries_public_lookup_idx
  on public.dictionary_entries(normalized_word, status)
  where scope = 'public';

create table if not exists public.word_aliases (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.dictionary_entries(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 80),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 80),
  scope text not null check (scope in ('public', 'local')),
  guild_id text references public.guild_settings(guild_id) on update cascade on delete restrict,
  source text not null default 'human' check (source in ('human', 'ai')),
  created_at timestamptz not null default now(),
  constraint word_aliases_scope_guild_check check (
    (scope = 'local' and guild_id is not null)
    or (scope = 'public' and guild_id is null)
  )
);

create unique index if not exists word_aliases_public_alias_uidx
  on public.word_aliases(normalized_alias)
  where scope = 'public';
create unique index if not exists word_aliases_local_alias_uidx
  on public.word_aliases(guild_id, normalized_alias)
  where scope = 'local';
create index if not exists word_aliases_entry_id_idx on public.word_aliases(entry_id);

create table if not exists public.web_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null check (purpose in ('add', 'manage')),
  guild_id text not null references public.guild_settings(guild_id) on update cascade on delete restrict,
  discord_user_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists web_access_tokens_active_idx
  on public.web_access_tokens(token_hash, expires_at)
  where used_at is null and revoked_at is null;

create table if not exists public.submission_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  entry_id uuid references public.dictionary_entries(id) on delete set null,
  guild_id text,
  discord_user_id text,
  result text not null,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists submission_events_guild_created_idx
  on public.submission_events(guild_id, created_at desc);
create index if not exists submission_events_user_created_idx
  on public.submission_events(discord_user_id, created_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  entry_id uuid,
  guild_id text,
  actor_discord_user_id text,
  scope text check (scope is null or scope in ('public', 'local')),
  details jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_guild_created_idx
  on public.audit_logs(guild_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_local_entry_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_limit integer;
  current_count integer;
begin
  if new.scope <> 'local' or new.status not in ('pending', 'approved') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.guild_id, 0));
  select coalesce(local_entry_limit, 50)
    into configured_limit
    from public.guild_settings
    where guild_id = new.guild_id;

  select count(*)
    into current_count
    from public.dictionary_entries
    where guild_id = new.guild_id
      and scope = 'local'
      and status in ('pending', 'approved')
      and id <> new.id;

  if current_count >= configured_limit then
    raise exception 'local_entry_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_alias_consistency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_scope text;
  parent_guild_id text;
  alias_count integer;
begin
  select scope, guild_id into parent_scope, parent_guild_id
  from public.dictionary_entries where id = new.entry_id;
  if not found or new.scope <> parent_scope or new.guild_id is distinct from parent_guild_id then
    raise exception 'alias_scope_mismatch' using errcode = '23514';
  end if;
  select count(*) into alias_count from public.word_aliases where entry_id = new.entry_id and id <> new.id;
  if alias_count >= 4 then
    raise exception 'alias_limit_exceeded' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.audit_dictionary_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.dictionary_entries;
  actor text;
begin
  target := case when tg_op = 'DELETE' then old else new end;
  actor := case
    when tg_op = 'DELETE' then old.reviewed_by_discord_user_id
    else coalesce(new.reviewed_by_discord_user_id, new.created_by_discord_user_id)
  end;
  insert into public.audit_logs(action, entry_id, guild_id, actor_discord_user_id, scope, details)
  values (
    lower(tg_op),
    target.id,
    target.guild_id,
    actor,
    target.scope,
    jsonb_build_object('word', target.word, 'status', target.status)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists guild_settings_updated_at on public.guild_settings;
create trigger guild_settings_updated_at before update on public.guild_settings
for each row execute function public.set_updated_at();
drop trigger if exists dictionary_entries_updated_at on public.dictionary_entries;
create trigger dictionary_entries_updated_at before update on public.dictionary_entries
for each row execute function public.set_updated_at();
drop trigger if exists dictionary_entries_local_limit on public.dictionary_entries;
create trigger dictionary_entries_local_limit before insert or update of status, guild_id, scope on public.dictionary_entries
for each row execute function public.enforce_local_entry_limit();
drop trigger if exists word_aliases_consistency on public.word_aliases;
create trigger word_aliases_consistency before insert or update on public.word_aliases
for each row execute function public.enforce_alias_consistency();
drop trigger if exists dictionary_entries_audit on public.dictionary_entries;
create trigger dictionary_entries_audit after insert or update or delete on public.dictionary_entries
for each row execute function public.audit_dictionary_change();

do $$
begin
  if to_regclass('public.dictionary') is not null then
    execute $migration$
      insert into public.dictionary_entries (
        scope, guild_id, word, full_word, japanese, summary, detail, pronounce,
        normalized_word, status, source
      )
      select
        'public', null, word, "fullWord", "Japanese", summary, detail, pronounce,
        lower(regexp_replace(normalize(word, NFKC), '\s+', ' ', 'g')),
        case when is_approved then 'approved' else 'pending' end,
        'seed'
      from public.dictionary
      on conflict do nothing
    $migration$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.inconsistent') is not null then
    execute $migration$
      insert into public.word_aliases(entry_id, alias, normalized_alias, scope, guild_id, source)
      select e.id, i.word, lower(regexp_replace(normalize(i.word, NFKC), '\s+', ' ', 'g')),
             'public', null, 'human'
      from public.inconsistent i
      join public.dictionary_entries e
        on e.scope = 'public'
       and e.normalized_word = lower(regexp_replace(normalize(i.fix, NFKC), '\s+', ' ', 'g'))
      on conflict do nothing
    $migration$;
  end if;
end;
$$;

alter table public.guild_settings enable row level security;
alter table public.dictionary_entries enable row level security;
alter table public.word_aliases enable row level security;
alter table public.web_access_tokens enable row level security;
alter table public.submission_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.guild_settings from anon, authenticated;
revoke all on table public.dictionary_entries from anon, authenticated;
revoke all on table public.word_aliases from anon, authenticated;
revoke all on table public.web_access_tokens from anon, authenticated;
revoke all on table public.submission_events from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
grant all on table public.guild_settings to service_role;
grant all on table public.dictionary_entries to service_role;
grant all on table public.word_aliases to service_role;
grant all on table public.web_access_tokens to service_role;
grant all on table public.submission_events to service_role;
grant all on table public.audit_logs to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_local_entry_limit() from public, anon, authenticated;
revoke execute on function public.enforce_alias_consistency() from public, anon, authenticated;
revoke execute on function public.audit_dictionary_change() from public, anon, authenticated;
