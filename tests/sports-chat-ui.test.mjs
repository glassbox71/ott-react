import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

// Exercise the real component in Chromium; only Firebase transport is simulated.
// Real SDK authorization and two-user delivery are covered by the emulator suite.
const sdk = `
export const auth = { currentUser: {uid:'guest-alice',isAnonymous:true} };
export const db = {};
export const onAuthStateChanged = (auth, next) => {queueMicrotask(()=>next(auth.currentUser)); return ()=>{};};
export const signInAnonymously = async () => ({user:auth.currentUser});
let nextId = 0, listener;
const pending = new Map();
export const collection = (_, ...path) => ({path:path.join('/')});
export const doc = (parent,...path) => ({path:path.length ? path.join('/') : parent.path+'/'+(++nextId), id:path.at(-1)||String(nextId)});
export const query = value => value;
export const orderBy = () => {};
export const limit = () => {};
export const serverTimestamp = () => ({});
export const deleteDoc = async () => {};
export const onSnapshot = (reference, options, next, error) => {
  if(reference.path.endsWith('/presence')) {queueMicrotask(()=>error({code:'permission-denied'}));return ()=>{};}
  listener = next;
  queueMicrotask(()=>next({docs:[],metadata:{fromCache:false}}));
  return ()=>{};
};
export const setDoc = (ref,data) => {
  if(ref.path.includes('/presence/')) return Promise.reject({code:'permission-denied'});
  return new Promise((resolve,reject)=>pending.set(ref.id,{resolve,reject,data}));
};
window.chatTransport = {
  cache() { listener({docs:[],metadata:{fromCache:true}}); },
  reject() {for(const [id,write] of pending) {write.reject({code:'permission-denied'});pending.delete(id);}listener({docs:[],metadata:{fromCache:false}});},
  acknowledge() {
    const docs=[...pending].map(([id,write])=>({id,metadata:{hasPendingWrites:false},data:()=>({...write.data,createdAt:{toMillis:()=>Date.now()}})}));
    window.chatTransport.deliver = () => listener({docs,metadata:{fromCache:false}});
    for(const write of pending.values()) write.resolve();
    pending.clear();
  },
  count:()=>pending.size
};`;

test('chat preserves pending/failed messages, retries once, and isolates presence failures', { timeout: 60000 }, async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { stdio: 'ignore' });
  let browser;
  try {
    const origin = 'http://127.0.0.1:5189';
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await fetch(origin).then(response => response.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
    assert.ok(executablePath, 'Chromium/Chrome is required; set CHROME_PATH');
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Chat UI exception:', error.message); });
    await page.route(`${origin}/chat-test-sdk.js`, route => route.fulfill({ contentType: 'application/javascript', body: sdk }));
    await page.route('**/src/features/sports/LiveChat.jsx*', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/from ["'][^"']*(?:firebase_auth\.js|firebase_firestore\.js|src\/firebase\/firebase\.js)[^"']*["']/g, 'from "/chat-test-sdk.js"');
      await route.fulfill({ response, body, contentType: 'application/javascript' });
    });
    await page.route(`${origin}/chat-test`, route => route.fulfill({ contentType: 'text/html', body: `
      <div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      await import('/src/pages/Sports.css');
      const reactModule=await import('/node_modules/.vite/deps/react.js');
      const React=reactModule.default||reactModule;
      const domModule=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {createRoot}=domModule.default||domModule;
      const {LiveChat}=await import('/src/features/sports/LiveChat.jsx');
      createRoot(document.getElementById('root')).render(React.createElement(LiveChat,{game:{id:'baseball-lounge'}}));
      </script>` }));
    await page.goto(`${origin}/chat-test`);
    await page.getByText('첫 번째 응원을 남겨 보세요 ⚾').waitFor();
    await page.getByText('접속자 집계 불가', { exact: true }).waitFor();
    const input = page.getByLabel('응원 메시지');
    assert.equal(await input.isEnabled(), true, 'presence denial must not disable chat');
    await input.fill('실패해도 보존되는 응원');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await page.getByText('전송 대기 중', { exact: false }).waitFor();
    await page.evaluate(() => window.chatTransport.cache());
    assert.equal(await page.getByText('실패해도 보존되는 응원', { exact: true }).count(), 1);
    await page.evaluate(() => window.chatTransport.reject());
    await page.getByText('메시지 저장 실패:', { exact: false }).waitFor();
    assert.equal(await page.getByText('실패해도 보존되는 응원', { exact: true }).count(), 1);
    assert.equal(await page.getByText('첫 번째 응원을 남겨 보세요 ⚾').count(), 0);
    await page.waitForTimeout(1600); // UI's send rate limit also applies to retries.
    await page.getByRole('button', { name: '다시 전송', exact: true }).click();
    await page.getByText('전송 대기 중', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.chatTransport.count()), 1);
    await page.evaluate(() => window.chatTransport.acknowledge());
    await page.getByText('전송 대기 중', { exact: false }).waitFor({ state: 'detached' });
    assert.equal(await page.getByText('실패해도 보존되는 응원', { exact: true }).count(), 1);
    await page.evaluate(() => window.chatTransport.deliver());
    assert.equal(await page.getByText('실패해도 보존되는 응원', { exact: true }).count(), 1, 'ack before snapshot must not drop or duplicate the message');
    assert.equal(await page.getByText('메시지 저장 실패:', { exact: false }).count(), 0);
    assert.equal(await page.getByText('접속자 상태 저장 실패:', { exact: false }).count(), 1, 'message snapshots must not clear presence errors');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await input.isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile chat must not overflow horizontally');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
});
