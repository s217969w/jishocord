export interface DictionaryEntry {
  word: string;
  pronounce: string;
  fullWord: string | null;
  Japanese: string | null;
  summary: string;
  detail: string;
  is_approved: boolean;
}

export interface InconsistentEntry {
  word: string;
  fix: string;
}

export interface EditDetails {
  word: string;
  pronounce: string | null;
  fullWord: string | null;
  Japanese: string | null;
  summary: string | null;
  detail: string | null;
}

export type DictionaryDraft = Omit<DictionaryEntry, 'is_approved'> & {
  is_approved: boolean;
};

export interface Envs {
  token: string | undefined;
  clientId: string | undefined;
  guildId: string | undefined;
}