// 헤드리스 Chrome 연결 — ui-kit 의 tests/cdp.mjs 를 이 프로젝트 시험용으로 옮긴 것.
// 디버깅 포트를 열지 않고 파이프(--remote-debugging-pipe)로만 붙는다: 이 맥에서는 tailscaled(userspace)가
// tailnet 연결을 127.0.0.1:<port> 로 넘겨, 포트를 열면 다른 기기가 이 Chrome 을 몰 수 있다.
// fd 3 = Chrome 으로, fd 4 = Chrome 에서. 메시지 하나가 \0 으로 끝난다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const candidates = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export async function openChrome() {
  const CHROME = findChrome();
  if (!CHROME) throw new Error('Chrome 이 없어요');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ytmp3-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const toChrome = chrome.stdio[3], fromChrome = chrome.stdio[4];
  let seq = 0, buf = '', session = null; const waiting = {}; const errors = [];
  fromChrome.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; continue; }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });
  const send = (method, params = {}, sid = session) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { delete waiting[id]; rej(new Error(method + ': 응답 없음')); }, 30000);
    waiting[id] = (m) => { clearTimeout(timer); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); };
    toChrome.write(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params }) + '\0');
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const view = async (w, h, mobile, dark) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  };
  // 진짜 누르기 — element.click() 이 아니라 그 자리에 마우스를 눌렀다 뗀다(가려져 있으면 다른 것이 눌린다)
  const tap = async (selector) => {
    const p = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
      e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) throw new Error(`누를 것이 없어요: ${selector}`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    }
  };
  const close = async () => {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 늦게 쓰는 파일이 남으면 임시 폴더라 둔다 */ }
  };
  await sleep(300);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }, null));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  return { send, ev, view, tap, close, errors };
}
