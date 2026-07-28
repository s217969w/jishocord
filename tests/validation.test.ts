import assert from 'node:assert/strict';
import test from 'node:test';
import { dictionaryInputSchema, neutralizeDiscordMentions, normalizeWord } from '../back/validation.js';

const valid = {
  word: 'BFS',
  pronounce: 'びーえふえす',
  fullWord: 'Breadth First Search',
  Japanese: '幅優先探索',
  summary: '探索アルゴリズムのひとつだよ。',
  detail: '近い頂点から探索するよ。',
};

test('入力上限と不可視文字を検証する', () => {
  assert.equal(dictionaryInputSchema.safeParse(valid).success, true);
  assert.equal(dictionaryInputSchema.safeParse({ ...valid, word: 'x'.repeat(81) }).success, false);
  assert.equal(dictionaryInputSchema.safeParse({ ...valid, word: 'BF\u200bS' }).success, false);
});

test('検索語をNFKC・小文字・空白統一で正規化する', () => {
  assert.equal(normalizeWord('  ＢＦＳ  Test  '), 'bfs test');
  assert.equal(normalizeWord('C++'), 'c++');
});

test('Discordメンションを無効化する', () => {
  assert.equal(neutralizeDiscordMentions('@everyone'), '@\u200beveryone');
});
