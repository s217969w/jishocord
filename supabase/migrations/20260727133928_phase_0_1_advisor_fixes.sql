create index if not exists submission_events_entry_id_idx
  on public.submission_events(entry_id);
create index if not exists web_access_tokens_guild_id_idx
  on public.web_access_tokens(guild_id);

do $$
declare
  policy_name text;
begin
  if to_regclass('public.dictionary') is not null then
    alter table public.dictionary enable row level security;
    revoke all on table public.dictionary from anon, authenticated;
    for policy_name in
      select policyname from pg_policies where schemaname = 'public' and tablename = 'dictionary'
    loop
      execute format('drop policy %I on public.dictionary', policy_name);
    end loop;
  end if;

  if to_regclass('public.inconsistent') is not null then
    alter table public.inconsistent enable row level security;
    revoke all on table public.inconsistent from anon, authenticated;
    for policy_name in
      select policyname from pg_policies where schemaname = 'public' and tablename = 'inconsistent'
    loop
      execute format('drop policy %I on public.inconsistent', policy_name);
    end loop;
  end if;
end;
$$;
