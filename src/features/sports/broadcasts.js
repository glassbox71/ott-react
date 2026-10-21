export const FIFA_CHANNEL_ID = 'UCpcTrCXblq78GZrTUTLWeBw';

// A channel entry attempts YouTube's current-live player without claiming that
// a match is currently on air. Video-specific LIVE entries require API evidence.
export const fifaChannel = {
  id: 'football-fifa-channel', sport: 'football', channel: true, live: false,
  title: 'FIFA 공식 채널 라이브', home: 'FIFA', away: '공식 채널',
  venue: 'FIFA 공식 YouTube 채널', status: '방송 확인',
  streamUrl: `https://www.youtube.com/embed/live_stream?channel=${FIFA_CHANNEL_ID}`,
  watchUrl: 'https://www.youtube.com/@FIFA/streams',
};

const unrelated = /shorts|simulat|e[ -]?football|gameplay|gaming|ea sports|madden|\bnfl\b|mascot|vibrato|ballon|watch.?along|talksport|commentary|reaction|fc ?2[5-9]|live.?score|score.?only|virtual|spider.?man|tarkov|flag football|tackle|swac|cfp|dynasty|fantasy|postgame|recap|analysis|auctions|breaks|warzone|국정감사|기자회견|해설|시뮬레이션|게임/i;

export function verifiedBroadcasts(videos, channelId) {
  return videos.filter(video => video.id && (!channelId || video.snippet?.channelId === channelId)
    && video.snippet?.liveBroadcastContent === 'live'
    && !unrelated.test(`${video.snippet.title} ${video.snippet.channelTitle || ''}`)
    && video.status?.embeddable === true && video.status.privacyStatus === 'public'
    && video.liveStreamingDetails?.actualStartTime && !video.liveStreamingDetails.actualEndTime)
    .map(video => ({
      id: `football-youtube-${video.id}`, sport: 'football', title: video.snippet.title,
      home: video.snippet.channelTitle || '축구 중계', away: '공개 라이브', venue: video.snippet.channelTitle || 'YouTube',
      live: true, status: 'Live', startsAt: video.liveStreamingDetails.actualStartTime,
      thumbnail: video.snippet.thumbnails?.medium?.url || '',
      viewers: Number(video.liveStreamingDetails.concurrentViewers) > 0 ? Number(video.liveStreamingDetails.concurrentViewers) : null,
      streamUrl: `https://www.youtube.com/embed/${video.id}`,
      watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
    })).sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
}

export function verifiedFifaBroadcasts(videos, channelId) {
  return verifiedBroadcasts(videos, channelId);
}

const cache = new Map();
export async function discoverBroadcasts(apiKey, signal, scope = 'football') {
  if (!apiKey) throw new Error('YouTube API 설정이 필요합니다.');
  const cacheKey = `${scope}:${apiKey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < 300000) return cached.items;
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
  let channelId;
  if (scope === 'fifa') {
    const channels = await request('channels', { part: 'id', forHandle: '@FIFA' });
    channelId = channels.items?.[0]?.id;
    if (channelId !== FIFA_CHANNEL_ID) throw new Error('FIFA 공식 채널을 확인하지 못했습니다.');
  }
  const criteria = channelId ? { channelId } : { q: '축구|soccer|"football match"|"football tournament" -shorts -simulation -efootball -mascot -NFL -Madden', relevanceLanguage: 'ko' };
  const search = await request('search', { part: 'id', type: 'video', eventType: 'live', videoEmbeddable: 'true', maxResults: '50', order: 'viewCount', ...criteria });
  if (!Array.isArray(search.items)) throw new Error('라이브 검색 응답을 확인하지 못했습니다.');
  const ids = search.items.map(item => item.id?.videoId).filter(Boolean);
  let items = [];
  if (ids.length) {
    const videos = await request('videos', { part: 'snippet,status,liveStreamingDetails', id: ids.join(',') });
    if (!Array.isArray(videos.items)) throw new Error('영상 상태를 확인하지 못했습니다.');
    items = verifiedBroadcasts(videos.items, channelId);
  }
  cache.set(cacheKey, { time: Date.now(), items });
  return items;
}
