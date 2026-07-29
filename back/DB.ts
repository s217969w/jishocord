import { createClient, type PostgrestError } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  AppResult,
  DictionaryContext,
  DictionaryEntry,
  DictionaryInput,
  DictionaryScope,
  EditDetails,
  GuildSettings,
} from './interface.js';
import { createLogContext, logError } from './logger.js';
import { dictionaryInputSchema, editDetailsSchema, normalizeWord } from './validation.js';
import { sanitizeAliasCandidates } from './validation.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('SUPABASE_URL または SUPABASE_SECRET_KEY が設定されていません');
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DictionaryRow {
  id: string;
  scope: DictionaryScope;
  guild_id: string | null;
  word: string;
  pronounce: string;
  full_word: string | null;
  japanese: string | null;
  summary: string;
  detail: string;
  normalized_word: string;
  status: DictionaryEntry['status'];
  source: DictionaryEntry['source'];
  created_by_discord_user_id: string | null;
  reviewed_by_discord_user_id: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  canonical_word_candidate: string | null;
  alias_candidates: unknown;
}

interface GuildSettingsRow {
  guild_id: string;
  local_dictionary_enabled: boolean;
  local_entry_limit: number;
  public_submission_enabled: boolean;
  public_approval_enabled: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
}

function toEntry(row: DictionaryRow): DictionaryEntry {
  return {
    id: row.id,
    scope: row.scope,
    guildId: row.guild_id,
    word: row.word,
    pronounce: row.pronounce,
    fullWord: row.full_word,
    Japanese: row.japanese,
    summary: row.summary,
    detail: row.detail,
    normalizedWord: row.normalized_word,
    status: row.status,
    source: row.source,
    createdByDiscordUserId: row.created_by_discord_user_id,
    reviewedByDiscordUserId: row.reviewed_by_discord_user_id,
    reviewComment: row.review_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    canonicalWordCandidate: row.canonical_word_candidate,
    aliasCandidates: Array.isArray(row.alias_candidates)
      ? row.alias_candidates.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function databaseFailure<T>(operation: string, error: PostgrestError): AppResult<T> {
  logError(createLogContext(operation), error);
  if (error.code === '23505') {
    return { ok: false, error: 'duplicate', message: '同じ単語が既に登録されています。' };
  }
  if (error.code === 'P0001' && error.message.includes('alias_conflict:')) {
    const alias = error.message.split('alias_conflict:')[1]?.trim();
    return {
      ok: false,
      error: 'alias_conflict',
      message: `表記「${alias ?? '不明'}」は別の承認済み項目と衝突しています。候補を編集してから再承認してください。`,
    };
  }
  if (error.code === 'P0001' && error.message.includes('canonical_word_conflict:')) {
    const word = error.message.split('canonical_word_conflict:')[1]?.trim();
    return {
      ok: false,
      error: 'alias_conflict',
      message: `正規語候補「${word ?? '不明'}」は別の承認済み項目と衝突しています。`,
    };
  }
  if (error.code === 'P0001' && error.message.includes('local_entry_limit_exceeded')) {
    return { ok: false, error: 'limit_exceeded', message: 'ローカル辞書の登録上限に達しています。' };
  }
  return { ok: false, error: 'external_error', message: '辞書データベースを利用できません。' };
}

export async function ensureGuildSettings(guildId: string): Promise<AppResult<GuildSettings>> {
  const { data, error } = await supabase
    .from('guild_settings')
    .upsert({ guild_id: guildId }, { onConflict: 'guild_id' })
    .select()
    .single();

  if (error) return databaseFailure('ensureGuildSettings', error);
  const row = data as GuildSettingsRow;
  return {
    ok: true,
    value: {
      guildId: row.guild_id,
      localDictionaryEnabled: row.local_dictionary_enabled,
      localEntryLimit: row.local_entry_limit,
      publicSubmissionEnabled: row.public_submission_enabled,
      publicApprovalEnabled: row.public_approval_enabled,
      blockedAt: row.blocked_at,
      blockedReason: row.blocked_reason,
    },
  };
}

export async function markGuildDeparted(guildId: string): Promise<AppResult<null>> {
  const { error } = await supabase
    .from('guild_settings')
    .update({ departed_at: new Date().toISOString() })
    .eq('guild_id', guildId);
  if (error) return databaseFailure('markGuildDeparted', error);
  return { ok: true, value: null };
}

export async function addWord(
  entryDetails: DictionaryInput,
  context: DictionaryContext,
  scope: DictionaryScope = 'public',
): Promise<AppResult<DictionaryEntry>> {
  const parsed = dictionaryInputSchema.safeParse(entryDetails);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? '入力が不正です。' };
  }
  if (scope === 'local' && !context.guildId) {
    return { ok: false, error: 'invalid_input', message: 'ローカル辞書にはサーバーIDが必要です。' };
  }
  if (scope === 'local') {
    const settings = await ensureGuildSettings(context.guildId!);
    if (!settings.ok) return settings;
    if (!settings.value.localDictionaryEnabled || settings.value.blockedAt) {
      return { ok: false, error: 'feature_disabled', message: 'このサーバーではローカル辞書を利用できません。' };
    }
  }

  const aliases = sanitizeAliasCandidates(parsed.data.canonicalWord, parsed.data.word, parsed.data.aliases);

  const { data, error } = await supabase
    .from('dictionary_entries')
    .insert({
      scope,
      guild_id: scope === 'local' ? context.guildId : null,
      word: parsed.data.word,
      normalized_word: normalizeWord(parsed.data.word),
      pronounce: parsed.data.pronounce,
      full_word: parsed.data.fullWord,
      japanese: parsed.data.Japanese,
      summary: parsed.data.summary,
      detail: parsed.data.detail,
      status: 'pending',
      source: 'ai',
      created_by_discord_user_id: context.discordUserId ?? null,
      canonical_word_candidate: parsed.data.canonicalWord,
      alias_candidates: aliases,
    })
    .select()
    .single();

  if (error) return databaseFailure('addWord', error);
  return { ok: true, value: toEntry(data as DictionaryRow) };
}

