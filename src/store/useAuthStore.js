import { auth, db, googleProvider, googleLoginConfigured } from '../firebase/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createSessionStore } from '../features/auth/createSessionStore';
import { profileFromAuth } from '../features/auth/session';

export const useAuthStore = createSessionStore({
  auth, googleConfigured: googleLoginConfigured, watchAuth: onAuthStateChanged,
  signInGoogle: instance => signInWithPopup(instance, googleProvider), signOutUser: signOut,
  loadProfile: async user => {
    if (!db) throw new Error('Profile service is unavailable');
    const reference = doc(db, 'users', user.uid);
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) return snapshot.data();
    const profile = profileFromAuth(user);
    await setDoc(reference, profile);
    return profile;
  },
});
