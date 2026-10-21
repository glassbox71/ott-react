import { useEffect, useState } from 'react';
import { discoverBroadcasts } from '../features/sports/broadcasts';
import { LiveChat } from '../features/sports/LiveChat';
import './Sports.css';

const scopes = [{ id: 'baseball', label: '야구 전체' }, { id: 'wbsc', label: 'WBSC 공식' }, { id: 'fifa', label: 'FIFA · 축구' }];

export function Sports() {
  const [scope, setScope] = useState('baseball');
  const [result, setResult] = useState({ items: [], checkedAt: null });
  const [selectedId, setSelectedId] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const data = await discoverBroadcasts(import.meta.env.VITE_YOUTUBE_API_KEY, controller.signal, scope);
        if (active) {
          setResult(data); setError('');
          setSelectedId(previous => data.items.some(item => item.id === previous) ? previous : data.items[0]?.id || null);
        }
      } catch (failure) {
        if (active && failure.name !== 'AbortError') { setError(failure.message || '중계를 불러오지 못했습니다.'); setResult({ items: [], checkedAt: null }); }
      } finally { if (active) setLoading(false); }
    }
    load();
    const timer = setInterval(load, 300000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [scope, revision]);
  const lives = result.items;
  const selected = lives.find(item => item.id === selectedId) || lives[0];
  const topFive = lives.slice(0, 5);
  function changeScope(next) {
    if (next === scope) return;
    setScope(next); setResult({ items: [], checkedAt: null }); setSelectedId(null); setError(''); setLoading(true);
  }
  return <main className="sports-page"><div className="sports-shell">
    <div className="sports-title-row"><div><p className="sports-eyebrow">PLAY TOGETHER · BASEBALL</p><h1>야구의 모든 순간, 함께.</h1><p className="sports-subtitle">지금 방송 중인 공개 야구 라이브를 보고, 함께 응원하세요.</p></div><span className="sports-season">⚾ BASEBALL LOUNGE</span></div>
    <section className="sports-ranking" aria-labelledby="sports-ranking-title">
      <div className="sports-section-heading"><div><h2 id="sports-ranking-title">실시간 인기 TOP 5</h2><p>조회된 공개 라이브의 동시 시청자 수 기준</p></div><div className="sports-tabs" aria-label="중계 채널 필터">{scopes.map(item => <button key={item.id} aria-pressed={scope === item.id} onClick={() => changeScope(item.id)}>{item.label}</button>)}</div></div>
      {scope === 'fifa' && <p className="sports-disclaimer">FIFA는 축구 기관입니다. 이 필터의 방송은 야구가 아닌 FIFA 공식 축구 방송입니다.</p>}
      <div className="sports-ranking-status" role="status"><span>{loading ? '방송 중인 라이브를 찾고 있습니다…' : result.checkedAt ? `${new Date(result.checkedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} 확인 · 한국 시간 · 5분마다 갱신` : '조회 미완료'}</span><button disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? '확인 중…' : '새로고침'}</button></div>
      {error && <p className="sports-error" role="alert">{error} 방송이 없다고 확인된 상태는 아닙니다.</p>}
      {!loading && !error && !lives.length && <p className="sports-no-games">현재 조건에 맞는 공개·임베드 가능한 라이브가 없습니다. 방송이 시작되면 자동 갱신으로 표시됩니다.</p>}
      <div className="sports-ranking-grid">{topFive.map((live, index) => <button key={live.id} className={`sports-ranking-card ${selected?.id === live.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === live.id} onClick={() => setSelectedId(live.id)}><div className="sports-ranking-image">{live.thumbnail && <img src={live.thumbnail} alt="" />}<span className="sports-ranking-number">{index + 1}</span><span className="sports-badge is-live">LIVE</span></div><strong>{live.title}</strong><span>{live.channel}</span><small>{live.viewers === null ? '시청자 수 비공개' : `${live.viewers.toLocaleString('ko-KR')}명 시청 중`}</small></button>)}</div>
      {!loading && lives.length > 0 && lives.length < 5 && <p className="sports-disclaimer">현재 조건에 맞는 방송은 {lives.length}개입니다. 실제 조회된 방송만 표시합니다.</p>}
    </section>
    {selected && <section className="sports-watch-layout" aria-label="중계 시청 및 채팅">
      <div className="sports-watch"><div className="sports-player"><iframe key={selected.videoId} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.videoId)}?autoplay=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`} title={selected.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div><div className="sports-watch-info"><div><span className="sports-badge is-live">LIVE</span><h2>{selected.title}</h2><p>{selected.channel} · {selected.viewers === null ? '시청자 수 비공개' : `${selected.viewers.toLocaleString('ko-KR')}명 시청 중`}</p><p><a href={selected.watchUrl} target="_blank" rel="noreferrer">영상 재생이 제한되거나 종료됐나요? YouTube에서 확인 ↗</a></p></div></div></div>
      <LiveChat key={selected.id} game={selected} />
    </section>}
    {!selected && <section className="sports-watch-layout" aria-label="게스트 응원 라운지"><div className="sports-watch p-6"><h2 className="text-xl font-bold mb-3">{scope === 'fifa' ? '축구' : '야구'} 응원 라운지</h2><p className="text-sm text-slate-300">방송을 기다리는 동안에도 로그인 없이 이야기를 나눌 수 있습니다. 경기를 선택하면 해당 방송의 채팅방으로 이동합니다.</p></div><LiveChat key={scope === 'fifa' ? 'football-lounge' : 'baseball-lounge'} game={{ id: scope === 'fifa' ? 'football-lounge' : 'baseball-lounge', sport: scope === 'fifa' ? 'football' : 'baseball' }} /></section>}
    {lives.length > 5 && <section className="sports-schedule" aria-labelledby="sports-all-title"><div className="sports-section-heading"><h2 id="sports-all-title">전체 실시간 중계</h2><span>{lives.length}개 방송</span></div><div className="sports-all-grid">{lives.slice(5).map(live => <button className={`sports-all-card ${selected?.id === live.id ? 'is-selected' : ''}`} key={live.id} aria-pressed={selected?.id === live.id} onClick={() => setSelectedId(live.id)}><span className="sports-badge is-live">LIVE</span><strong>{live.title}</strong><small>{live.channel}</small></button>)}</div></section>}
    <p className="sports-disclaimer">실제 방송 시작·종료 여부와 공개·외부 재생 허용 상태를 확인한 YouTube 방송입니다. 제목 기준으로 게임·시뮬레이션·명확한 해설 방송을 제외하지만, 모든 영상의 경기 내용과 중계 권한을 보증하지는 않습니다. 재생 가능 지역·자동 재생은 제공처와 브라우저 정책에 따라 달라집니다. 새로고침도 5분 캐시를 사용합니다.</p>
    <div className="sports-official-links"><a href="https://www.youtube.com/@WBSC/streams" target="_blank" rel="noreferrer">WBSC 공식 중계 채널 ↗</a></div>
  </div></main>;
}
