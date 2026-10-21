import test from 'node:test';
import assert from 'node:assert/strict';
import { officialChannels, verifiedBroadcasts, discoverBroadcasts } from '../src/features/sports/broadcasts.js';
const video = (id = 'match-1', overrides = {}) => ({
  id, snippet: { title: 'Live baseball tournament', channelTitle: 'School Athletics', channelId: 'school', liveBroadcastContent: 'live' },
  status: { privacyStatus: 'public', embeddable: true },
  liveStreamingDetails: { actualStartTime: '2026-10-21T03:00:00Z', concurrentViewers: '20' }, ...overrides,
});
test('only public, started, unended, embeddable live videos are accepted', () => {
  const list = [video(), video('ended', { liveStreamingDetails: { actualStartTime: 'x', actualEndTime: 'y' } }),
    video('future', { liveStreamingDetails: { scheduledStartTime: 'z' } }),
    video('private', { status: { embeddable: true, privacyStatus: 'private' } }),
    video('blocked', { status: { embeddable: false, privacyStatus: 'public' } }),
    video('replay', { snippet: { liveBroadcastContent: 'none' } }), video('../bad')];
  assert.deepEqual(verifiedBroadcasts(list).map(item => item.videoId), ['match-1']);
});
test('baseball ranking uses actual viewer counts and preserves undisclosed counts', () => {
  const result = verifiedBroadcasts([video('less'), video('more', { liveStreamingDetails: { actualStartTime: 'x', concurrentViewers: '100' } }), video('unknown', { liveStreamingDetails: { actualStartTime: 'x' } }), video('zero', { liveStreamingDetails: { actualStartTime: 'x', concurrentViewers: '0' } })]);
  assert.deepEqual(result.map(item => item.videoId), ['more', 'less', 'zero', 'unknown']);
  assert.equal(result[0].sport, 'baseball'); assert.equal(result[2].viewers, 0); assert.equal(result[3].viewers, null);
});
test('obvious games, highlights, card breaks, commentary and softball are excluded', () => {
  const invalid = ['MLB simulation', 'Actionsims Baseball - first look', 'BASEBALL PLAYER OF THE YEAR | Yakuza 5', 'BASEBALL FACT-CHECKING!', 'Baseball gameplay', 'Highlights baseball', 'Live watchalong', 'TUESDAY MLB BREAKS', 'Monster Jam baseball stadium', 'Softball game', '야구 해설', '축구분석 야구분석 최종조합', 'Baseball field 7 webcam'];
  assert.equal(verifiedBroadcasts(invalid.map((title, i) => video(`bad-${i}`, { snippet: { title, liveBroadcastContent: 'live' } }))).length, 0);
});
test('official filter excludes other channels; FIFA results are explicitly football', () => {
  const result = verifiedBroadcasts([video(), video('official', { snippet: { title: 'FIFA match', channelId: officialChannels.fifa.id, channelTitle: 'FIFA', liveBroadcastContent: 'live' } })], { channelId: officialChannels.fifa.id, sport: 'football' });
  assert.equal(result.length, 1); assert.equal(result[0].sport, 'football');
  assert.equal(result[0].id, 'football-youtube-official');
});
test('missing key and unknown scope are errors, never successful empty searches', async () => {
  await assert.rejects(discoverBroadcasts()); await assert.rejects(discoverBroadcasts('test-key', undefined, 'unknown'));
});
test('baseball search, verification and five-minute cache preserve the actual check time', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input); calls.push(url);
    return { ok: true, json: async () => url.pathname.endsWith('search') ? { items: [{ id: { videoId: 'match-1' } }] } : { items: [video()] } };
  };
  try {
    const first = await discoverBroadcasts('baseball-cache-test');
    const second = await discoverBroadcasts('baseball-cache-test');
    assert.equal(calls.length, 2); assert.equal(first.checkedAt, second.checkedAt);
    assert.equal(first.items.length, 1); assert.equal(calls[0].searchParams.get('eventType'), 'live');
    assert.ok(calls[0].searchParams.get('q').includes('baseball'));
    assert.equal(calls[0].searchParams.get('channelId'), null);
    assert.equal(calls[0].searchParams.get('order'), 'viewCount');
  } finally { globalThis.fetch = original; }
});
test('WBSC handle is verified and query is restricted to its channel', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input); calls.push(url);
    return { ok: true, json: async () => url.pathname.endsWith('channels') ? { items: [{ id: officialChannels.wbsc.id }] } : { items: [] } };
  };
  try {
    const result = await discoverBroadcasts('wbsc-test', undefined, 'wbsc');
    assert.deepEqual(result.items, []);
    assert.equal(calls[0].searchParams.get('forHandle'), '@WBSC');
    assert.equal(calls[1].searchParams.get('channelId'), officialChannels.wbsc.id);
  } finally { globalThis.fetch = original; }
});
test('wrong official channel identity fails', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ id: 'other' }] }) });
  try { await assert.rejects(discoverBroadcasts('bad-official', undefined, 'wbsc')); }
  finally { globalThis.fetch = original; }
});
test('quota errors retain their diagnosis', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) });
  try { await assert.rejects(discoverBroadcasts('quota-test'), /일일 조회 한도/); }
  finally { globalThis.fetch = original; }
});
test('fewer than five broadcasts remain the actual count without padding', () => {
  assert.equal(verifiedBroadcasts([video()]).length, 1);
  assert.deepEqual(verifiedBroadcasts([]), []);
});

test('chat keeps a rejected draft after Firestore rollback and merges acknowledgements by ID', async () => {
  const { visibleMessages, chatFailure } = await import('../src/features/sports/chat.js');
  const pending = { id: 'outgoing', text: '응원', status: 'pending', createdAtMs: 2 };
  assert.equal(visibleMessages([pending], [pending]).length, 1);
  const failed = { ...pending, status: 'failed' };
  assert.deepEqual(visibleMessages([], [failed]), [failed]);
  const saved = { ...pending, status: 'saved' };
  assert.deepEqual(visibleMessages([saved], []), [saved]);
  assert.match(chatFailure({ code: 'permission-denied' }, '메시지 저장 실패'), /보안 규칙.*permission-denied/);
  assert.match(chatFailure({ code: 'resource-exhausted' }, '메시지 저장 실패'), /사용 한도/);
  assert.doesNotMatch(chatFailure({ code: 'unknown-secret-value', message: 'private-key' }, '실패'), /secret|private/);
});
