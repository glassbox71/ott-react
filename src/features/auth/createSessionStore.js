import { create } from 'zustand';
import { authErrorMessage, authErrorCode, profileFromAuth, startGoogleLogin } from './session.js';

export function createSessionStore({ auth, googleConfigured, watchAuth, signInGoogle, signOutUser, loadProfile }) {
  const pendingProfiles = new Map();
  return create((set, get) => {
    function applyIdentity(identity) {
      if (!identity || identity.isAnonymous) {
        set({ user: null, currentMember: null, authReady: true, profileWarning: '' });
        return;
      }
      const base = profileFromAuth(identity);
      set(state => ({ user: { ...(state.user?.uid === identity.uid ? state.user : {}), ...base }, currentMember: state.user?.uid === identity.uid ? state.currentMember : null, authReady: true }));
      if (!pendingProfiles.has(identity.uid)) {
        // Firestore profile loading must never hold the Google login/navigation open.
        const pending = Promise.resolve().then(() => loadProfile(identity));
        pendingProfiles.set(identity.uid, pending);
        pending.finally(() => pendingProfiles.delete(identity.uid)).catch(() => {});
      }
      pendingProfiles.get(identity.uid).then(profile => {
        if (auth.currentUser?.uid === identity.uid && !auth.currentUser.isAnonymous) {
          set({ user: { ...base, ...profile, uid: identity.uid }, profileWarning: '' });
        }
      }).catch(() => {
        if (auth.currentUser?.uid === identity.uid && !auth.currentUser.isAnonymous) {
          set({ profileWarning: '구글 로그인은 완료됐지만 회원 프로필을 동기화하지 못했습니다. 연결 상태와 프로필 접근 권한을 확인해 주세요. 찜 등 회원 데이터 기능은 제한될 수 있습니다.' });
        }
      });
    }
    return {
      user: null, currentMember: null, authReady: !auth, isLoggingIn: false, loginError: '', loginErrorCode: '', profileWarning: '',
      initializeAuth: () => auth ? watchAuth(auth, applyIdentity, error => set({ authReady: true, loginError: authErrorMessage(error), loginErrorCode: authErrorCode(error) })) : () => {},
      onSetMember: member => set({ currentMember: member }),
      onGoogleLogin: async () => {
        if (get().isLoggingIn) return null;
        if (!auth || !googleConfigured) { set({ loginError: authErrorMessage({ code: 'auth/configuration-missing' }), loginErrorCode: 'auth/configuration-missing' }); return null; }
        set({ isLoggingIn: true, loginError: '', loginErrorCode: '', profileWarning: '' });
        try {
          const result = await startGoogleLogin(auth, signInGoogle);
          applyIdentity(result.user);
          return result.user;
        } catch (error) { set({ loginError: authErrorMessage(error), loginErrorCode: authErrorCode(error) }); return null; }
        finally { set({ isLoggingIn: false }); }
      },
      onLogout: async () => {
        try {
          if (auth) await signOutUser(auth);
          set({ user: null, currentMember: null, profileWarning: '', loginError: '', loginErrorCode: '' });
        } catch (error) { set({ loginError: authErrorMessage(error), loginErrorCode: authErrorCode(error) }); }
      },
    };
  });
}
