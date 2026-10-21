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

export function verifiedFifaBroadcasts(videos, channelId) {
  return videos.filter(video => video.id && video.snippet?.channelId === channelId
    && video.snippet.liveBroadcastContent === 'live'
    && video.status?.embeddable === true && video.status.privacyStatus === 'public'
    && video.liveStreamingDetails?.actualStartTime && !video.liveStreamingDetails.actualEndTime)
    .map(video => ({
      id: `football-youtube-${video.id}`, sport: 'football', title: video.snippet.title,
      home: 'FIFA', away: '공식 생중계', venue: 'FIFA 공식 YouTube 채널',
      live: true, status: 'Live', startsAt: video.liveStreamingDetails.actualStartTime,
      streamUrl: `https://www.youtube.com/embed/${video.id}`,
      watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
    }));
}

export async function discoverBroadcasts(apiKey, signal) {
  if (!apiKey) return [];
  async function request(resource, params) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({ ...params, key: apiKey })}`, { signal });
    if (!response.ok) throw new Error('FIFA 공식 중계 검색에 실패했습니다.');
    return response.json();
  }
  const channels = await request('channels', { part: 'id', forHandle: '@FIFA' });
  const channelId = channels.items?.[0]?.id;
  if (!channelId || channelId !== FIFA_CHANNEL_ID) throw new Error('FIFA 공식 채널을 확인하지 못했습니다.');
  const search = await request('search', { part: 'id', channelId, eventType: 'live', type: 'video', videoEmbeddable: 'true', maxResults: '10' });
  if (!Array.isArray(search.items)) throw new Error('FIFA 라이브 검색 응답을 확인하지 못했습니다.');
  const ids = search.items.map(item => item.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videos = await request('videos', { part: 'snippet,status,liveStreamingDetails', id: ids.join(',') });
  if (!Array.isArray(videos.items)) throw new Error('FIFA 영상 상태를 확인하지 못했습니다.');
  return verifiedFifaBroadcasts(videos.items, channelId);
}