async function findInScope(normalized: string, guildId: string | null): Promise<AppResult<DictionaryEntry | null>> {
  let query = supabase
    .from('dictionary_entries')
    .select()
    .eq('normalized_word', normalized)
    .neq('status', 'reject');

  query = guildId ? query.eq('scope', 'local').eq('guild_id', guildId) : query.eq('scope', 'public').is('guild_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) return databaseFailure('findInScope', error);
  if (data) return { ok: true, value: toEntry(data as DictionaryRow) };

  let aliasQuery = supabase
    .from('word_aliases')
    .select('dictionary_entries(*)')
    .eq('normalized_alias', normalized);
  aliasQuery = guildId
    ? aliasQuery.eq('scope', 'local').eq('guild_id', guildId)
    : aliasQuery.eq('scope', 'public').is('guild_id', null);
  const aliasResult = await aliasQuery.maybeSingle();
  if (aliasResult.error) return databaseFailure('findAliasInScope', aliasResult.error);
  const related = aliasResult.data?.dictionary_entries;
  if (!related || Array.isArray(related) || (related as DictionaryRow).status !== 'approved') {
    return { ok: true, value: null };
  }
  return { ok: true, value: toEntry(related as DictionaryRow) };
}

export async function getTips(word: string, guildId: string | null): Promise<AppResult<DictionaryEntry | null>> {
  const normalized = normalizeWord(word);
  if (guildId) {
    const settings = await ensureGuildSettings(guildId);
    if (!settings.ok) return settings;
    if (settings.value.localDictionaryEnabled && !settings.value.blockedAt) {
      const local = await findInScope(normalized, guildId);
      if (!local.ok || local.value) return local;
    }
  }
  return findInScope(normalized, null);
}

export async function getUnapproved(guildId: string | null): Promise<AppResult<Array<Pick<DictionaryEntry, 'word' | 'scope'>>>> {
  let query = supabase
    .from('dictionary_entries')
    .select('word,scope')
    .eq('status', 'pending')
    .limit(50);
  query = guildId
    ? query.or(`scope.eq.public,and(scope.eq.local,guild_id.eq.${guildId})`)
    : query.eq('scope', 'public');
  const { data, error } = await query;
  if (error) return databaseFailure('getUnapproved', error);
  return { ok: true, value: (data ?? []) as Array<Pick<DictionaryEntry, 'word' | 'scope'>> };
}

export async function canApprovePublic(guildId: string | null): Promise<boolean> {
  if (!guildId) return false;
  const settings = await ensureGuildSettings(guildId);
  return settings.ok && settings.value.publicApprovalEnabled && !settings.value.blockedAt;
}

export async function approve(
  word: string,
  context: DictionaryContext,
  scope: DictionaryScope,
): Promise<AppResult<DictionaryEntry>> {
  if (scope === 'local' && !context.guildId) {
    return { ok: false, error: 'forbidden', message: '対象サーバーを確認できません。' };
  }
  if (scope === 'local') {
    const settings = await ensureGuildSettings(context.guildId!);
    if (!settings.ok) return settings;
    if (!settings.value.localDictionaryEnabled || settings.value.blockedAt) {
      return { ok: false, error: 'feature_disabled', message: 'このサーバーではローカル辞書を利用できません。' };
    }
  }
  if (scope === 'public' && !(await canApprovePublic(context.guildId))) {
    return { ok: false, error: 'forbidden', message: 'このサーバーではパブリック辞書を承認できません。' };
  }

  let pendingQuery = supabase
    .from('dictionary_entries')
    .select('id')
    .eq('normalized_word', normalizeWord(word))
    .eq('status', 'pending')
    .eq('scope', scope);
  pendingQuery = scope === 'local'
    ? pendingQuery.eq('guild_id', context.guildId)
    : pendingQuery.is('guild_id', null);
  const pending = await pendingQuery.maybeSingle();
  if (pending.error) return databaseFailure('findPendingForApproval', pending.error);
  if (!pending.data) return { ok: false, error: 'not_found', message: '未承認の単語が見つかりません。' };

  const { data, error } = await supabase
    .rpc('approve_dictionary_entry', {
      p_entry_id: pending.data.id,
      p_reviewer_discord_user_id: context.discordUserId ?? null,
    })
    .single();
  if (error) return databaseFailure('approve', error);
  return { ok: true, value: toEntry(data as DictionaryRow) };
}

export async function editWord(
  editDetails: EditDetails,
  context: DictionaryContext,
  scope: DictionaryScope,
): Promise<AppResult<DictionaryEntry>> {
  const parsed = editDetailsSchema.safeParse(editDetails);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? '入力が不正です。' };
  }
  if (parsed.data.aliases !== null && parsed.data.canonicalWord === null) {
    return {
      ok: false,
      error: 'invalid_input',
      message: '表記ゆれ候補を編集するときは正規語候補も指定してください。',
    };
  }
  if (scope === 'local' && !context.guildId) {
    return { ok: false, error: 'forbidden', message: '対象サーバーを確認できません。' };
  }
  if (scope === 'local') {
    const settings = await ensureGuildSettings(context.guildId!);
    if (!settings.ok) return settings;
    if (!settings.value.localDictionaryEnabled || settings.value.blockedAt) {
      return { ok: false, error: 'feature_disabled', message: 'このサーバーではローカル辞書を利用できません。' };
    }
  }
  if (scope === 'public' && !(await canApprovePublic(context.guildId))) {
    return { ok: false, error: 'forbidden', message: 'このサーバーではパブリック辞書を編集できません。' };
  }

  const updates = Object.fromEntries(
    Object.entries({
      pronounce: parsed.data.pronounce,
      full_word: parsed.data.fullWord,
      japanese: parsed.data.Japanese,
      summary: parsed.data.summary,
      detail: parsed.data.detail,
      canonical_word_candidate: parsed.data.canonicalWord,
      alias_candidates: parsed.data.aliases === null || parsed.data.canonicalWord === null
        ? null
        : sanitizeAliasCandidates(parsed.data.canonicalWord, parsed.data.word, parsed.data.aliases),
    }).filter(([, value]) => value !== null),
  );
  let query = supabase
    .from('dictionary_entries')
    .update(updates)
    .eq('normalized_word', normalizeWord(parsed.data.word))
    .eq('scope', scope);
  query = scope === 'local' ? query.eq('guild_id', context.guildId) : query.is('guild_id', null);
  const { data, error } = await query.select().maybeSingle();
  if (error) return databaseFailure('editWord', error);
  if (!data) return { ok: false, error: 'not_found', message: '単語が見つかりません。' };
  return { ok: true, value: toEntry(data as DictionaryRow) };
}

