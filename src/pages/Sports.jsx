import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { discoverBroadcasts } from '../features/sports/broadcasts';
import { LiveChat } from '../features/sports/LiveChat';
import { fetchFootballSchedule, playerSource, previewGames } from '../features/sports/games';
import './Sports.css';

export function Sports() {
  const [schedule, setSchedule] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [publicStreams, setPublicStreams] = useState([]);
  const [streamError, setStreamError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [feed, setFeed] = useState({ loading: true, error: '', updated: null });
  const [broadcastError, setBroadcastError] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const { games, unavailableLeagues } = await fetchFootballSchedule(controller.signal);
        if (active) {
          setSchedule(games);
          setFeed({ loading: false, error: unavailableLeagues.length ? `${unavailableLeagues.join(', ')} 일정은 현재 불러올 수 없습니다.` : '', updated: new Date() });
        }
      } catch (error) {
        if (active && error.name !== 'AbortError') setFeed(previous => ({ ...previous, loading: false, error: '실시간 경기 정보를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.' }));
      }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, 'sportsBroadcasts'), where('sport', '==', 'football'), limit(100)), snapshot => {
      setBroadcasts(snapshot.docs.map(item => ({ ...item.data(), id: item.id, preview: false })).filter(item => item.sport === 'football' && item.id.startsWith('football-') && typeof item.home === 'string' && typeof item.away === 'string'));
      setBroadcastError('');
    }, () => setBroadcastError('중계 편성 정보를 불러오지 못했습니다. Firebase 읽기 권한을 확인해 주세요.'));
  }, []);
  useEffect(() => {
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (!apiKey) return;
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const streams = await discoverBroadcasts(apiKey, controller.signal);
        if (active) { setPublicStreams(streams); setStreamError(''); }
      } catch (error) {
        if (active && error.name !== 'AbortError') setStreamError('공식 라이브 검색에 실패했습니다. YouTube API 설정을 확인해 주세요.');
      }
    }
    refresh();
    // Search queries consume quota; do not poll at the score refresh frequency.
    const timer = setInterval(refresh, 15 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);
  const merged = new Map(schedule.map(game => [game.id, game]));
  [...publicStreams, ...broadcasts].forEach(game => merged.set(game.id, { ...merged.get(game.id), ...game }));
  const actualGames = [...merged.values()].sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || String(a.startsAt || '').localeCompare(String(b.startsAt || '')));
  const games = [...actualGames, ...previewGames.slice(0, Math.max(0, 6 - actualGames.length))];
  const selected = games.find(game => game.id === selectedId) || games[0];
  const visible = filter === 'live' ? games.filter(game => game.live && !game.preview) : games;
  const source = playerSource(selected?.streamUrl);
  const liveCount = actualGames.filter(game => game.live).length;
  return <main className="sports-page">
    <div className="sports-shell">
      <div className="sports-title-row"><div><p className="sports-eyebrow">PLAY TOGETHER · SPORTS</p><h1>축구의 모든 순간, 함께.</h1><p className="sports-subtitle">경기를 보고, 응원하고, 축구 팬들과 실시간으로 이야기하세요.</p></div><span className="sports-season">⚽ FOOTBALL LOUNGE</span></div>
      <div className="sports-watch-layout">
        <section className="sports-watch" aria-label="선택한 경기 중계">
          <div className="sports-player">
            {source?.type === 'iframe' ? <iframe key={source.url} src={source.url} title={`${selected.away} 대 ${selected.home} 중계`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              : source?.type === 'video' ? <video key={source.url} src={source.url} controls playsInline onError={event => { event.currentTarget.nextElementSibling.hidden = false; }}><track kind="captions" /></video> : null}
            {source?.type === 'video' && <p className="sports-playback-error" role="alert" hidden>영상을 재생할 수 없습니다. 중계 제공처의 주소와 재생 권한을 확인해 주세요.</p>}
            {!source && <div className="sports-player-placeholder"><div className="sports-field"><span>⚽</span></div><span className="sports-outline-badge">{selected?.preview ? '경기 화면 미리보기' : '중계 연결 대기'}</span><h2>{selected?.away} <span>vs</span> {selected?.home}</h2><p>{selected?.preview ? '예시 편성입니다. 실제 진행 중인 경기가 아닙니다.' : '이 경기의 공식 중계가 아직 등록되지 않았습니다.'}</p><p className="sports-player-note">중계가 연결되면 이곳에서 시청하며 함께 응원할 수 있어요.</p></div>}
          </div>
          <div className="sports-watch-info"><div><span className={`sports-badge ${selected?.live ? 'is-live' : ''}`}>{selected?.preview ? 'PREVIEW' : selected?.live ? '● LIVE' : selected?.status || '예정'}</span><h2>{selected?.title || <>{selected?.away} <span>VS</span> {selected?.home}</>}</h2><p>{selected?.venue || '경기장 미정'} {selected?.startsAt ? `· ${new Date(selected.startsAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)` : ''}</p></div><div className="sports-score" aria-label="원정팀 대 홈팀 점수">{selected?.awayScore ?? '–'} <span>:</span> {selected?.homeScore ?? '–'}</div></div>
        </section>
        {selected && <LiveChat key={selected.id} game={selected} />}
      </div>
      <section className="sports-schedule" aria-labelledby="sports-schedule-title">
        <div className="sports-section-heading"><div><h2 id="sports-schedule-title">경기 둘러보기</h2><p>좋아하는 경기를 선택하고 응원방에 입장하세요.</p></div><div className="sports-tabs" aria-label="경기 필터"><button onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>전체 경기</button><button onClick={() => setFilter('live')} aria-pressed={filter === 'live'}>실시간 <span>{liveCount}</span></button></div></div>
        <div className="sports-feed-status" role="status">{feed.loading ? '공식 경기 일정을 불러오는 중…' : feed.error || `ESPN 축구 일정 · ${feed.updated?.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} 갱신 · 30초마다 업데이트`}{broadcastError && <p>{broadcastError}</p>}{streamError && <p>{streamError}</p>}{!import.meta.env.VITE_YOUTUBE_API_KEY && <p>공식 채널 라이브 자동 검색은 YouTube API 연결 후 제공됩니다.</p>}{!db && <p>중계·채팅 서비스 연결을 위한 Firebase 설정이 필요합니다.</p>}</div>
        <div className="sports-game-grid">{visible.map((game, index) => <button key={game.id} className={`sports-game-card ${selected?.id === game.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(game.id)} aria-pressed={selected?.id === game.id}>
          <div className="sports-card-top"><span className={`sports-badge ${game.live ? 'is-live' : ''}`}>{game.preview ? '예시 경기' : game.live ? '● LIVE' : game.status || '예정'}</span><span>{game.preview ? '미리보기' : game.league || 'FOOTBALL'}</span></div>
          <div className={`sports-matchup theme-${index % 3}`}><div><span className="sports-team-icon">{game.away.slice(0, 2)}</span><strong>{game.away}</strong></div><span className="sports-card-vs">{game.awayScore !== undefined ? `${game.awayScore} : ${game.homeScore ?? 0}` : 'VS'}</span><div><span className="sports-team-icon">{game.home.slice(0, 2)}</span><strong>{game.home}</strong></div></div>
          {game.title && <p className="sports-broadcast-title">{game.title}</p>}<div className="sports-card-bottom"><span>{game.venue || '경기장 미정'}</span><span>{selected?.id === game.id ? '선택한 경기 ✓' : '시청 · 응원하기 →'}</span></div>
        </button>)}</div>
        {!visible.length && <p className="sports-no-games">현재 확인된 실시간 경기가 없습니다. 전체 경기에서 예정 경기를 확인해 주세요.</p>}
        <div className="sports-official-links"><a href="https://www.plus.fifa.com/" target="_blank" rel="noreferrer">FIFA+ 공식 중계 안내 ↗</a><a href="https://www.youtube.com/@FIFA/streams" target="_blank" rel="noreferrer">FIFA 공식 중계 채널 ↗</a></div><p className="sports-disclaimer">예시 경기는 화면 미리보기용입니다. 실제 경기 일정·점수는 ESPN 축구 데이터 및 등록된 편성을 표시하며, 영상은 제공처의 중계 권한과 서비스 상태에 따라 재생됩니다.</p>
      </section>
    </div>
  </main>;
}
