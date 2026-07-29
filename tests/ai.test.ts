import assert from 'node:assert/strict';
import test from 'node:test';
import { aiResponseForTest } from '../back/AI.js';

test('nullは説明不能、falseは不正応答として区別する', () => {
  assert.equal(aiResponseForTest.parseResponse('null').type, 'not_explainable');
  assert.equal(aiResponseForTest.parseResponse('false').type, 'invalid_response');
  assert.equal(aiResponseForTest.parseResponse('"false"').type, 'invalid_response');
});

test('不正JSONと文字数超過を不正応答にする', () => {
  assert.equal(aiResponseForTest.parseResponse('{').type, 'invalid_response');
  const tooLong = JSON.stringify({
    word: 'x'.repeat(81),
    pronounce: 'えっくす',
    fullWord: null,
    Japanese: null,
    summary: '概要',
    detail: '詳細',
    canonicalWord: 'x',
    aliases: [],
  });
  assert.equal(aiResponseForTest.parseResponse(tooLong).type, 'invalid_response');
});

test('正規語候補と表記ゆれを構造化応答として受け付ける', () => {
  const response = JSON.stringify({
    word: 'BFS',
    pronounce: 'びーえふえす',
    fullWord: 'Breadth First Search',
    Japanese: '幅優先探索',
    summary: '概要だよ。',
    detail: '詳細だよ。',
    canonicalWord: 'BFS',
    aliases: ['bfs', 'ビーエフエス'],
  });
  const result = aiResponseForTest.parseResponse(response);
  assert.equal(result.type, 'generated');
  if (result.type === 'generated') {
    assert.deepEqual(result.entry.aliases, ['bfs', 'ビーエフエス']);
  }
});

test('APIエラーを分類する', () => {
  assert.equal(aiResponseForTest.classifyError({ status: 429, message: 'limited' }).type, 'rate_limited');
  assert.equal(
    aiResponseForTest.classifyError({
      status: 503,
      message: 'This model is currently experiencing high demand. Please try again later.',
    }).type,
    'unavailable',
  );
  assert.equal(aiResponseForTest.classifyError(new Error('request timeout')).type, 'timeout');
  assert.equal(aiResponseForTest.classifyError(new Error('network')).type, 'external_error');
});
