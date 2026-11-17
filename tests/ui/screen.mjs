// ytmp3 웹 화면 자동 점검 — 폭(390·768·1440) × 라이트·다크 × 화면 넷(받기·받은 곡·편집기·잘라낸 곡).
//   node tests/ui/screen.mjs <서버 주소>     (서버는 --test-mode 로 띄운다 — 소리가 나가지 않게)
// 결과는 JSON 한 줄: { failures: [...], checked: {...} }. 실패가 있어도 종료 코드는 0 — 판정은 pytest 가 한다.
// 기준 (ui-kit docs/PRINCIPLES.md · WCAG 2.2):
//   - 누르는 영역: 모든 것 24×24 이상, 주 동작(.ui-primary·.ui-l·.ui-xl) 높이 48 이상
//   - 가로 넘침 없음
//   - 글자 대비: 실제 칠해진 글자색을 배경 위에 합성해 4.5 이상 (큰 글자 24px·굵은 18.66px 이상은 3). 비활성은 뺀다
//   - 흐름: (390) 목록 → 편집기 → 뒤로, 편집기 소리는 꺼져 있음
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

  for (const e of c.errors) fail('콘솔', e);
} catch (e) {
  fail('실행', e.stack || String(e));
} finally {
  await c.close();
}
console.log(JSON.stringify({ failures, checked }));
