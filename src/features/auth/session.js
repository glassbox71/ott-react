export function authErrorCode(error) {
  return typeof error?.code === 'string' && /^auth\/[a-z0-9-]+$/.test(error.code) ? error.code : 'auth/unknown';
}

export function authErrorMessage(error, context = 'google') {
  const code = error?.code || '';
  if (code === 'auth/configuration-missing') return '로그인 서비스 설정이 누락되었습니다. 운영 환경의 Firebase 설정을 확인해 주세요.';
  if (code === 'auth/unauthorized-domain') return '현재 사이트가 Firebase 로그인 승인 도메인에 등록되지 않았습니다. 운영자가 이 도메인을 추가해야 합니다.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') return context === 'guest'
    ? '게스트 채팅이 아직 활성화되지 않았습니다. 운영자가 Firebase Authentication의 익명 로그인을 활성화해야 합니다.'
    : '구글 로그인이 비활성화되어 있습니다. 운영자가 Firebase Authentication의 Google 제공자를 활성화해야 합니다.';
  if (code === 'auth/popup-blocked') return '브라우저가 로그인 팝업을 차단했습니다. 이 사이트의 팝업을 허용하고 다시 시도해 주세요.';
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code)) return '로그인 창이 닫혔습니다. 다시 시도할 수 있습니다.';
  if (['auth/invalid-api-key', 'auth/app-not-authorized', 'auth/auth-domain-config-required', 'auth/configuration-not-found'].includes(code)) return 'Firebase 인증 설정을 사용할 수 없습니다. API 키, 인증 도메인과 프로젝트 설정을 확인해 주세요.';
  if (code === 'auth/internal-error') return '로그인 창을 준비하지 못했습니다. 인증 서버 연결과 브라우저의 팝업·확장 프로그램 설정을 확인해 주세요.';
  if (code === 'auth/network-request-failed') return '인증 서버에 연결하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.';
  if (code === 'auth/guest-connection-pending') return '게스트 연결이 진행 중입니다. 잠시 후 구글 로그인을 다시 눌러 주세요.';
  if (code === 'auth/too-many-requests') return '인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  return context === 'guest' ? '게스트 채팅에 연결하지 못했습니다. 다시 연결해 주세요.' : '구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

export function profileFromAuth(user) {
  return {
    uid: user.uid, email: user.email || null,
    name: user.displayName || '회원', displayName: user.displayName || '회원',
    photoURL: user.photoURL || null, phone: user.phoneNumber || null,
    familyMembers: { 아빠: { likes: [], watchHistory: [] }, 엄마: { likes: [], watchHistory: [] }, 아들: { likes: [], watchHistory: [] }, 딸: { likes: [], watchHistory: [] } },
  };
}

const pendingGuests = new WeakMap();
const pendingGoogle = new WeakMap();

// Open the popup synchronously from the click, while preventing a slower guest
// sign-in from replacing a newly authenticated Google session.
export function startGoogleLogin(auth, signInGoogle) {
  if (pendingGuests.has(auth)) return Promise.reject(Object.assign(new Error('Guest connection pending'), { code: 'auth/guest-connection-pending' }));
  const pending = Promise.resolve(signInGoogle(auth)).finally(() => pendingGoogle.delete(auth));
  pendingGoogle.set(auth, pending);
  return pending;
}
export async function ensureChatIdentity(auth, signInGuest) {
  if (!auth) throw Object.assign(new Error('Firebase not configured'), { code: 'auth/configuration-missing' });
  await auth.authStateReady();
  const google = pendingGoogle.get(auth);
  if (google) { try { await google; } catch { /* A cancelled popup can return to guest chat. */ } }
  if (auth.currentUser) return auth.currentUser;
  if (!pendingGuests.has(auth)) {
    const pending = signInGuest(auth).then(result => result.user).finally(() => pendingGuests.delete(auth));
    pendingGuests.set(auth, pending);
  }
  return pendingGuests.get(auth);
}

export function chatDisplayName(user) {
  return user.isAnonymous ? `게스트 ${user.uid.slice(-6).toUpperCase()}` : (user.displayName || '야구 팬').slice(0, 30);
}
