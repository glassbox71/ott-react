import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { ensureChatIdentity, chatDisplayName, authErrorMessage } from '../auth/session';

export function LiveChat({ game }) {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const lastSent = useRef(0);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async identity => {
      if (!active) return;
      setUser(identity); setAuthError('');
      if (identity) return;
      try {
        const guest = await ensureChatIdentity(auth, signInAnonymously);
        if (active && auth.currentUser?.uid === guest.uid) setUser(guest);
      } catch (failure) { if (active) setAuthError(authErrorMessage(failure, 'guest')); }
    }, failure => { if (active) setAuthError(authErrorMessage(failure, 'guest')); });
    return () => { active = false; unsubscribe(); };
  }, [authAttempt]);
  useEffect(() => {
    if (!db || !user || game.preview) return;
    const room = ['sportsRooms', game.id];
    let confirmed = false;
    const connectionTimer = setTimeout(() => { if (!confirmed) setError('채팅 서버에 연결하지 못하고 있습니다. 네트워크와 채팅 서비스 설정을 확인해 주세요. 연결되면 자동으로 재개됩니다.'); }, 15000);
    const unsubscribe = onSnapshot(query(collection(db, ...room, 'messages'), orderBy('createdAt', 'desc'), limit(100)), { includeMetadataChanges: true }, snapshot => {
      setMessages(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse());
      confirmed = !snapshot.metadata.fromCache;
      setConnection(snapshot.metadata.fromCache ? null : `${user.uid}:${game.id}`);
      setError('');
    }, () => { setError('채팅에 연결하지 못했습니다. Firebase 권한과 네트워크를 확인해 주세요.'); setConnection(null); });
    // A per-tab presence entry expires after 90 seconds, including closed/crashed tabs.
    const presence = doc(collection(db, ...room, 'presence'));
    let active = true;
    const heartbeat = () => setDoc(presence, { uid: user.uid, lastSeen: serverTimestamp() }).catch(() => {
      if (active) setError('접속자 상태를 동기화하지 못했습니다.');
    });
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    let entries = [];
    const updateCount = () => setViewers(new Set(entries.filter(item => item.lastSeen?.toMillis() > Date.now() - 90000).map(item => item.uid)).size);
    const unsubscribePresence = onSnapshot(query(collection(db, ...room, 'presence'), orderBy('lastSeen', 'desc'), limit(500)), snapshot => {
      entries = snapshot.docs.map(item => item.data()); updateCount();
    }, () => setError('접속자 정보를 불러오지 못했습니다.'));
    const countTimer = setInterval(updateCount, 15000);
    return () => {
      active = false; clearTimeout(connectionTimer); clearInterval(timer); clearInterval(countTimer);
      unsubscribe(); unsubscribePresence(); deleteDoc(presence).catch(() => {});
    };
  }, [game.id, game.preview, user]);
  useEffect(() => {
    const container = bottom.current?.parentElement;
    if (container && messages.length) container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !connected || sending || !user) return;
    if (Date.now() - lastSent.current < 1500) { setError('잠시 후 다시 보내 주세요.'); return; }
    setSending(true); setError(''); lastSent.current = Date.now();
    try {
      await addDoc(collection(db, 'sportsRooms', game.id, 'messages'), {
        uid: user.uid, name: chatDisplayName(user), text: body.slice(0, 300), createdAt: serverTimestamp(),
      });
      setText('');
    } catch { setError('메시지를 보내지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSending(false); }
  }
  const connected = Boolean(user && connection === `${user.uid}:${game.id}`);
  const enabled = connected && user && !game.preview;
  return <aside className="sports-chat" aria-label="경기 실시간 채팅">
    <div className="sports-chat-heading"><h2>함께 응원해요 <span className="sports-live-dot" /></h2><span>{connected && user ? `${viewers}명 접속` : '연결 대기'}</span></div>
    <p className="sports-chat-notice">로그인 없이 게스트로 참여할 수 있습니다. 서로 존중하며 응원해 주세요.{user?.isAnonymous && <span className="block mt-1">내 이름: {chatDisplayName(user)}</span>}</p>
    <div className="sports-messages" role="log" aria-live="polite" aria-relevant="additions">
      {!db ? <p className="sports-empty">Firebase 연결 설정 후 실시간 채팅을 이용할 수 있습니다.</p>
        : game.preview ? <p className="sports-empty">미리보기 경기입니다. 실제 경기를 선택하면 응원방이 열립니다.</p>
        : !user ? <p className="sports-empty">{authError ? '게스트 연결을 완료하지 못했습니다.' : '게스트로 채팅에 연결하고 있습니다…'}</p>
        : !connected ? <p className="sports-empty">채팅 서버에 연결하고 있습니다…</p>
        : !messages.length ? <p className="sports-empty">첫 번째 응원을 남겨 보세요 ⚾</p> : null}
      {user && connected && messages.map(message => <div key={message.id} className={`sports-message ${message.uid === user?.uid ? 'is-mine' : ''}`}>
        <span className="sports-avatar">{message.name?.slice(0, 1) || '팬'}</span><div><strong>{message.name}</strong><p>{message.text}</p></div>
      </div>)}<div ref={bottom} />
    </div>
    {authError && <div className="sports-error" role="alert"><p>{authError}</p><button className="underline mt-2" onClick={() => setAuthAttempt(value => value + 1)}>게스트로 다시 연결</button></div>}
    {error && <p className="sports-error" role="alert">{error}</p>}
    <form onSubmit={send} className="sports-chat-form">
      <label className="sports-sr-only" htmlFor="sports-message">응원 메시지</label>
      <input id="sports-message" value={text} onChange={event => setText(event.target.value)} maxLength={300} disabled={!enabled || sending} placeholder={enabled ? '응원 메시지를 입력하세요' : '연결 후 채팅할 수 있습니다'} autoComplete="off" />
      <button disabled={!enabled || sending || !text.trim()} type="submit">{sending ? '전송 중' : '전송'}</button>
    </form>
  </aside>;
}
