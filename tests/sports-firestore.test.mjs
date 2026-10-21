import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
test('two-user chat, room isolation and Firestore authorization', { skip: !emulator, timeout: 30000 }, async t => {
  const split = emulator.lastIndexOf(':');
  const rules = await readFile(new URL('../docs/sports-firestore.rules', import.meta.url), 'utf8');
  const environment = await initializeTestEnvironment({
    projectId: 'demo-ott-sports', firestore: {
      host: emulator.slice(0, split), port: Number(emulator.slice(split + 1)),
      rules: `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { ${rules} } }`,
    },
  });
  try {
    await environment.clearFirestore();
    const alice = environment.authenticatedContext('alice').firestore();
    const bob = environment.authenticatedContext('bob').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    const room = 'baseball-youtube-example';
    const message = text => ({ uid: 'alice', name: '야구 팬 A', text, createdAt: serverTimestamp() });
    let saved;
    await t.test('a second authenticated client receives a message through a real snapshot subscription', async () => {
      let unsubscribe;
      let timer;
      const received = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('No realtime message arrived')), 10000);
        unsubscribe = onSnapshot(query(collection(bob, 'sportsRooms', room, 'messages'), orderBy('createdAt')), snapshot => {
          if (snapshot.docs.some(item => item.data().text === '함께 응원해요!')) resolve(snapshot.docs);
        }, reject);
      });
      try {
        saved = await addDoc(collection(alice, 'sportsRooms', room, 'messages'), message('함께 응원해요!'));
        const documents = await received;
        assert.equal(documents[0].data().uid, 'alice');
        assert.ok(documents[0].data().createdAt);
      } finally { clearTimeout(timer); unsubscribe?.(); }
    });
    await t.test('a different game has an isolated message collection', async () => {
      const other = await getDocs(collection(bob, 'sportsRooms', 'baseball-youtube-another', 'messages'));
      assert.equal(other.size, 0);
    });
    await t.test('anonymous readers and forged sender IDs are rejected', async () => {
      await assertFails(getDocs(collection(anonymous, 'sportsRooms', room, 'messages')));
      await assertFails(addDoc(collection(alice, 'sportsRooms', room, 'messages'), { ...message('spoof'), uid: 'bob' }));
      await assertFails(addDoc(collection(alice, 'sportsRooms', room, 'messages'), message('x'.repeat(301))));
    });
    await t.test('clients cannot edit or delete submitted messages', async () => {
      assert.ok(saved);
      await assertFails(updateDoc(saved, { text: 'changed' }));
      await assertFails(deleteDoc(saved));
    });
    await t.test('presence allows another viewer to read but only the owner may remove a session', async () => {
      const presence = doc(alice, 'sportsRooms', room, 'presence', 'alice-session');
      await assertSucceeds(setDoc(presence, { uid: 'alice', lastSeen: serverTimestamp() }));
      const viewers = await getDocs(collection(bob, 'sportsRooms', room, 'presence'));
      assert.equal(viewers.docs[0].data().uid, 'alice');
      await assertFails(deleteDoc(doc(bob, 'sportsRooms', room, 'presence', 'alice-session')));
      await assertSucceeds(deleteDoc(presence));
    });
  } finally { await environment.cleanup(); }
});
