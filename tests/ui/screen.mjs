// ytmp3 웹 화면 자동 점검 — 폭(390·768·1440) × 라이트·다크 × 화면 넷(받기·받은 곡·편집기·잘라낸 곡).
//   node tests/ui/screen.mjs <서버 주소>     (서버는 --test-mode 로 띄운다 — 소리가 나가지 않게)
// 결과는 JSON 한 줄: { failures: [...], checked: {...} }. 실패가 있어도 종료 코드는 0 — 판정은 pytest 가 한다.
// 기준 (ui-kit docs/PRINCIPLES.md · WCAG 2.2):
//   - 누르는 영역: 모든 것 24×24 이상, 주 동작(.ui-primary·.ui-l·.ui-xl) 높이 48 이상
//   - 가로 넘침 없음
//   - 글자 대비: 실제 칠해진 글자색을 배경 위에 합성해 4.5 이상 (큰 글자 24px·굵은 18.66px 이상은 3). 비활성은 뺀다
//   - 흐름: (390) 목록 → 편집기 → 뒤로, 편집기 소리는 꺼져 있음
//   - 화면 전환: 누름 하나에 전환 하나(tab·forward·back, 브라우저 뒤로 가기 포함), update 한 번씩, 동작 줄이기에서는 움직임 없음
import { openChrome, sleep } from './cdp.mjs';

const BASE = process.argv[2];
if (!BASE) { console.error('사용: node tests/ui/screen.mjs <서버 주소>'); process.exit(2); }

const SIZES = [
  { name: '390', w: 390, h: 844, mobile: true },
  { name: '768', w: 768, h: 1024, mobile: true },
  { name: '1440', w: 1440, h: 900, mobile: false },
];

// 페이지 안에서 도는 측정. 색은 1px 캔버스에 칠해 읽는다 — rgb·oklch·color-mix 무엇이든 실제 칠해진 값.
const AUDIT = String.raw`(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden]'); };
  const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.id || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24);

  // 배경: 바깥(캔버스)부터 안쪽으로 반투명까지 합성. 바탕 그림(그라데이션)이 있으면 잴 수 없다고 적는다.
  const pageBg = (() => { for (const e of [document.body, document.documentElement]) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) return over(c, [255, 255, 255, 1]); }
    return matchMedia('(prefers-color-scheme: dark)').matches ? [18, 18, 18, 1] : [255, 255, 255, 1]; })();
  const bgOf = (el) => { const chain = []; let image = false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') image = true; chain.push(rgba(s.backgroundColor)); }
    let c = pageBg; for (const layer of chain.reverse()) if (layer[3] > 0) c = over(layer, c); return { c, image }; };
  const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };

  const out = { targets: 0, texts: 0, small: [], primary: [], contrast: [], unmeasured: [] };
  const doc = document.documentElement;
  out.overflow = doc.scrollWidth > doc.clientWidth + 1 ? doc.scrollWidth - doc.clientWidth : 0;

  for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, audio[controls], [role=button], [tabindex]:not([tabindex="-1"])')) {
    if (!shown(e)) continue;
    out.targets++;
    const r = e.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) out.small.push(name(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (e.matches('.ui-primary, .ui-l, .ui-xl') && r.height < 48) out.primary.push(name(e) + ' ' + Math.round(r.height));
  }
  for (const e of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'AUDIO', 'CANVAS', 'svg'].includes(e.tagName) || e.closest('svg') || !shown(e)) continue;
    const isInput = e.matches('input:not([type=hidden]), textarea') && e.value;
    if (!isInput && ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (e.closest(':disabled, [aria-disabled=true]')) continue;   // 비활성은 WCAG 대비 기준에서 빠진다
    out.texts++;
    const s = getComputedStyle(e);
    const { c: bg, image } = bgOf(e);
    if (image) { out.unmeasured.push(name(e)); continue; }
    const fg0 = rgba(s.color); fg0[3] *= opacity(e);
    const fg = over(fg0, bg);
    const size = parseFloat(s.fontSize), weight = parseInt(s.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5, got = ratio(fg, bg);
    if (got < need) out.contrast.push(name(e) + ' ' + got.toFixed(2) + ' < ' + need);
  }
  return out;
})()`;

const failures = [];
const checked = { pages: 0, targets: 0, texts: 0, flows: 0 };
const fail = (where, what) => failures.push(`${where}: ${what}`);

const c = await openChrome();
const until = async (expr, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await c.ev(expr)) return true; await sleep(100); }
  return false;
};

let loads = 0;
async function open(hash) {
  // 매번 새로 읽는다 — 주소의 # 만 바꾸면 같은 문서라 앞 화면의 상태가 남는다
  await c.send('Page.navigate', { url: `${BASE}/?load=${++loads}#${hash}` });
  await until("document.readyState === 'complete' && document.fonts.status === 'loaded' && !!window.UI");
  if (!await until("!document.getElementById('testmode').hidden")) fail(hash, '시험 모드 띠가 없다 — 서버를 --test-mode 로 띄울 것');
}

