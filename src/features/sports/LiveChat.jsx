import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { chatFailure, visibleMessages } from './chat';
import { ensureChatIdentity, chatDisplayName, authErrorMessage } from '../auth/session';

export function LiveChat({ game }) {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [viewers, setViewers] = useState(null);
  const [sendNotice, setSendNotice] = useState('');
  const [outbox, setOutbox] = useState([]);
  const [presenceReadError, setPresenceReadError] = useState('');
  const [presenceWriteError, setPresenceWriteError] = useState('');
  const [offline, setOffline] = useState(false);
  const [chatAttempt, setChatAttempt] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);
  const bottom = useRef(null);
  const lastSent = useRef(0);
  const savedMessageIds = useRef(new Set());
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
    let active = true;
    const connectionTimer = setTimeout(() => { if (active && !confirmed) setError('채팅 서버 응답 대기 중입니다. 네트워크와 Firestore 설정을 확인해 주세요.'); }, 15000);
    const unsubscribe = onSnapshot(query(collection(db, ...room, 'messages'), orderBy('createdAt', 'desc'), limit(100)), { includeMetadataChanges: true }, snapshot => {
      if (!active) return;
      setMessages(snapshot.docs.map(item => {
        const data = item.data({ serverTimestamps: 'estimate' });
        return { ...data, id: item.id, createdAtMs: data.createdAt?.toMillis() || 0, status: item.metadata.hasPendingWrites ? 'pending' : 'saved' };
      }).reverse());
      const savedIds = new Set(snapshot.docs.filter(item => !item.metadata.hasPendingWrites).map(item => item.id));
      savedMessageIds.current = savedIds;
      setOutbox(items => items.filter(item => item.status !== 'saved' || !savedIds.has(item.id)));
      setOffline(snapshot.metadata.fromCache);
      if (!snapshot.metadata.fromCache) {
        confirmed = true;
        clearTimeout(connectionTimer);
        setConnection(`${user.uid}:${game.id}`);
        setError('');
      }
    }, failure => {
      if (!active) return;
      clearTimeout(connectionTimer);
      setError(chatFailure(failure, '메시지 조회 실패'));
      setConnection(null);
    });
    // Presence failure must never hide messages or block message sending.
    const presence = doc(collection(db, ...room, 'presence'));
    let heartbeatPending = false;
    const heartbeat = async () => {
      if (heartbeatPending) return;
      heartbeatPending = true;
      try {
        await setDoc(presence, { uid: user.uid, lastSeen: serverTimestamp() });
        if (active) setPresenceWriteError('');
      } catch (failure) {
        if (active) setPresenceWriteError(chatFailure(failure, '접속자 상태 저장 실패'));
      } finally { heartbeatPending = false; }
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    let entries = [];
    let presenceAvailable = false;
    const updateCount = () => setViewers(presenceAvailable ? new Set(entries.filter(item => item.lastSeen?.toMillis() > Date.now() - 90000).map(item => item.uid)).size : null);
    const unsubscribePresence = onSnapshot(query(collection(db, ...room, 'presence'), orderBy('lastSeen', 'desc'), limit(500)), { includeMetadataChanges: true }, snapshot => {
      if (!active) return;
      entries = snapshot.docs.map(item => item.data());
      presenceAvailable = !snapshot.metadata.fromCache;
      if (presenceAvailable) setPresenceReadError('');
      updateCount();
    }, failure => {
      if (!active) return;
      presenceAvailable = false;
      setViewers(null);
      setPresenceReadError(chatFailure(failure, '접속자 조회 실패'));
    });
    const countTimer = setInterval(updateCount, 15000);
    return () => {
      active = false;
      clearTimeout(connectionTimer); clearInterval(timer); clearInterval(countTimer);
      unsubscribe(); unsubscribePresence(); deleteDoc(presence).catch(() => {});
    };
  }, [game.id, game.preview, user, chatAttempt]);
  useEffect(() => {
    const container = bottom.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, outbox]);

  function handleSendMessage(body, existing) {
    if (!connected || !user) return;
    if (Date.now() - lastSent.current < 1500) { setSendNotice('잠시 후 다시 보내 주세요.'); return; }
    setSendNotice('');
    lastSent.current = Date.now();
    const reference = existing ? doc(db, 'sportsRooms', game.id, 'messages', existing.id) : doc(collection(db, 'sportsRooms', game.id, 'messages'));
    const draft = { id: reference.id, uid: user.uid, name: chatDisplayName(user), text: body.slice(0, 300), createdAtMs: Date.now(), status: 'pending' };
    setOutbox(items => [...items.filter(item => item.id !== draft.id), draft]);
    if (!existing) setText('');
    // Retain the draft until the server acknowledges it, including while offline.
    setDoc(reference, { uid: draft.uid, name: draft.name, text: draft.text, createdAt: serverTimestamp() }).then(() => {
      setOutbox(items => savedMessageIds.current.has(draft.id) ? items.filter(item => item.id !== draft.id) : items.map(item => item.id === draft.id ? { ...item, status: 'saved' } : item));
    }).catch(failure => {
      setOutbox(items => items.map(item => item.id === draft.id ? { ...item, status: 'failed', error: chatFailure(failure, '메시지 저장 실패') } : item));
    });
  }
  function retry(event) {
    const draft = outbox.find(item => item.id === event.currentTarget.dataset.message);
    if (draft) handleSendMessage(draft.text, draft);
  }
  function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (body) handleSendMessage(body);
  }
  const connected = Boolean(user && connection === `${user.uid}:${game.id}`);
  const enabled = connected && user && !game.preview;
  const displayedMessages = visibleMessages(messages, outbox).filter(message => message.uid === user?.uid || !message.status || message.status === 'saved');
  const presenceError = presenceWriteError || presenceReadError;
  return <aside className="sports-chat" aria-label="경기 실시간 채팅">
    <div className="sports-chat-heading"><h2>함께 응원해요 <span className="sports-live-dot" /></h2><span>{connected && user ? presenceError || viewers === null ? '접속자 집계 불가' : `${viewers}명 접속` : '연결 대기'}</span></div>
    <p className="sports-chat-notice">로그인 없이 게스트로 참여할 수 있습니다. 서로 존중하며 응원해 주세요.{user?.isAnonymous && <span className="block mt-1">내 이름: {chatDisplayName(user)}</span>}</p>
    <div className="sports-messages" role="log" aria-live="polite" aria-relevant="additions">
      {!db ? <p className="sports-empty">Firebase 연결 설정 후 실시간 채팅을 이용할 수 있습니다.</p>
        : game.preview ? <p className="sports-empty">미리보기 경기입니다. 실제 경기를 선택하면 응원방이 열립니다.</p>
        : !user ? <p className="sports-empty">{authError ? '게스트 연결을 완료하지 못했습니다.' : '게스트로 채팅에 연결하고 있습니다…'}</p>
        : !connected && !displayedMessages.length ? <p className="sports-empty">채팅 서버에 연결하고 있습니다…</p>
        : !displayedMessages.length ? <p className="sports-empty">첫 번째 응원을 남겨 보세요 ⚾</p> : null}
      {user && displayedMessages.map(message => <div key={message.id} className={`sports-message ${message.uid === user?.uid ? 'is-mine' : ''}`}>
        <span className="sports-avatar">{message.name?.slice(0, 1) || '팬'}</span><div><strong>{message.name}</strong><p>{message.text}</p>
          {message.status === 'pending' && <small className="sports-message-status" role="status">전송 대기 중 · 아직 서버에 저장되지 않았습니다</small>}
          {message.status === 'failed' && <div role="alert"><small className="sports-message-status is-failed">{message.error} 미저장 메시지는 이 화면에만 보관됩니다.</small><button type="button" className="block underline" disabled={!enabled} data-message={message.id} onClick={retry}>다시 전송</button></div>}
        </div>
      </div>)}<div ref={bottom} />
    </div>
    {authError && <div className="sports-error" role="alert"><p>{authError}</p><button className="underline mt-2" onClick={() => setAuthAttempt(value => value + 1)}>게스트로 다시 연결</button></div>}
    {offline && connected && <p className="sports-chat-notice" role="status">서버 동기화 대기 중입니다. 보관된 메시지를 표시하며, 전송 대기 메시지는 연결 후 저장됩니다.</p>}
    {presenceError && <p className="sports-error" role="alert">{presenceError} 접속자 집계와 메시지 전송은 별도로 처리됩니다.</p>}
    {sendNotice && <p className="sports-error" role="status">{sendNotice}</p>}
    {error && <p className="sports-error" role="alert">{error}</p>}
    {user && db && !game.preview && <button type="button" className="underline text-sm mb-2" onClick={() => setChatAttempt(value => value + 1)}>채팅 연결 다시 확인</button>}
    <form onSubmit={send} className="sports-chat-form">
      <label className="sports-sr-only" htmlFor="sports-message">응원 메시지</label>
      <input id="sports-message" value={text} onChange={event => setText(event.target.value)} maxLength={300} disabled={!enabled} placeholder={enabled ? '응원 메시지를 입력하세요' : '연결 후 채팅할 수 있습니다'} autoComplete="off" />
      <button disabled={!enabled || !text.trim()} type="submit">전송</button>
    </form>
  </aside>;
}
