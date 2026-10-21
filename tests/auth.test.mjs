import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/features/auth/createSessionStore.js';
import { ensureChatIdentity, chatDisplayName, authErrorMessage, startGoogleLogin } from '../src/features/auth/session.js';

const member = { uid: 'member-1', displayName: '회원', email: 'member@example.test', isAnonymous: false };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const auth = { currentUser: null };
  let listener;
  const store = createSessionStore({ auth, googleConfigured: true,
    watchAuth: (_auth, callback) => { listener = callback; return () => { listener = null; }; },
    signInGoogle: async () => { auth.currentUser = member; return { user: member }; },
    signOutUser: async () => { auth.currentUser = null; },
    loadProfile: async () => ({ name: '저장된 이름' }), ...overrides,
  });
  return { store, auth, emit: identity => { auth.currentUser = identity; listener(identity); } };
}
test('Google login completes even while Firestore profile loading is unresolved', async () => {
  const { store } = fixture({ loadProfile: () => new Promise(() => {}) });
  const result = await Promise.race([store.getState().onGoogleLogin(), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Login waited for Firestore')), 200); timer.unref(); })]);
  assert.equal(result.uid, member.uid); assert.equal(store.getState().user.uid, member.uid);
  assert.equal(store.getState().isLoggingIn, false);
});
test('Firestore permission failure preserves authenticated membership and shows a warning', async () => {
  const { store } = fixture({ loadProfile: async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); } });
  await store.getState().onGoogleLogin(); await flush();
  assert.equal(store.getState().user.uid, member.uid);
  assert.equal(store.getState().loginError, ''); assert.ok(store.getState().profileWarning.includes('로그인은 완료'));
});
test('popup and authorized-domain failures are visible and release the login button', async () => {
  for (const [code, text] of [['auth/popup-blocked', '팝업'], ['auth/unauthorized-domain', '승인 도메인']]) {
    const { store } = fixture({ signInGoogle: async () => { throw { code }; } });
    assert.equal(await store.getState().onGoogleLogin(), null);
    assert.ok(store.getState().loginError.includes(text)); assert.equal(store.getState().loginErrorCode, code); assert.equal(store.getState().isLoggingIn, false);
  }
});
test('missing auth configuration prevents an invalid popup call', async () => {
  let called = false;
  const { store } = fixture({ googleConfigured: false, signInGoogle: async () => { called = true; } });
  assert.equal(await store.getState().onGoogleLogin(), null); assert.equal(called, false);
  assert.ok(store.getState().loginError.includes('설정'));
});
test('session restoration supports members but never treats anonymous guests as Google members', async () => {
  const fixtureState = fixture(); const { store } = fixtureState;
  const unsubscribe = store.getState().initializeAuth();
  fixtureState.emit(member); await flush(); assert.equal(store.getState().user.uid, member.uid);
  fixtureState.emit({ uid: 'guest-1', isAnonymous: true });
  assert.equal(store.getState().user, null); assert.equal(store.getState().authReady, true);
  unsubscribe();
});
test('a profile response arriving after logout does not restore the old user', async () => {
  let resolveProfile;
  const { store } = fixture({ loadProfile: () => new Promise(resolve => { resolveProfile = resolve; }) });
  await store.getState().onGoogleLogin(); await store.getState().onLogout();
  resolveProfile({ name: 'Late profile' }); await flush();
  assert.equal(store.getState().user, null);
});
test('simultaneous guest joins share one anonymous authentication request', async () => {
  const auth = { currentUser: null, authStateReady: async () => {} }; let calls = 0; let resolve;
  const signIn = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = ensureChatIdentity(auth, signIn); const second = ensureChatIdentity(auth, signIn);
  await flush(); const guest = { uid: 'guest-abc123', isAnonymous: true };
  auth.currentUser = guest; resolve({ user: guest });
  assert.equal(await first, guest); assert.equal(await second, guest); assert.equal(calls, 1);
  assert.equal(chatDisplayName(guest), '게스트 ABC123');
});
test('existing Google identities are reused without signing in anonymously', async () => {
  const auth = { currentUser: member, authStateReady: async () => {} };
  const result = await ensureChatIdentity(auth, () => { throw new Error('Should not run'); });
  assert.equal(result, member);
});
test('failed anonymous authentication can be retried and disabled providers are explained', async () => {
  const auth = { currentUser: null, authStateReady: async () => {} };
  const disabled = Object.assign(new Error('Disabled'), { code: 'auth/operation-not-allowed' });
  await assert.rejects(ensureChatIdentity(auth, async () => { throw disabled; }));
  const guest = { uid: 'retry-guest', isAnonymous: true };
  assert.equal(await ensureChatIdentity(auth, async () => ({ user: guest })), guest);
  assert.ok(authErrorMessage(disabled, 'guest').includes('익명 로그인'));
});

test('a pending guest login cannot race with a Google popup and replace its user', async () => {
  const auth = { currentUser: null, authStateReady: async () => {} }; let finishGuest; let googleCalls = 0;
  const guest = ensureChatIdentity(auth, () => new Promise(resolve => { finishGuest = resolve; }));
  await flush();
  await assert.rejects(startGoogleLogin(auth, async () => { googleCalls++; return { user: member }; }), { code: 'auth/guest-connection-pending' });
  assert.equal(googleCalls, 0);
  const identity = { uid: 'guest', isAnonymous: true }; auth.currentUser = identity; finishGuest({ user: identity }); await guest;
});
test('guest setup waits for an active Google popup and reuses its result', async () => {
  const auth = { currentUser: null, authStateReady: async () => {} }; let finishGoogle;
  const google = startGoogleLogin(auth, () => new Promise(resolve => { finishGoogle = resolve; }));
  const guest = ensureChatIdentity(auth, () => { throw new Error('Should not sign in as guest'); });
  auth.currentUser = member; finishGoogle({ user: member });
  await google; assert.equal(await guest, member);
});