async function audit(where) {
  await sleep(250);  // 키트의 시트·전환이 끝나게
  const r = await c.ev(AUDIT);
  checked.pages++; checked.targets += r.targets; checked.texts += r.texts;
  if (!r.targets || !r.texts) fail(where, `잴 것이 없다 (누를 것 ${r.targets}, 글 ${r.texts})`);
  if (r.overflow) fail(where, `가로 넘침 ${r.overflow}px`);
  for (const x of r.small) fail(where, `24 미만: ${x}`);
  for (const x of r.primary) fail(where, `주 동작 48 미만: ${x}`);
  for (const x of r.contrast) fail(where, `대비 부족: ${x}`);
  for (const x of r.unmeasured) fail(where, `배경 그림이라 대비를 못 잼: ${x}`);
}

try {
  for (const size of SIZES) {
    for (const dark of [false, true]) {
      const tag = `${size.name}/${dark ? '다크' : '라이트'}`;
      await c.view(size.w, size.h, size.mobile, dark);
      await open('get');
      if (await c.ev("document.documentElement.dataset.uiMode || ''") !== (dark ? 'dark' : 'light') &&
          await c.ev('UI.isDark()') !== dark) fail(tag, '테마가 시스템 설정을 따르지 않는다');
      await until("document.querySelectorAll('#jobs article').length >= 2");
      await audit(`${tag}/받기`);

      await open('songs');
      await until("document.querySelectorAll('#songs [data-ui-detail]').length > 0");
      await audit(`${tag}/받은 곡`);

      await c.tap('#songs [data-ui-detail]');
      if (!await until("!document.getElementById('editor').hidden && document.getElementById('waveMsg').hidden")) fail(tag, '편집기가 열리지 않거나 파형을 못 읽었다');
      await audit(`${tag}/편집기`);

      await open('cuts');
      await until("document.querySelectorAll('#cuts article').length > 0");
      await audit(`${tag}/잘라낸 곡`);
    }
  }

  // 흐름: 폰 폭에서 목록 → 편집기 → 뒤로
  await c.view(390, 844, true, false);
  await open('songs');
  await until("document.querySelectorAll('#songs [data-ui-detail]').length > 0");
  const ld = "document.getElementById('songsLD')";
  if (await c.ev(`${ld}.dataset.uiView === 'detail'`)) fail('흐름', '처음부터 편집기가 열려 있다');
  await c.tap('#songs [data-ui-detail]');
  if (!await until(`${ld}.dataset.uiView === 'detail' && getComputedStyle(document.querySelector('.ui-list-pane')).display === 'none'`)) fail('흐름', '행을 눌러도 편집기로 넘어가지 않는다');
  if (!await until("document.getElementById('waveMsg').hidden && !document.getElementById('doCut').disabled")) fail('흐름', '편집기에 파형이 안 나온다');
  await c.tap('#preview');
  await sleep(300);
  if (!await c.ev("document.getElementById('edAudio').muted")) fail('흐름', '시험 모드인데 편집기 소리가 켜져 있다');
  await c.tap('#preview');
  await c.tap('[data-ui-back]');
  if (!await until(`${ld}.dataset.uiView !== 'detail' && getComputedStyle(document.querySelector('.ui-list-pane')).display !== 'none'`)) fail('흐름', '뒤로를 눌러도 목록으로 돌아오지 않는다');
  if (!await c.ev("document.getElementById('edAudio').paused")) fail('흐름', '목록으로 돌아왔는데 소리가 계속 난다');
  checked.flows++;

  // 화면 전환 (ui-kit 0.4): 하단바 tab 은 이 화면이(UI.transition), 목록-상세의 forward·back(뒤로 버튼·브라우저 뒤로 가기)은 키트가 한다.
  // 본다: 누름 하나에 전환 하나(두 군데서 감싸면 둘), 종류가 맞는지, popstate 에도 전환, 이 화면이 감싼 update 는 한 번,
  //       동작 줄이기에서는 움직임 없음.
  // - 전환 횟수·종류: 키트가 전환하는 동안 <html data-ui-go="종류"> 를 단다 — 달릴 때마다 적는다(누가 불렀든).
  // - update 횟수: ui-kit 은 UI 를 얼려 두어(Object.freeze) 나중에 감쌀 수 없다 — 문서가 생길 때 window.UI 를 받아
  //   transition 만 감싼 대리자를 준다(이 화면이 부른 것만 잡힌다. 키트 안의 전환은 키트 시험 몫).
  // - 움직임: 키프레임 사이에 값이 바뀌는 이동 속성만 센다 — 브라우저 기본 view-transition-group(root) 은 값이 그대로다.
  const HOOK = `(() => {
    window.__tx = []; window.__go = []; window.__anims = []; window.__views = 0;
    let real = null, proxy = null;
    const wrap = (update, opts = {}) => { const rec = { type: opts.type, calls: 0 }; window.__tx.push(rec);
      return real.transition(() => { rec.calls++; return update(); }, opts); };
    Object.defineProperty(window, 'UI', { configurable: true,
      get: () => proxy,
      set: (v) => { real = v; proxy = new Proxy({}, { get: (_, k) => (k === 'transition' ? wrap : v[k]), has: (_, k) => k in v }); } });
    // 이 스크립트가 도는 때에는 <html> 이 아직 없다 — 문서 전체를 보고 <html> 의 것만 센다
    new MutationObserver((ms) => { for (const m of ms) { if (m.target !== document.documentElement) continue;
        const v = m.target.dataset.uiGo; if (v && v !== m.oldValue) window.__go.push(v); } })
      .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-ui-go'], attributeOldValue: true });
    const seen = new Set();
    const sample = () => { for (const a of document.getAnimations()) { if (seen.has(a)) continue; seen.add(a);
        const frames = a.effect?.getKeyframes?.() || [], props = new Set();
        for (const k of frames) for (const p of Object.keys(k))
          if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p) && new Set(frames.map((f) => String(f[p] ?? ''))).size > 1) props.add(p);
        window.__anims.push({ name: a.animationName || a.id || '', on: (a.effect?.target?.id || a.effect?.target?.className || a.effect?.target?.tagName || '') + (a.effect?.pseudoElement || ''), props: [...props] }); }
      requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
    addEventListener('DOMContentLoaded', () => document.getElementById('songsLD')?.addEventListener('ui:view', () => window.__views++));
  })()`;
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  // n 번째 전환이 시작되고(주소 바뀜·popstate 는 비동기) 키트가 끝낼 때까지. 끝난 뒤 더 오는 전환이 있으면 다음 판정이 잡는다
  const settle = (n) => until(`window.__go.length >= ${n} && window.__tx.every((t) => t.calls > 0) && !document.documentElement.dataset.uiGo`, 3000).then(() => sleep(250));
  const MOVES = ['transform', 'translate', 'scale', 'rotate'];
  const view = "document.getElementById('songsLD').dataset.uiView";
  for (const reduce of [false, true]) {
    const tag = `전환${reduce ? '(동작 줄이기)' : ''}`;
    await c.view(390, 844, true, false);
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
    await open('get');
    const steps = [];
    const step = async (name, act, n, ok) => { await act(); await settle(n); steps.push([name, await c.ev(ok)]); };
    await step('하단바 → 받은 곡', () => c.tap('.ui-tabbar [data-ui-nav-id="songs"]'), 1, "!document.getElementById('view-songs').hidden");
    await until("document.querySelectorAll('#songs [data-ui-detail]').length > 0");
    await step('행 → 편집기', () => c.tap('#songs [data-ui-detail]'), 2, `${view} === 'detail'`);
    await step('뒤로 버튼', () => c.tap('#editor .back'), 3, `${view} !== 'detail'`);
    await step('행 → 편집기 (다시)', () => c.tap('#songs [data-ui-detail]'), 4, `${view} === 'detail'`);
    await step('브라우저 뒤로 가기', () => c.ev('history.back()'), 5, `${view} !== 'detail'`);
    await step('하단바 → 받기', () => c.tap('.ui-tabbar [data-ui-nav-id="get"]'), 6, "!document.getElementById('view-get').hidden");
    const r = await c.ev("({ tx: window.__tx, go: window.__go, anims: window.__anims, views: window.__views })");
    for (const [name, ok] of steps) if (!ok) fail(tag, `${name} 뒤 화면이 맞지 않는다`);
    const want = reduce ? 'fade,fade,fade,fade,fade,fade' : 'tab,forward,back,forward,back,tab';   // 동작 줄이기면 키트가 모두 페이드로
    if (r.go.join(',') !== want) fail(tag, `전환 ${r.go.join(',') || '없음'} (기대 ${want} — 누름 하나에 하나, popstate 포함)`);
    if (r.tx.map((t) => t.type).join(',') !== 'tab,tab') fail(tag, `이 화면이 부른 전환 ${r.tx.map((t) => t.type).join(',')} (기대 tab,tab — 목록-상세는 키트 몫)`);
    for (const t of r.tx) if (t.calls !== 1) fail(tag, `${t.type} 전환이 update 를 ${t.calls}번 불렀다`);
    if (r.views !== 4) fail(tag, `목록-상세가 ${r.views}번 바뀌었다 (기대 4)`);
    const moved = r.anims.filter((a) => a.props.some((p) => MOVES.includes(p)));
    const show = (list) => list.map((a) => `${a.name}@${a.on}[${a.props.join('+')}]`).join(', ');
    if (reduce && moved.length) fail(tag, `동작 줄이기인데 움직였다: ${show(moved)}`);
    if (!reduce && !moved.some((a) => a.on.includes('view-transition'))) fail(tag, `화면 전환의 움직임을 못 잡았다 — 잴 수단이 고장 (잡은 것: ${show(r.anims) || '없음'})`);
    checked.flows++;
  }
  await c.send('Emulation.setEmulatedMedia', { features: [] });

  for (const e of c.errors) fail('콘솔', e);
} catch (e) {
  fail('실행', e.stack || String(e));
} finally {
  await c.close();
}
console.log(JSON.stringify({ failures, checked }));
