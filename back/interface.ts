export const dictionaryLimits = {
  word: 80,
  pronounce: 120,
  fullWord: 200,
  Japanese: 200,
  summary: 200,
  detail: 800,
  alias: 80,
  aliasesPerEntry: 4,
  localEntries: 50,
  departedGuildRetentionDays: 90,
} as const;

export type DictionaryScope = 'public' | 'local';
export type DictionaryStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type DictionarySource = 'human' | 'ai' | 'seed';

export interface DictionaryEntry {
  id: string;
  scope: DictionaryScope;
  guildId: string | null;
  word: string;
  pronounce: string;
  fullWord: string | null;
  Japanese: string | null;
  summary: string;
  detail: string;
  normalizedWord: string;
  status: DictionaryStatus;
  source: DictionarySource;
  createdByDiscordUserId: string | null;
  reviewedByDiscordUserId: string | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  canonicalWordCandidate: string | null;
  aliasCandidates: string[];
}

export interface DictionaryInput {
  word: string;
  pronounce: string;
  fullWord: string | null;
  Japanese: string | null;
  summary: string;
  detail: string;
  canonicalWord: string;
  aliases: string[];
}

export interface EditDetails {
  word: string;
  pronounce: string | null;
  fullWord: string | null;
  Japanese: string | null;
  summary: string | null;
  detail: string | null;
  canonicalWord: string | null;
  aliases: string[] | null;
}

export interface DictionaryContext {
  guildId: string | null;
  discordUserId?: string;
}

export interface GuildSettings {
  guildId: string;
  localDictionaryEnabled: boolean;
  localEntryLimit: number;
  publicSubmissionEnabled: boolean;
  publicApprovalEnabled: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
}

export type AppResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error:
        | 'not_found'
        | 'duplicate'
        | 'alias_conflict'
        | 'limit_exceeded'
        | 'feature_disabled'
        | 'forbidden'
        | 'invalid_input'
        | 'external_error';
      message: string;
    };

export type AiResult =
  | { type: 'generated'; entry: DictionaryInput }
  | { type: 'not_explainable' }
  | { type: 'invalid_response'; message: string }
  | { type: 'rate_limited'; message: string }
  | { type: 'unavailable'; message: string }
  | { type: 'timeout'; message: string }
  | { type: 'external_error'; message: string };

export interface Envs {
  token: string | undefined;
  clientId: string | undefined;
  guildId: string | undefined;
  commandRegistration: 'guild' | 'global';
}

export interface LogContext {
  correlationId: string;
  operation: string;
  guildId?: string | null;
  discordUserId?: string;
}