export async function deleteWord(
  word: string,
  context: DictionaryContext,
  scope: DictionaryScope,
): Promise<AppResult<null>> {
  if (scope === 'local' && !context.guildId) {
    return { ok: false, error: 'forbidden', message: '対象サーバーを確認できません。' };
  }
  if (scope === 'local') {
    const settings = await ensureGuildSettings(context.guildId!);
    if (!settings.ok) return settings;
    if (!settings.value.localDictionaryEnabled || settings.value.blockedAt) {
      return { ok: false, error: 'feature_disabled', message: 'このサーバーではローカル辞書を利用できません。' };
    }
  }
  if (scope === 'public' && !(await canApprovePublic(context.guildId))) {
    return { ok: false, error: 'forbidden', message: 'このサーバーではパブリック辞書を削除できません。' };
  }
  let query = supabase
    .from('dictionary_entries')
    .delete()
    .eq('normalized_word', normalizeWord(word))
    .eq('scope', scope);
  query = scope === 'local' ? query.eq('guild_id', context.guildId) : query.is('guild_id', null);
  const { data, error } = await query.select('id');
  if (error) return databaseFailure('deleteWord', error);
  if (!data?.length) return { ok: false, error: 'not_found', message: '単語が見つかりません。' };
  return { ok: true, value: null };
}
