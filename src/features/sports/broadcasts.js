// Resolve channel handles with YouTube's API instead of guessing stream IDs.
export async function discoverBroadcasts(apiKey, signal) {
  if (!apiKey) return [];
  async function request(resource, params) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({ ...params, key: apiKey })}`, { signal });
    if (!response.ok) throw new Error('공식 중계 검색에 실패했습니다.');
    return response.json();
  }
  const results = await Promise.allSettled(['@FIFA', '@UEFA', '@kleague'].map(async handle => {
    const channels = await request('channels', { part: 'id,snippet', forHandle: handle });
    const channel = channels.items?.[0];
    if (!channel) return [];
    const live = await request('search', { part: 'snippet', channelId: channel.id, eventType: 'live', type: 'video', videoEmbeddable: 'true', maxResults: '10' });
    return (live.items || []).filter(item => item.id?.videoId).map(item => ({
      id: `football-youtube-${item.id.videoId}`, sport: 'football', title: item.snippet.title, home: channel.snippet.title,
      away: '공식 생중계', venue: 'YouTube 공식 채널', live: true, status: 'Live',
      streamUrl: `https://www.youtube.com/embed/${item.id.videoId}`, preview: false,
    }));
  }));
  if (results.every(result => result.status === 'rejected')) throw new Error('공식 중계 검색에 실패했습니다.');
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}
