create table if not exists public.word_access_counts (
  normalized_word text primary key check (char_length(normalized_word) between 1 and 80),
  display_word text not null check (char_length(display_word) between 1 and 80),
  lookup_count bigint not null default 0 check (lookup_count >= 0),
  ai_request_count bigint not null default 0 check (ai_request_count >= 0),
  first_accessed_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create index if not exists word_access_counts_lookup_count_idx
  on public.word_access_counts(lookup_count desc);

alter table public.word_access_counts enable row level security;
revoke all on table public.word_access_counts from anon, authenticated;
grant all on table public.word_access_counts to service_role;

create or replace function public.increment_word_access(
  p_normalized_word text,
  p_display_word text,
  p_kind text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind not in ('lookup', 'ai_request') then
    raise exception 'invalid_access_kind' using errcode = '22023';
  end if;

  insert into public.word_access_counts(
    normalized_word,
    display_word,
    lookup_count,
    ai_request_count
  )
  values (
    p_normalized_word,
    p_display_word,
    case when p_kind = 'lookup' then 1 else 0 end,
    case when p_kind = 'ai_request' then 1 else 0 end
  )
  on conflict (normalized_word) do update
    set display_word = excluded.display_word,
        lookup_count = public.word_access_counts.lookup_count
          + case when p_kind = 'lookup' then 1 else 0 end,
        ai_request_count = public.word_access_counts.ai_request_count
          + case when p_kind = 'ai_request' then 1 else 0 end,
        last_accessed_at = now();
end;
$$;

revoke execute on function public.increment_word_access(text, text, text)
  from public, anon, authenticated;
grant execute on function public.increment_word_access(text, text, text)
  to service_role;
