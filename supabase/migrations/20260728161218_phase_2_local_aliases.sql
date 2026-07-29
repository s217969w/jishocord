alter table public.dictionary_entries
  add column if not exists canonical_word_candidate text
    check (canonical_word_candidate is null or char_length(canonical_word_candidate) between 1 and 80),
  add column if not exists alias_candidates jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(alias_candidates) = 'array'
      and jsonb_array_length(alias_candidates) <= 4
    );

create or replace function public.approve_dictionary_entry(
  p_entry_id uuid,
  p_reviewer_discord_user_id text
)
returns public.dictionary_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.dictionary_entries;
  canonical_word text;
  canonical_normalized text;
  candidate text;
  candidate_normalized text;
begin
  select *
    into target
    from public.dictionary_entries
    where id = p_entry_id
      and status = 'pending'
    for update;

  if not found then
    raise exception 'pending_entry_not_found' using errcode = 'P0002';
  end if;

  canonical_word := coalesce(nullif(btrim(target.canonical_word_candidate), ''), target.word);
  canonical_normalized := lower(regexp_replace(normalize(canonical_word, NFKC), '\s+', ' ', 'g'));

  if exists (
    select 1
    from public.dictionary_entries other
    where other.id <> target.id
      and other.status = 'approved'
      and other.scope = target.scope
      and other.guild_id is not distinct from target.guild_id
      and other.normalized_word = canonical_normalized
  ) or exists (
    select 1
    from public.word_aliases other
    where other.scope = target.scope
      and other.guild_id is not distinct from target.guild_id
      and other.normalized_alias = canonical_normalized
  ) then
    raise exception 'canonical_word_conflict:%', canonical_word using errcode = 'P0001';
  end if;

  for candidate in
    select value
    from jsonb_array_elements_text(target.alias_candidates)
  loop
    candidate_normalized := lower(regexp_replace(normalize(btrim(candidate), NFKC), '\s+', ' ', 'g'));
    if candidate_normalized = '' or candidate_normalized = canonical_normalized then
      continue;
    end if;

    if exists (
      select 1
      from public.dictionary_entries other
      where other.id <> target.id
        and other.status = 'approved'
        and other.scope = target.scope
        and other.guild_id is not distinct from target.guild_id
        and other.normalized_word = candidate_normalized
    ) or exists (
      select 1
      from public.word_aliases other
      where other.entry_id <> target.id
        and other.scope = target.scope
        and other.guild_id is not distinct from target.guild_id
        and other.normalized_alias = candidate_normalized
    ) then
      raise exception 'alias_conflict:%', candidate using errcode = 'P0001';
    end if;
  end loop;

  update public.dictionary_entries
    set word = canonical_word,
        normalized_word = canonical_normalized,
        status = 'approved',
        reviewed_by_discord_user_id = p_reviewer_discord_user_id,
        review_type = 'human',
        review_comment = null,
        reviewed_at = now()
    where id = target.id
    returning * into target;

  insert into public.word_aliases(entry_id, alias, normalized_alias, scope, guild_id, source)
  select
    target.id,
    value,
    lower(regexp_replace(normalize(btrim(value), NFKC), '\s+', ' ', 'g')),
    target.scope,
    target.guild_id,
    'ai'
  from jsonb_array_elements_text(target.alias_candidates)
  where lower(regexp_replace(normalize(btrim(value), NFKC), '\s+', ' ', 'g')) <> target.normalized_word;

  return target;
end;
$$;

revoke execute on function public.approve_dictionary_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_dictionary_entry(uuid, text) to service_role;
