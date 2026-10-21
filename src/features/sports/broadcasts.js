export const officialChannels = {
  wbsc: { handle: '@WBSC', id: 'UC-UXjExO348UiOCxazH69hA', name: 'WBSC', sport: 'baseball' },
  fifa: { handle: '@FIFA', id: 'UCpcTrCXblq78GZrTUTLWeBw', name: 'FIFA', sport: 'football' },
};

const notGame = /shorts|분석|최종조합|스포츠토토|바카라|betting|predictions|webcam|baseball field|stadium cam|24\/7|cctv|yakuza|야쿠자|용과.?같이|プロスピ|パワプロ|mlb the show|out of the park|\bootp\b|simulat|actionsims|\bsims?\b|first look|fact.?check|podcast|on life support|talk.?show|radio|discussion|scoreboard|gameplay|gaming|watch.?along|commentary|reaction|live.?score|score.?only|virtual|highlights|postgame|recap|analysis|sportscards|livebreaks|auctions|breaks|bowman|monster jam|fantasy|softball|해설|하이라이트|시뮬레이션|게임|소프트볼/i;

export function verifiedBroadcasts(videos, { sport = 'baseball', channelId } = {}) {
  return videos.filter(video => /^[\w-]+$/.test(video.id || '')
    && (!channelId || video.snippet?.channelId === channelId)
    && video.snippet?.liveBroadcastContent === 'live'
    && !notGame.test(`${video.snippet.title} ${video.snippet.channelTitle || ''}`)
    && video.status?.embeddable === true && video.status.privacyStatus === 'public'
    && video.liveStreamingDetails?.actualStartTime && !video.liveStreamingDetails.actualEndTime)
    .map(video => {
      const viewers = Number(video.liveStreamingDetails.concurrentViewers);
      return {
        id: `${sport}-youtube-${video.id}`, videoId: video.id, sport,
        title: video.snippet.title, channel: video.snippet.channelTitle || 'YouTube',
        thumbnail: video.snippet.thumbnails?.medium?.url || '',
        viewers: Number.isFinite(viewers) && viewers >= 0 && video.liveStreamingDetails.concurrentViewers !== undefined ? viewers : null,
        startsAt: video.liveStreamingDetails.actualStartTime,
        watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
      };
    }).sort((a, b) => (b.viewers ?? -1) - (a.viewers ?? -1));
}

const cache = new Map();
export async function discoverBroadcasts(apiKey, signal, scope = 'baseball') {
  if (!apiKey) throw new Error('YouTube API 설정이 필요합니다.');
  if (scope !== 'baseball' && !officialChannels[scope]) throw new Error('지원하지 않는 중계 필터입니다.');
  const cacheKey = `${scope}:${apiKey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 300000) return cached;
  async function request(resource, params) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({ ...params, key: apiKey })}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason;
      if (['quotaExceeded', 'dailyLimitExceeded'].includes(reason)) throw new Error('YouTube API의 일일 조회 한도를 초과했습니다.');
      throw new Error('라이브 조회에 실패했습니다. YouTube API 권한과 네트워크를 확인해 주세요.');
    }
    return response.json();
  }
  const official = officialChannels[scope];
  if (official) {
    const channels = await request('channels', { part: 'id', forHandle: official.handle });
    if (channels.items?.[0]?.id !== official.id) throw new Error(`${official.name} 공식 채널을 확인하지 못했습니다.`);
  }
  const criteria = official ? { channelId: official.id, ...(scope === 'wbsc' ? { q: 'baseball|야구' } : {}) }
    : { q: '야구|baseball -shorts -simulation -gameplay -highlights -watchalong', relevanceLanguage: 'ko' };
  const search = await request('search', { part: 'id', type: 'video', eventType: 'live', videoEmbeddable: 'true', maxResults: '50', order: 'viewCount', ...criteria });
  if (!Array.isArray(search.items)) throw new Error('라이브 검색 응답을 확인하지 못했습니다.');
  const ids = [...new Set(search.items.map(item => item.id?.videoId).filter(Boolean))];
  let items = [];
  if (ids.length) {
    const videos = await request('videos', { part: 'snippet,status,liveStreamingDetails', id: ids.join(',') });
    if (!Array.isArray(videos.items)) throw new Error('영상 상태를 확인하지 못했습니다.');
    items = verifiedBroadcasts(videos.items, { sport: official?.sport || 'baseball', channelId: official?.id });
  }
  const result = { items, checkedAt: Date.now() };
  cache.set(cacheKey, result);
  return result;
}
