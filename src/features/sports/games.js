// Display-only previews are never presented as actual live games.
export const previewGames = [
  ['FC 서울', '전북 현대', '서울월드컵경기장'],
  ['울산 HD', '포항 스틸러스', '울산문수축구경기장'],
  ['토트넘 홋스퍼', '아스널', '토트넘 홋스퍼 스타디움'],
  ['맨체스터 시티', '리버풀', '에티하드 스타디움'],
  ['레알 마드리드', 'FC 바르셀로나', '산티아고 베르나베우'],
  ['바이에른 뮌헨', '도르트문트', '알리안츠 아레나'],
].map(([home, away, venue], i) => ({ id: `football-preview-${i}`, sport: 'football', home, away, venue, status: '미리보기', preview: true }));

export function normalizeGame(event, league) {
  const competition = event.competitions?.[0];
  const home = competition?.competitors?.find(team => team.homeAway === 'home');
  const away = competition?.competitors?.find(team => team.homeAway === 'away');
  if (!event.id || !home?.team?.displayName || !away?.team?.displayName) return null;
  const status = competition.status || event.status;
  const score = team => team.score === undefined || team.score === null || team.score === '' ? undefined : Number(team.score);
  return {
    id: `football-espn-${event.id}`, sport: 'football', league,
    home: home.team.displayName, away: away.team.displayName,
    homeScore: score(home), awayScore: score(away),
    venue: competition.venue?.fullName, startsAt: event.date,
    live: status?.type?.state === 'in',
    status: status?.type?.shortDetail || status?.type?.description || '예정',
  };
}

export const footballLeagues = [
  ['eng.1', '프리미어리그'], ['esp.1', '라리가'],
  ['ger.1', '분데스리가'], ['kor.1', 'K리그1'],
];

export async function fetchFootballSchedule(signal, today = new Date()) {
  const end = new Date(today); end.setUTCDate(end.getUTCDate() + 14);
  const date = value => value.toISOString().slice(0, 10).replaceAll('-', '');
  const results = await Promise.allSettled(footballLeagues.map(async ([id, name]) => {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${id}/scoreboard?dates=${date(today)}-${date(end)}&limit=100`, { signal });
    if (!response.ok) throw new Error('축구 일정 조회 실패');
    const data = await response.json();
    if (!Array.isArray(data.events)) throw new Error('축구 일정 형식 오류');
    return data.events.map(event => normalizeGame(event, name)).filter(Boolean);
  }));
  if (results.every(result => result.status === 'rejected')) throw new Error('축구 일정을 불러오지 못했습니다.');
  return {
    games: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    unavailableLeagues: results.flatMap((result, index) => result.status === 'rejected' ? [footballLeagues[index][1]] : []),
  };
}

// Only embed URLs with a known player origin. Never render arbitrary HTML.
export function playerSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)
      && /^\/embed\/[\w-]+$/.test(url.pathname)) return { type: 'iframe', url: url.href };
    if (/\.(mp4|webm)$/i.test(url.pathname)) return { type: 'video', url: url.href };
  } catch { /* An absent or unsupported stream is shown as unavailable. */ }
  return null;
}
