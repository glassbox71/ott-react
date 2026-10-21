import test from 'node:test';
import assert from 'node:assert/strict';
import { previewGames, normalizeGame, playerSource, fetchFootballSchedule, footballLeagues } from '../src/features/sports/games.js';
import { discoverBroadcasts } from '../src/features/sports/broadcasts.js';

test('at least five fallback cards are explicitly previews', () => {
  assert.ok(previewGames.length >= 5);
  assert.ok(previewGames.every(game => game.preview && !game.live));
  assert.equal(new Set(previewGames.map(game => game.id)).size, previewGames.length);
});
test('only supported HTTPS players are embedded', () => {
  for (const url of ['javascript:alert(1)', 'http://www.youtube.com/embed/id', 'https://evil.example/embed/id', 'https://www.youtube.com.evil.example/embed/id', '', 'https://www.youtube.com/watch?v=abc']) assert.equal(playerSource(url), null);
  assert.equal(playerSource('https://www.youtube.com/embed/abc_X-12').type, 'iframe');
  assert.equal(playerSource('https://www.youtube-nocookie.com/embed/abc_X-12').type, 'iframe');
  assert.equal(playerSource('https://example.com/game.mp4?token=example').type, 'video');
});
const footballEvent = (state = 'in') => ({
  id: '42', date: '2026-10-21T12:00:00Z',
  competitions: [{ competitors: [
    { homeAway: 'away', team: { displayName: 'Arsenal' }, score: '3' },
    { homeAway: 'home', team: { displayName: 'Tottenham' }, score: '0' },
  ], venue: { fullName: 'Tottenham Hotspur Stadium' }, status: { type: { state, shortDetail: "65'" } } }],
});
test('football schedule preserves score, home/away order and live state', () => {
  const result = normalizeGame(footballEvent(), '프리미어리그');
  assert.equal(result.id, 'football-espn-42'); assert.equal(result.homeScore, 0);
  assert.equal(result.awayScore, 3); assert.equal(result.live, true);
  assert.equal(result.home, 'Tottenham'); assert.equal(result.away, 'Arsenal');
  assert.equal(result.sport, 'football'); assert.equal(result.league, '프리미어리그');
  assert.equal(normalizeGame(footballEvent('post')).live, false);
  assert.equal(normalizeGame({ id: 'incomplete' }), null);
});
test('football feed retains successful leagues and reports unavailable leagues', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input); calls.push(url);
    return url.pathname.includes('eng.1')
      ? { ok: true, json: async () => ({ events: [footballEvent()] }) }
      : { ok: false };
  };
  try {
    const result = await fetchFootballSchedule(undefined, new Date('2026-10-21T12:00:00Z'));
    assert.equal(result.games.length, 1);
    assert.equal(result.unavailableLeagues.length, footballLeagues.length - 1);
    assert.ok(calls.every(url => url.pathname.includes('/soccer/') && url.searchParams.get('dates') === '20261021-20261104'));
  } finally { globalThis.fetch = original; }
});
test('missing football feed fails rather than inventing live matches', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try { await assert.rejects(fetchFootballSchedule()); }
  finally { globalThis.fetch = original; }
});
test('missing API key does not fabricate broadcasts', async () => {
  assert.deepEqual(await discoverBroadcasts(), []);
});
test('discovery resolves official channels then requests embeddable live videos', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input); calls.push(url);
    return { ok: true, json: async () => url.pathname.endsWith('channels')
      ? { items: [{ id: 'channel-id', snippet: { title: 'Official' } }] }
      : { items: [{ id: { videoId: 'live-video' }, snippet: { title: 'Football live' } }] } };
  };
  try {
    const games = await discoverBroadcasts('test-key');
    assert.equal(games.length, 3);
    assert.ok(games.every(game => game.sport === 'football' && game.id.startsWith('football-')));
    assert.deepEqual(calls.filter(url => url.pathname.endsWith('channels')).map(url => url.searchParams.get('forHandle')), ['@FIFA', '@UEFA', '@kleague']);
    assert.ok(games.every(game => game.live && game.streamUrl === 'https://www.youtube.com/embed/live-video'));
    assert.ok(calls.filter(url => url.pathname.endsWith('search')).every(url => url.searchParams.get('eventType') === 'live' && url.searchParams.get('videoEmbeddable') === 'true'));
  } finally { globalThis.fetch = original; }
});
test('unavailable discovery surfaces an error instead of fake live streams', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try { await assert.rejects(discoverBroadcasts('test-key')); }
  finally { globalThis.fetch = original; }
});
