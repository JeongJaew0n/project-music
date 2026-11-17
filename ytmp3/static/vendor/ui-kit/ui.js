/* ui-kit 0.4.0 */
/* ui-kit — 색 계산, 동작, 아이콘. 전역 UI(브라우저)와 UIColor(브라우저·Node)를 만든다.
   <head> 에서 defer 없이 읽으면 저장된 테마·시안·내 색이 첫 화면부터 적용된다(깜빡임 없음).

   UI.toast("저장했어요")                       UI.toast("실패했어요", { type: "err" })
   UI.sheet.open(html | Node, { onClose })      UI.sheet.close()
   await UI.dialog({ title, body, ok, cancel, danger })  → true / false
   UI.setTheme("light" | "dark" | null)         UI.cycleTheme()      UI.isDark()
   UI.setPalette("blue" | "mint" | "sunset" | "mono")
   UI.setAccent("#7c4dff" | null)               UI.accentCSS("#7c4dff") → 붙여 쓸 CSS
   UI.icon("search")  UI.tabIcon("home")  UI.palDots(el)  UI.layoutSegs(root)  UI.config({ toastMs })
   UI.nav({ items: [{ id, label, icon, href }], current })   UI.nav.set(id)   → [data-ui-nav="gnb|tabbar|floatbar|list"] 에 같은 메뉴
   UI.setView("detail" | "list", listDetailEl?)   목록-상세(.ui-list-detail) 전환. [data-ui-detail]·[data-ui-back] 은 마크업만으로.
                                                좁은 화면에서 상세를 열면 방문 기록 한 칸(뒤로 가기 → 목록). data-ui-history="off" 로 끔

   <html> 속성: data-palette · data-theme · data-ui-accent="#hex"(내 색) · data-ui-store="앱이름"(저장 키 앞머리, 기본 ui)
               data-ui-wide-at="720"(데스크톱 전환 폭. 없으면 CSS 의 900px 컨테이너 쿼리)
   ui.js 가 적는 속성: data-ui-mode="light|dark" (지금 보이는 모드. 쓰는 쪽 CSS 가 모드별 값을 줄 때 씀)

   마크업만으로 움직이는 것 (이벤트 위임):
   .ui-seg > button · .ui-tabs > .ui-tab · .ui-chips[data-ui="single"|"multi"] > .ui-chip ·
   .ui-choices[data-ui="single"] > .ui-choice · .ui-menu > button(옆에 .ui-drop 이 있는 펼침 메뉴) · [data-ui-close] ·
   [data-ui-theme] · [data-ui-palette="mint"] · .ui-row[role="button"] 의 Enter/Space ·
   탭·세그먼트·하나만 고르는 칩의 ←→·Home·End(묶음마다 Tab 한 번) · [data-ui-icon="search"] · [data-ui-tab-icon="home"].
   나중에 넣은 부품(SPA·React)도 MutationObserver 로 갖춘다. 묶음에 data-ui-controlled 를 달면 선택(aria-*)은 쓰는 쪽이 바꾼다.
   바뀌면 묶음 요소에서 "ui:change"(detail.value), .ui-list-detail 에서 "ui:view"(detail.view·value),
   document 에서 "ui:theme" · "ui:palette" · "ui:accent" · "ui:nav".
   <style> 요소나 style="" 글을 만들지 않는다(값은 CSSOM 으로): CSP style-src 'self' 에서도 돈다. */
(() => {
  "use strict";

  /* ================= 색 계산 (Node 에서도 돈다: tools/gen.mjs) ================= */
  const Color = (() => {
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
    function rgb(hex) {
      let h = String(hex).trim().replace("#", "");
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`색은 #rrggbb 로: ${hex}`);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const hex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
    function oklch(h) {
      const [r, g, b] = rgb(h).map((v) => lin(v / 255));
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
      const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
      return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
    }
    function linear(L, C, H) {
      const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    }
    // sRGB 밖이면 채도를 줄여 안으로
    function from(L, C, H) {
      L = clamp(L, 0, 1);
      for (let c = C, i = 0; i < 40; i++, c *= 0.9) {
        const v = linear(L, c, H);
        if (v.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) return hex(v.map((x) => gam(clamp(x, 0, 1)) * 255));
      }
      return hex(linear(L, 0, H).map((x) => gam(clamp(x, 0, 1)) * 255));
    }
    const lum = (h) => { const [r, g, b] = rgb(h).map((v) => lin(v / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // 밝기를 dir 쪽으로 옮겨 against 모두에 min 대비를 맞춘다
    function fit(L, C, H, against, min, dir) {
      let out = from(L, C, H);
      for (let i = 0; i < 100 && against.some((b) => contrast(out, b) < min); i++) {
        L += dir * 0.01;
        if (L < 0 || L > 1) break;
        out = from(L, C, H);
      }
      return out;
    }
    const alpha = (h, a) => `rgba(${rgb(h).join(",")},${a})`;
    // 두 색 사이(oklab). t=0 이면 a, 1 이면 b
    function mix(a, b, t = 0.5) {
      const lab = (h) => { const [L, C, H] = oklch(h); return [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)]; };
      const [p, q] = [lab(a), lab(b)], m = p.map((v, i) => v + (q[i] - v) * t);
      return from(m[0], Math.hypot(m[1], m[2]), ((Math.atan2(m[2], m[1]) * 180) / Math.PI + 360) % 360);
    }
    const onColor = (bg, H, C) => (contrast("#ffffff", bg) >= 3 ? "#ffffff" : from(0.16, Math.min(C, 0.04), H));

    // 회색 단계 [밝기, 채도] — 블루 시안(앱에서 잰 값)에서 뽑았다. 색상은 포인트 색을 따른다
    const GREY = {
      light: { bg: [0.966, 0.003], "surface-2": [0.985, 0.002], fill: [0.966, 0.003], "fill-press": [0.93, 0.005], line: [0.93, 0.005], "line-strong": [0.874, 0.009],
        t1: [0.237, 0.02], t2: [0.357, 0.028], t3: [0.46, 0.028], t4: [0.534, 0.024], t5: [0.666, 0.021], t6: [0.779, 0.016] },
      dark: { bg: [0.174, 0.004], surface: [0.219, 0.004], "surface-2": [0.244, 0.004], fill: [0.297, 0.006], "fill-press": [0.353, 0.007], line: [0.289, 0.006], "line-strong": [0.353, 0.007],
        t1: [0.944, 0.003], t2: [0.876, 0.006], t3: [0.776, 0.009], t4: [0.685, 0.011], t5: [0.599, 0.013], t6: [0.492, 0.012], bar: [0.205, 0.004], tile: [0.273, 0.006] },
    };
    const SEMANTIC = {
      light: { danger: "#f04452", "danger-press": "#d22030", "danger-weak": "#ffeeee", "danger-t": "#d22030", "warning-weak": "#fff3e0", "warning-t": "#ad550b", success: "#03b26c", "success-weak": "#f0faf6", "success-t": "#1a7d4f" },
      dark: { danger: "#f7545f", "danger-press": "#e0414c", "danger-weak": "#3a1d21", "danger-t": "#ff8a92", "warning-weak": "#3a2a14", "warning-t": "#ffb35c", success: "#20c27e", "success-weak": "#143126", "success-t": "#5ad7a0" },
    };
    // 포인트 색이 빨강과 가까우면 위험 색을 라즈베리 쪽으로(주황 버튼과 지우기 버튼이 헷갈리지 않게)
    const RASPBERRY = {
      light: { danger: "#e0245e", "danger-press": "#c01848", "danger-weak": "#fdebf0", "danger-t": "#c01848" },
      dark: { danger: "#f04a78", "danger-press": "#e03a66", "danger-weak": "#3a1a26", "danger-t": "#ff8fae" },
    };
    const FIXED = {
      light: { knob: "#ffffff", "on-color": "#ffffff", hairline: "rgba(0,0,0,.08)", ghost: "rgba(7,25,76,.05)", "ghost-hover": "rgba(7,25,76,.075)", "ghost-press": "rgba(7,25,76,.1)",
        scrim: "rgba(0,12,30,.48)", shadow: "0 8px 28px rgba(2,32,71,.12)", "shadow-sm": "0 1px 3px rgba(0,0,0,.12)", "shadow-knob": "0 2px 4px rgba(0,0,0,.18)",
        toast: "rgba(25,31,40,.92)", "toast-t": "#ffffff" },
      dark: { knob: "#ffffff", "on-color": "#ffffff", hairline: "rgba(255,255,255,.08)", ghost: "rgba(255,255,255,.07)", "ghost-hover": "rgba(255,255,255,.095)", "ghost-press": "rgba(255,255,255,.12)",
        scrim: "rgba(0,0,0,.62)", shadow: "0 8px 28px rgba(0,0,0,.5)", "shadow-sm": "0 1px 3px rgba(0,0,0,.4)", "shadow-knob": "0 2px 4px rgba(0,0,0,.4)",
        toast: "rgba(60,62,68,.96)", "toast-t": "#ffffff" },
    };

    /* spec: { accent, accentDark?, tint?(회색 물들이기 0~1, 기본 1), light?: {덮어쓸 토큰}, dark?: {…} } → { light: {토큰}, dark: {토큰} } */
    function derive(spec) {
      const [L, C, H] = oklch(spec.accent);
      const tint = spec.tint ?? 1;
      const nearRed = C > 0.1 && Math.abs(((H - 21 + 540) % 360) - 180) < 35;
      const greys = (mode, h) => Object.fromEntries(Object.entries(GREY[mode]).map(([k, [l, c]]) => [k, from(l, c * tint, h)]));

      const lt = { surface: "#ffffff", bar: "#ffffff", ...greys("light", H) };
      lt.tile = lt.fill;
      lt.t4 = fit(GREY.light.t4[0], GREY.light.t4[1] * tint, H, [lt.bg, lt.surface, lt.fill], 4.5, -1);
      lt.accent = spec.accent;
      lt["accent-press"] = from(L - 0.08, C, H);
      lt["accent-weak"] = from(0.96, Math.min(0.022, C * 0.15), H);
      lt["accent-weak-press"] = from(0.91, Math.min(0.05, C * 0.3), H);
      lt["accent-weak-t"] = fit(Math.min(L, 0.56), C, H, [lt["accent-weak"], lt.surface], 4.5, -1);
      lt["on-accent"] = onColor(lt.accent, H, C);
      lt.highlight = lt.accent;
      Object.assign(lt, SEMANTIC.light, nearRed ? RASPBERRY.light : {}, FIXED.light);
      lt.gnb = alpha(lt.surface, 0.86);

      const accD = spec.accentDark || from(clamp(L + 0.06, 0.66, 0.8), C, H);
      const [Ld, Cd, Hd] = oklch(accD);
      const dk = greys("dark", Hd);
      dk.t4 = fit(GREY.dark.t4[0], GREY.dark.t4[1] * tint, Hd, [dk.bg, dk.surface, dk.fill], 4.5, 1);
      dk.accent = accD;
      dk["accent-press"] = from(Ld - 0.07, Cd, Hd);
      dk["accent-weak"] = from(0.285, Math.min(0.048, Cd * 0.25), Hd);
      dk["accent-weak-press"] = from(0.336, Math.min(0.068, Cd * 0.36), Hd);
      dk["accent-weak-t"] = fit(0.78, Math.min(Cd * 0.7, 0.13), Hd, [dk["accent-weak"], dk.surface], 4.5, 1);
      dk["on-accent"] = onColor(dk.accent, Hd, Cd);
      dk.highlight = dk.accent;
      Object.assign(dk, SEMANTIC.dark, nearRed ? RASPBERRY.dark : {}, FIXED.dark);
      dk.gnb = alpha(dk.bg, 0.86);

      Object.assign(lt, spec.light); Object.assign(dk, spec.dark);
      for (const [t, own, dir] of [[lt, spec.light || {}, -1], [dk, spec.dark || {}, 1]]) {
        t["on-danger"] = onColor(t.danger, 21, 0.2);
        // 꺼짐 색: 꺼진 스위치 길·체크 동그라미·라디오 테두리. 회색 t5 를 카드·바탕·채움 위 3:1 까지 (누를 수 있는 것의 모양, WCAG 1.4.11)
        if (!("control" in own)) t.control = (([L, C, H]) => fit(L, C, H, [t.surface, t.bg, t.fill], 3, dir))(oklch(t.t5));
        // 마우스 올림: 기본색과 누름색 사이(누름보다 약하게). 손으로 고른 누름색을 따른다. 약한 색은 글자 대비 4.5 를 지키려고 기본색 쪽으로
        // [기본, 누름, 비율, 위에 놓일 글자] — 글자가 있으면 대비 4.5 를 지킬 때까지 기본색 쪽으로 당긴다
        const hover = { "accent-hover": [t.accent, t["accent-press"]], "accent-weak-hover": [t["accent-weak"], t["accent-weak-press"], 0.5, t["accent-weak-t"]], "fill-hover": [t.fill, t["fill-press"]],
          "surface-hover": [t.surface, t.fill], "control-hover": [t.control, t.t4], "danger-hover": [t.danger, t["danger-press"]], "danger-weak-hover": [t["danger-weak"], t.danger, 0.1, t["danger-t"]] };
        for (const [k, [a, b, w = 0.5, txt]] of Object.entries(hover)) {
          if (k in own) continue;
          let v = mix(a, b, w);
          for (let x = w; txt && x > 0.02 && contrast(txt, v) < 4.5; x -= 0.01) v = mix(a, b, x);
          if (txt && contrast(txt, v) < 4.5) v = a;   // 글자가 기본색 위에서 겨우 4.5 이면 올림색을 기본색 그대로(대비가 먼저)
          t[k] = v;
        }
        // 포커스 테두리: 포인트 색을 카드·바탕·채움 위에서 3:1 이 될 때까지 (라이트는 어둡게, 다크는 밝게)
        if (!("focus" in own)) {
          const on = [t.surface, t.bg, t.fill];
          t.focus = on.every((b) => contrast(t.accent, b) >= 3) ? t.accent : (([L, C, H]) => fit(L, C, H, on, 3, dir))(oklch(t.accent));
        }
      }
      return { light: lt, dark: dk };
    }

    // 지켜야 할 대비. 실패한 항목 목록을 돌려준다(시험·생성기가 씀)
    const RULES = [["on-accent", "accent", 3], ["t1", "surface", 7], ["t4", "surface", 4.5], ["t4", "bg", 4.5], ["t4", "fill", 4.5], ["accent-weak-t", "accent-weak", 4.5], ["danger-t", "danger-weak", 4.5], ["on-danger", "danger", 3],
      ["focus", "surface", 3], ["focus", "bg", 3], ["focus", "fill", 3], ["control", "surface", 3], ["control", "bg", 3], ["control", "fill", 3], ["on-accent", "accent-hover", 3], ["accent-weak-t", "accent-weak-hover", 4.5], ["danger-t", "danger-weak-hover", 4.5],
      ...["danger", "warning", "success"].flatMap((k) => [`${k}-weak`, "surface", "bg"].map((bg) => [`${k}-t`, bg, 4.5]))];   // 뜻 색 글자: 배지·타일과 쓰는 쪽 글자
    const check = (t) => RULES.map(([a, b, min]) => ({ a, b, min, ratio: +contrast(t[a], t[b]).toFixed(2) })).filter((r) => r.ratio < r.min);

    const decl = (t, pad = "  ") => Object.entries(t).map(([k, v]) => `${pad}--ui-${k}: ${v};`).join("\n");
    // 한 벌(라이트·다크)을 base 선택자에 거는 CSS. 시스템 다크와 data-theme 둘 다
    function css(tokens, base = ":root") {
      return `${base} {\n${decl(tokens.light)}\n}\n@media (prefers-color-scheme: dark) { ${base}:not([data-theme="light"]) {\n${decl(tokens.dark, "    ")}\n    color-scheme: dark; } }\n${base}[data-theme="dark"] {\n${decl(tokens.dark)}\n  color-scheme: dark; }\n`;
    }
    return { oklch, from, mix, contrast, derive, check, css };
  })();

  /* ================= 움직임 원본 (Node 에서도 돈다: tools/gen.mjs · tools/motion-kotlin.mjs) =================
     스프링은 성질 두 수로 정한다: duration(초, 감쇠 없을 때의 한 주기 = 체감 시간)·bounce(−1~1, 넘침).
     질량 1 의 강성 k = (2π/duration)², 감쇠비 ζ = bounce ≥ 0 ? 1 − bounce : 1/(1 + bounce). Apple Spring(duration:bounce:)·
     Compose spring(dampingRatio, stiffness) 와 같은 정의라 값을 그대로 옮긴다. 시간·숫자는 여기 한 곳에만 둔다. */
  const Motion = (() => {
    const deep = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deep(v)); return Object.freeze(o); };
    // 시간(ms). 0.3 값 그대로 + 0.4 새 값. screen·screenOut 은 조사로 바뀔 수 있다(이 한 곳만)
    // 화면 전환(모바일 조사 1차, 2026-11-18): 앞·뒤·위·아래는 위치를 smooth 스프링으로, 새 화면 투명도는 screenFadeDelay 뒤 screenFade 동안(linear).
    // 탭은 바꿔 보이기(fade through): 옛 화면 tabOut 동안 사라지고, 그 뒤 새 화면 tabIn 동안 나타남. 크기 변화는 없다(자주 하는 동작)
    const dur = { press: 100, fade: 150, move: 220, sheet: 320, slow: 600, exit: 220, screenFadeDelay: 50, screenFade: 90, tabOut: 90, tabIn: 210, spin: 700, shimmer: 1400 };
    // cubic-bezier 네 수(fade 는 CSS 의 ease 와 같다)
    const ease = { fade: [0.25, 0.1, 0.25, 1], move: [0.3, 0.7, 0.3, 1], sheet: [0.2, 0.8, 0.2, 1], exit: [0.3, 0, 0.8, 0.15], enter: [0.05, 0.7, 0.1, 1], press: [0, 0, 0.2, 1] };
    // 손맛 세 단계(기본 calm). calm·standard 의 스프링은 M3 standard 성질, playful 은 M3 expressive 성질. 차이는 놀이 효과(recipes.fx):
    // calm 은 효과가 움직이지 않고 바탕만 물든다. 동작 줄이기·--ui-motion 0 은 단계와 상관없이 calm. fallback 은 linear() 를 모르는 브라우저용.
    // 엇갈림 간격: M2·Carbon "20ms 넘게 벌리지 않는다"(생기만 30), popIn = 배지·칩이 넘쳐 들어오기
    const standardSprings = { snappy: { duration: 0.168, bounce: 0.1, fallback: [0.3, 0.7, 0.3, 1] }, smooth: { duration: 0.363, bounce: 0.1, fallback: [0.2, 0.8, 0.2, 1] }, pop: { duration: 0.3, bounce: 0.3, fallback: [0.3, 1.35, 0.5, 1] } };
    const feels = {
      calm: { ...standardSprings, stagger: 20, popIn: { from: 1, ms: 220, ease: [0.2, 0, 0, 1] } },
      standard: { ...standardSprings, stagger: 20, popIn: { from: 0.8, ms: 220, ease: [0.34, 1.3, 0.64, 1] } },
      playful: { snappy: { duration: 0.222, bounce: 0.4, fallback: [0.3, 1.4, 0.5, 1] }, smooth: { duration: 0.444, bounce: 0.2, fallback: [0.25, 1.2, 0.4, 1] }, pop: { duration: 0.35, bounce: 0.5, fallback: [0.3, 1.6, 0.5, 1] }, stagger: 30, popIn: { from: 0.8, ms: 280, ease: [0.34, 1.56, 0.64, 1] } },
    };
    // 화면 전환 밀림: 화면 폭의 20%, 넓은 화면에서 너무 크지 않게 최대 96px. 엇갈림 떠오름 8px
    const shift = { screen: 0.2, screenMax: 96, stagger: 8, staggerMax: 6 };

    function physics({ duration, bounce = 0 }) {
      if (!(duration > 0)) throw new Error("UIMotion: duration > 0");
      if (!(bounce > -1 && bounce < 1)) throw new Error("UIMotion: −1 < bounce < 1");
      const omega = (2 * Math.PI) / duration;
      const dampingRatio = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
      return { stiffness: omega * omega, dampingRatio, damping: 2 * dampingRatio * omega, omega };
    }
    // 0 → 1 로 가는 위치 x(t)·속도 v(t). v0 = 처음 속도(전체 거리/초)
    function solver(spring, v0 = 0) {
      const { omega: w, dampingRatio: z } = physics(spring), y0 = -1;
      if (Math.abs(z - 1) < 1e-9) { const A = y0, B = v0 + w * y0; return (t) => { const e = Math.exp(-w * t); return { x: 1 + (A + B * t) * e, v: (B - w * (A + B * t)) * e }; }; }
      if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z), A = y0, B = (v0 + z * w * y0) / wd;
        return (t) => { const e = Math.exp(-z * w * t), c = Math.cos(wd * t), s = Math.sin(wd * t), y = e * (A * c + B * s); return { x: 1 + y, v: -z * w * y + e * (-A * wd * s + B * wd * c) }; };
      }
      const r1 = -w * (z - Math.sqrt(z * z - 1)), r2 = -w * (z + Math.sqrt(z * z - 1)), C2 = (v0 - r1 * y0) / (r2 - r1), C1 = y0 - C2;
      return (t) => ({ x: 1 + C1 * Math.exp(r1 * t) + C2 * Math.exp(r2 * t), v: C1 * r1 * Math.exp(r1 * t) + C2 * r2 * Math.exp(r2 * t) });
    }
    // 멈춤 시간: 남은 거리 eps(전체의 0.2%) 안에 들어와 다시 나가지 않는 첫 시각(초)
    function settle(spring, v0 = 0, eps = 0.002) {
      const f = solver(spring, v0), { omega } = physics(spring), dt = 0.001;
      let last = 0;
      for (let t = 0; t <= 10; t += dt) { const { x, v } = f(t); if (Math.abs(1 - x) >= eps || Math.abs(v) / omega >= eps) last = t; }
      return Math.min(10, last + dt);
    }
    function overshoot(spring, v0 = 0) {
      const f = solver(spring, v0), T = settle(spring, v0);
      let m = 0; for (let t = 0; t <= T; t += 0.0005) m = Math.max(m, f(t).x - 1);
      return m;
    }
    // CSS linear(): 약 12ms 마다 한 점(최소 20점), 끝점은 정확히 0·1
    function linear(spring, { eps = 0.002, step = 0.012, digits = 4 } = {}) {
      const T = settle(spring, 0, eps), f = solver(spring, 0), n = Math.max(20, Math.ceil(T / step)), pts = [];
      for (let i = 0; i <= n; i++) pts.push(i === 0 ? 0 : i === n ? 1 : +f((T * i) / n).x.toFixed(digits));
      return { easing: `linear(${pts.join(", ")})`, duration: +T.toFixed(3), points: n + 1 };
    }
    // WAAPI 용 from → to 위치 배열과 시간(ms). velocity(단위/초) = 놓는 순간 속도에서 이어 간다
    function keyframes(spring, { from, to, velocity = 0, fps = 60, eps = 0.002 }) {
      const dist = to - from;
      if (!dist) return { values: [to], duration: 0 };
      const v0 = velocity / dist, f = solver(spring, v0), T = settle(spring, v0, eps), n = Math.max(2, Math.ceil(T * fps)), values = [];
      for (let i = 0; i <= n; i++) values.push(i === n ? to : from + dist * f((T * i) / n).x);
      return { values, duration: Math.round(T * 1000) };
    }
    // 제자리 튕김: 0 → peak → 0 (순간 속도만 받은 스프링). fx.pop 의 크기에 쓴다
    function impulse(spring, { peak = 1, fps = 60, eps = 0.002 } = {}) {
      const { omega: w, dampingRatio: z } = physics(spring);
      let y;
      if (Math.abs(z - 1) < 1e-9) y = (t) => t * Math.exp(-w * t);
      else if (z < 1) { const wd = w * Math.sqrt(1 - z * z); y = (t) => Math.exp(-z * w * t) * Math.sin(wd * t); }
      else { const r1 = -w * (z - Math.sqrt(z * z - 1)), r2 = -w * (z + Math.sqrt(z * z - 1)); y = (t) => Math.exp(r1 * t) - Math.exp(r2 * t); }
      let max = 0, last = 0;
      for (let t = 0; t <= 5; t += 0.0005) max = Math.max(max, Math.abs(y(t)));
      for (let t = 0; t <= 5; t += 0.0005) if (Math.abs(y(t)) / max >= eps) last = t;
      const T = last + 0.0005, n = Math.max(2, Math.ceil(T * fps)), values = [];
      for (let i = 0; i <= n; i++) values.push(i === n ? 0 : +((y((T * i) / n) / max) * peak).toFixed(4));
      return { values, duration: Math.round(T * 1000) };
    }
    const compose = (spring) => { const { dampingRatio, stiffness } = physics(spring); return { dampingRatio: +dampingRatio.toFixed(3), stiffness: +stiffness.toFixed(1) }; };
    // 거꾸로: 다른 시스템의 (감쇠비, 강성) → (체감 시간, 튕김)
    function fromPhysics({ dampingRatio: z, stiffness: k }) {
      return { duration: +((2 * Math.PI) / Math.sqrt(k)).toFixed(3), bounce: +(z <= 1 ? 1 - z : 1 / z - 1).toFixed(3) };
    }
    const bez = (a) => `cubic-bezier(${a.join(", ")})`;
    // 손맛 하나의 스프링 토큰: { "ease-snappy": "linear(…)", "dur-snappy": 초, "ease-snappy-fallback": cubic-bezier, … , stagger: ms }
    function tokens(feel = "calm") {
      const f = feels[feel], out = {};
      if (!f) throw new Error(`UIMotion: 손맛 ${feel}`);
      for (const r of ["snappy", "smooth", "pop"]) { const L = linear(f[r]); out[`ease-${r}`] = L.easing; out[`dur-${r}`] = L.duration; out[`ease-${r}-fallback`] = bez(f[r].fallback); }
      out.stagger = f.stagger; out["pop-in-from"] = f.popIn.from; out["dur-pop-in"] = f.popIn.ms / 1000; out["ease-pop-in"] = bez(f.popIn.ease);
      return out;
    }
    // 레시피: 언제 무엇을. 앱 생성기(Compose·SwiftUI)도 이것만 읽는다
    const recipes = {
      press: { down: { ms: dur.press, ease: "press" }, up: { spring: "snappy" }, scale: 0.96, scaleSmall: 0.92 },
      transition: {
        forward: { axis: "x", dir: 1, spring: "smooth", shift: shift.screen, shiftMax: shift.screenMax, fadeDelay: dur.screenFadeDelay, fade: dur.screenFade },
        back: { axis: "x", dir: -1, spring: "smooth", shift: shift.screen, shiftMax: shift.screenMax, fadeDelay: dur.screenFadeDelay, fade: dur.screenFade },
        up: { axis: "y", dir: 1, spring: "smooth", shift: shift.screen, shiftMax: shift.screenMax, fadeDelay: dur.screenFadeDelay, fade: dur.screenFade },
        down: { axis: "y", dir: -1, spring: "smooth", shift: shift.screen, shiftMax: shift.screenMax, fadeDelay: dur.screenFadeDelay, fade: dur.screenFade },
        tab: { through: true, out: dur.tabOut, in: dur.tabIn }, fade: { cross: true, ms: dur.fade },
      },
      // 놀이 효과(게임·앱 조사 7절). 한 박자 320ms 이하, 펀치 1.12 이하, 실패는 300ms 이하. calm 은 tint(바탕 물듦)만
      fx: {
        calm: { tint: { ms: 150 }, count: { ms: 400 } },
        standard: { tint: { ms: 150 }, pop: { scale: [1, 1.06, 0.98, 1], ms: 260 }, shake: { x: [0, -6, 5, -3, 2, 0], ms: 300 }, celebrate: { count: 18, ms: 900, local: true }, count: { ms: 500 } },
        playful: { tint: { ms: 150 }, pop: { scale: [1, 1.12, 0.98, 1], ms: 320 }, shake: { x: [0, -6, 5, -3, 2, 0], ms: 300 }, celebrate: { count: 60, ms: 1500, local: false }, count: { ms: 700 } },
      },
      // 햅틱: Web Haptics 제안(WICG 2026-04)의 여섯 이름. navigator.playHaptics 가 있을 때만 울린다(navigator.vibrate 는 쓰지 않음 —
      // Android 가 일상 피드백에 말리는 옛 진동). 앱 생성기가 옮길 Compose(HapticFeedbackConstants, UI 1.8+)·SwiftUI(sensoryFeedback) 이름
      haptic: {
        hint: { compose: "ContextClick", swiftui: ".impact(weight: .light)" }, edge: { compose: "GestureThresholdActivate", swiftui: ".impact" },
        tick: { compose: "SegmentTick", swiftui: ".selection" }, align: { compose: "SegmentTick", swiftui: ".selection" },
        success: { compose: "Confirm", swiftui: ".success" }, error: { compose: "Reject", swiftui: ".error" },
      },
    };
    const feelNames = ["calm", "standard", "playful"];
    return deep({ dur, ease, feels, feelNames, shift, recipes, physics, solver, settle, overshoot, linear, keyframes, impulse, compose, fromPhysics, tokens });
  })();

  // 0.1.0 에서 손으로 고른 시안 값(앱에서 잰 블루와 그에 맞춘 민트·선셋·모노). 계산값과 다른 것만 적어 시안 모양을 그대로 지킨다.
  // 내 색(data-ui-accent)에는 쓰지 않는다 — 그쪽은 계산값만 쓴다.
  const HAND = {
    blue: {
      light: { "accent-press": "#1b64da", "accent-weak": "#e8f3ff", "accent-weak-press": "#c9e2ff", "accent-weak-t": "#1b64da", "fill-press": "#e5e8eb", "gnb": "rgba(255,255,255,.86)", "line": "#e5e8eb", "line-strong": "#d1d6db", "t3": "#4e5968", "t4": "#636e7b", "t5": "#8b95a1", "t6": "#b0b8c1" },
      dark: { "accent-press": "#2f74e0", "accent-weak": "#1c2a42", "accent-weak-press": "#23365a", "accent-weak-t": "#79b0ff", "bar": "#171719", "bg": "#101012", "fill": "#2c2d30", "fill-press": "#3a3b3f", "gnb": "rgba(16,16,18,.86)", "line": "#2a2b2e", "line-strong": "#3a3b3f", "surface": "#1a1a1c", "surface-2": "#202022", "t1": "#ececee", "t5": "#7c8088", "tile": "#26272a" },
    },
    mint: {
      light: { "accent-press": "#00845a", "accent-weak": "#e3f7ef", "accent-weak-press": "#c3eedc", "accent-weak-t": "#007a52", "bg": "#f1f5f4", "fill": "#eef3f1", "fill-press": "#dfe7e4", "gnb": "rgba(255,255,255,.86)", "line": "#e1e8e5", "line-strong": "#cbd6d2", "surface-2": "#f7faf9", "t1": "#14201c", "t2": "#2c3a35", "t3": "#45544f", "t4": "#5c6c66", "t5": "#84938d", "t6": "#aab7b2", "tile": "#eef3f1" },
      dark: { "accent-press": "#18a877", "accent-weak": "#13302a", "accent-weak-press": "#1a4237", "accent-weak-t": "#5fdcad", "bar": "#131918", "bg": "#0e1312", "fill": "#26302e", "fill-press": "#313c3a", "gnb": "rgba(14,19,18,.86)", "line": "#222b29", "line-strong": "#33403d", "on-accent": "#04170f", "surface": "#161c1b", "surface-2": "#1b2221", "t1": "#e8f0ed", "t2": "#ced9d5", "t3": "#aebbb6", "t4": "#8f9d98", "t5": "#75847e", "t6": "#56635f", "tile": "#1f2725" },
    },
    sunset: {
      light: { "accent-press": "#d95a15", "accent-weak": "#fff0e6", "accent-weak-press": "#ffdcc7", "accent-weak-t": "#b0460b", "bg": "#f6f3f1", "fill": "#f3efec", "fill-press": "#e7e1dc", "gnb": "rgba(255,255,255,.86)", "line": "#eae4df", "line-strong": "#d8d0c9", "surface-2": "#faf8f6", "t1": "#241c18", "t2": "#3d332d", "t3": "#574b44", "t4": "#76685f", "t5": "#978a81", "t6": "#baafa7", "tile": "#f3efec" },
      dark: { "accent-press": "#f0773a", "accent-weak": "#3a2418", "accent-weak-press": "#4b2f1f", "accent-weak-t": "#ffb088", "bar": "#191513", "bg": "#14110f", "fill": "#302925", "fill-press": "#3c342f", "gnb": "rgba(20,17,15,.86)", "line": "#2b2420", "line-strong": "#3d3530", "on-accent": "#2a1206", "surface": "#1d1916", "surface-2": "#231e1b", "t1": "#f2ece8", "t2": "#dcd3cd", "t3": "#bdb2ab", "t4": "#9e928a", "t5": "#83776f", "t6": "#615751", "tile": "#29231f" },
    },
    mono: {
      light: { "accent-press": "#000000", "bg": "#f3f3f3", "fill": "#efefef", "fill-press": "#e2e2e2", "gnb": "rgba(255,255,255,.86)", "line": "#e6e6e6", "line-strong": "#d2d2d2", "surface-2": "#f8f8f8", "t1": "#111111", "t2": "#2b2b2b", "t3": "#474747", "t4": "#6a6a6a", "t5": "#8c8c8c", "t6": "#b3b3b3", "tile": "#f0f0f0" },
      dark: { "accent-press": "#dadada", "bar": "#141414", "bg": "#0d0d0d", "fill": "#2a2a2a", "fill-press": "#363636", "gnb": "rgba(13,13,13,.86)", "line": "#262626", "line-strong": "#383838", "on-accent": "#111111", "surface": "#181818", "surface-2": "#1e1e1e", "t1": "#f0f0f0", "t3": "#b5b5b5", "t4": "#959595", "t5": "#7a7a7a", "t6": "#595959", "tile": "#222222" },
    },
  };
  // 시안 — 원본은 여기 한 곳. tokens.css·시안 점·카탈로그 미리보기가 모두 이걸로 만든다
  const PALETTES = [
    { id: "blue", name: "블루", desc: "기본 · 푸른 회색", accent: "#3182f6", accentDark: "#3d8bff" },
    { id: "mint", name: "민트", desc: "초록 포인트 · 초록빛 회색", accent: "#009e6a", accentDark: "#1fc48a" },
    { id: "sunset", name: "선셋", desc: "살구 오렌지 · 따뜻한 회색", accent: "#f26a21", accentDark: "#ff8a4c" },
    { id: "mono", name: "모노", desc: "먹색 버튼 · 노란 포인트", accent: "#161616", accentDark: "#f5f5f5", tint: 0,
      light: { "accent-weak": "#fff3c4", "accent-weak-press": "#ffe792", "accent-weak-t": "#6b5300", highlight: "#ffc800" },
      dark: { "accent-weak": "#3a3212", "accent-weak-press": "#4a4018", "accent-weak-t": "#ffd84d", highlight: "#ffc800" } },
  ].map((p) => Object.freeze({ ...p, tokens: Color.derive({ ...p, light: { ...HAND[p.id]?.light, ...p.light }, dark: { ...HAND[p.id]?.dark, ...p.dark } }) }));

  globalThis.UIColor = Object.freeze({ ...Color, palettes: PALETTES });
  globalThis.UIMotion = Motion;
  if (typeof document === "undefined") return;   // Node: 색 계산만

  /* ================= 브라우저 ================= */
  const doc = document, root = doc.documentElement;
  const cfg = { toastMs: 2200, haptics: true };

  /* ---------- 저장 ---------- */
  const key = (k) => `${root.dataset.uiStore || "ui"}.${k}`;
  const store = {
    get(k) { try { return localStorage.getItem(key(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(key(k)) : localStorage.setItem(key(k), v); } catch { /* 저장 못 해도 화면은 바뀐다 */ } },
  };

  /* ---------- 테마 · 시안 · 내 색 ---------- */
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const getTheme = () => root.dataset.theme || null;
  const isDark = () => (getTheme() ? getTheme() === "dark" : mq.matches);
  const getPalette = () => root.dataset.palette || "blue";
  const fire = (name, detail) => doc.dispatchEvent(new CustomEvent(name, { detail }));
  let accentTokens = null;   // 내 색: { light, dark }. 지금 모드의 값을 <html> 의 style 에 넣는다(CSSOM 이라 CSP style-src 'self' 에서도 돈다)
  let painted = [];         // 키트가 넣은 이름만 걷는다(쓰는 쪽이 <html> style 에 넣은 다른 토큰은 그대로)
  function paintAccent() {
    const s = root.style;
    painted.forEach((k) => s.removeProperty(k)); painted = [];
    if (accentTokens) for (const [k, v] of Object.entries(accentTokens[isDark() ? "dark" : "light"])) { s.setProperty(`--ui-${k}`, v); painted.push(`--ui-${k}`); }
  }
  const syncMode = () => { root.dataset.uiMode = isDark() ? "dark" : "light"; paintAccent(); };
  function setTheme(t, { save = true } = {}) {
    if (t !== "light" && t !== "dark") t = null;
    if (t) root.dataset.theme = t; else delete root.dataset.theme;
    if (save) store.set("theme", t);
    syncMode(); syncDots();
    fire("ui:theme", { theme: t, dark: isDark() });
  }
  const cycleTheme = () => { setTheme(isDark() ? "light" : "dark"); return getTheme(); };
  function setPalette(id, { save = true } = {}) {
    if (!PALETTES.some((p) => p.id === id)) id = "blue";
    if (id === "blue") delete root.dataset.palette; else root.dataset.palette = id;
    if (save) store.set("palette", id === "blue" ? null : id);
    syncDots();
    fire("ui:palette", { palette: id });
  }
  // 내 색: 포인트 색 하나로 라이트·다크 전부. <html> 의 style 이라 시안보다 앞선다. 모드가 바뀌면(syncMode) 그 모드 값으로 바꿔 넣는다
  const accentCSS = (accent) => Color.css(Color.derive({ accent }));
  function setAccent(accent) {
    if (!accent) { accentTokens = null; paintAccent(); delete root.dataset.uiAccent; syncDots(); fire("ui:accent", { accent: null }); return; }
    const tokens = Color.derive({ accent });
    const bad = [...Color.check(tokens.light), ...Color.check(tokens.dark)];
    if (bad.length) console.warn("ui-kit: 대비가 모자란 내 색", accent, bad);
    accentTokens = tokens; paintAccent();
    root.dataset.uiAccent = accent;
    syncDots();
    fire("ui:accent", { accent });
  }
  // 첫 화면 전에 적용. 저장값이 없으면 페이지가 정한 data-theme·data-palette 를 그대로 둔다
  { const t = store.get("theme"); if (t) setTheme(t, { save: false }); }
  { const p = store.get("palette"); if (p) setPalette(p, { save: false }); }
  { const f = store.get("feel"); if (f) setFeel(f, { save: false }); }
  if (root.dataset.uiAccent) { try { setAccent(root.dataset.uiAccent); } catch (e) { console.warn("ui-kit:", e.message); } }
  syncMode();
  mq.addEventListener("change", () => { if (!getTheme()) { syncMode(); syncDots(); fire("ui:theme", { theme: null, dark: isDark() }); } });
  // 쓰는 쪽이 data-theme 을 직접 바꿔도 지금 모드와 내 색이 따라간다
  new MutationObserver(() => { const m = isDark() ? "dark" : "light"; if (root.dataset.uiMode !== m) { syncMode(); syncDots(); } }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- 데스크톱 전환 폭 ---------- */
  // <html data-ui-wide-at="720"> 이면 .ui-app 마다 폭을 재서 data-ui-wide="1|0" 을 적는다. CSS 의 900px 블록은 이때 꺼진다.
  // ResizeObserver 는 그리기 전에 불려 첫 화면에도 깜빡임이 없다. head 에서 읽히므로 .ui-app 이 생기는 순간을 MutationObserver 로 잡는다.
  const wideAt = parseFloat(root.dataset.uiWideAt);
  if (wideAt > 0) {
    const mark = (n, w) => { const v = w >= wideAt ? "1" : "0"; if (n.dataset.uiWide !== v) n.dataset.uiWide = v; };
    const ro = new ResizeObserver((es) => es.forEach((e) => mark(e.target, e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width)));
    const seen = new WeakSet();
    const watch = () => doc.querySelectorAll(".ui-app").forEach((n) => { if (!seen.has(n)) { seen.add(n); mark(n, n.clientWidth); ro.observe(n); } });
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true, subtree: true });
    doc.addEventListener("DOMContentLoaded", () => { watch(); mo.disconnect(); });
    watch();
  }

  /* ---------- 아이콘 ---------- */
  const S = (d) => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
  const GEAR = "M9.96 4.89L10.33 2.55L13.67 2.55L14.04 4.89A7.4 7.4 0 0 1 15.59 5.53L17.51 4.14L19.86 6.49L18.47 8.41A7.4 7.4 0 0 1 19.11 9.96L21.45 10.33L21.45 13.67L19.11 14.04A7.4 7.4 0 0 1 18.47 15.59L19.86 17.51L17.51 19.86L15.59 18.47A7.4 7.4 0 0 1 14.04 19.11L13.67 21.45L10.33 21.45L9.96 19.11A7.4 7.4 0 0 1 8.41 18.47L6.49 19.86L4.14 17.51L5.53 15.59A7.4 7.4 0 0 1 4.89 14.04L2.55 13.67L2.55 10.33L4.89 9.96A7.4 7.4 0 0 1 5.53 8.41L4.14 6.49L6.49 4.14L8.41 5.53A7.4 7.4 0 0 1 9.96 4.89Z";
  const ICONS = {
    chev: S('<path d="M9 6l6 6-6 6"/>'),
    "chev-down": S('<path d="M6 9l6 6 6-6"/>'),
    back: S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
    bell: S('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
    moon: S('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    palette: S('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.7 1.8-1.7h2.1a4 4 0 0 0 4-4C20.5 6.6 16.7 3.5 12 3.5z"/>') + '<g fill="currentColor"><circle cx="7.6" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.6" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/></g>',
    settings: S(`<path d="${GEAR}"/><circle cx="12" cy="12" r="3.2"/>`),
    filter: S('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
    user: S('<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    star: S('<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8L8 13.6 3.8 9.7l5.7-.7z"/>'),
    heart: '<path fill="currentColor" d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.8 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.9 1.4-1.8 2.8-2.9 4.8-2.9 3.4 0 5.6 3.3 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/>',
    trash: S('<path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l1 12.2h9l1-12.2M10.2 11v4.5M13.8 11v4.5"/>'),
    edit: S('<path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5z"/><path d="M14.2 7.8l3 3"/>'),
    share: S('<path d="M12 14.5V4M8 7.8l4-3.8 4 3.8M5.5 12.5v7h13v-7"/>'),
    info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/>') + '<circle cx="12" cy="7.9" r="1.2" fill="currentColor"/>',
    folder: S('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    spark: '<path fill="currentColor" d="M12 3.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2z"/>',
    game: S('<path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.6 2.6 0 0 1-4.4 1.2L14 16h-4l-2.1 2.2a2.6 2.6 0 0 1-4.4-1.2l-.9-4A4.5 4.5 0 0 1 7 7.5z"/><path d="M8 11v3M6.5 12.5h3"/>'),
    home: S('<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
    grid: S('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="3.5"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
    menu: S('<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15"/>'),
  };
  // 하단바에서 고른 탭은 채운 아이콘
  const FILLED = {
    home: '<path fill="currentColor" d="M3.4 10.2L12 3.2l8.6 7V19.2A1.8 1.8 0 0 1 18.8 21H15v-6H9v6H5.2a1.8 1.8 0 0 1-1.8-1.8z"/>',
    grid: '<g fill="currentColor"><rect x="3.5" y="3.5" width="8" height="8" rx="2.2"/><rect x="12.5" y="3.5" width="8" height="8" rx="4"/><rect x="3.5" y="12.5" width="8" height="8" rx="2.2"/><rect x="12.5" y="12.5" width="8" height="8" rx="2.2"/></g>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
    user: '<g fill="currentColor"><circle cx="12" cy="8.3" r="4.2"/><path d="M4.2 20.6a7.8 7.8 0 0 1 15.6 0z"/></g>',
    bell: '<path fill="currentColor" d="M5.2 16.4V11a6.8 6.8 0 0 1 13.6 0v5.4l1.9 2.6H3.3z"/><path d="M9.6 20.4a2.6 2.6 0 0 0 4.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    star: '<path fill="currentColor" d="M12 2.8l2.8 5.7 6.3.8-4.6 4.3 1.2 6.2L12 16.8l-5.7 3 1.2-6.2-4.6-4.3 6.3-.8z"/>',
    heart: ICONS.heart,
    search: '<g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.3"/><path d="M16 16l4 4"/></g>',
    game: '<path fill="currentColor" d="M7 6.8h10a5.2 5.2 0 0 1 5.1 6.3l-.9 4a3.3 3.3 0 0 1-5.6 1.6l-1.9-2h-3.4l-1.9 2a3.3 3.3 0 0 1-5.6-1.6l-.9-4A5.2 5.2 0 0 1 7 6.8z"/><path d="M8 10.8v3.4M6.3 12.5h3.4" stroke="var(--ui-bar)" stroke-width="1.8" stroke-linecap="round"/>',
    settings: `<path fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="${GEAR}M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z"/>`,
    filter: '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/></g><g fill="currentColor"><circle cx="15" cy="7" r="3"/><circle cx="9" cy="17" r="3"/></g>',
  };
  const icon = (name, cls = "ui-ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  const tabIcon = (name) => `<svg class="ui-line" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg><svg class="ui-fill" viewBox="0 0 24 24" aria-hidden="true">${FILLED[name] || ICONS[name] || ""}</svg>`;
  // 정적 HTML 의 아이콘: <button data-ui-icon="search"> · 하단바 <a data-ui-tab-icon="home">홈</a>. 맨 앞에 svg 를 넣고, 이름이 바뀌면 다시 그린다.
  // <svg data-ui-icon="chev" class="ui-chev"> 처럼 svg 에 달면 그 안을 채운다
  const warned = new Set();
  function paintIcon(n) {
    const tab = n.hasAttribute("data-ui-tab-icon"), name = tab ? n.dataset.uiTabIcon : n.dataset.uiIcon;
    if (n instanceof SVGSVGElement) {   // <svg class="ui-chev" data-ui-icon="chev"> 는 그 안을 채운다
      if (n.dataset.uiI === name || !ICONS[name]) return;
      n.setAttribute("viewBox", "0 0 24 24"); n.setAttribute("aria-hidden", "true"); n.innerHTML = ICONS[name]; n.dataset.uiI = name;
      if (!n.getAttribute("class")) n.setAttribute("class", "ui-ic");
      return;
    }
    const old = n.querySelectorAll(":scope > svg[data-ui-i]");
    if (old.length && old[0].dataset.uiI === name) return;
    old.forEach((x) => x.remove());
    if (!ICONS[name]) { if (name && !warned.has(name)) { warned.add(name); console.warn("ui-kit: 없는 아이콘", name); } return; }
    n.insertAdjacentHTML("afterbegin", (tab ? tabIcon(name) : icon(name)).replace(/<svg /g, `<svg data-ui-i="${name}" `));
  }

  /* ---------- 움직임 (화면 전환 · 놀이 효과 · 햅틱) ----------
     숫자는 UIMotion, 실제 시간·곡선은 CSS 토큰에서 읽는다 — 쓰는 쪽 덮어쓰기·손맛·--ui-motion·동작 줄이기가 모두 따라온다.
     움직임은 WAAPI(element.animate)와 <canvas> 로만 한다. <style>·style="" 글을 만들지 않는다(CSP). */
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  // 손맛: 가장 가까운 [data-ui-feel] (컨테이너마다 달 수 있다). 없거나 모르는 값이면 calm
  const feelOf = (n) => { const f = (n?.closest?.("[data-ui-feel]") || root).dataset.uiFeel; return Motion.feelNames.includes(f) ? f : "calm"; };
  // --ui-motion 배율(0 이면 끔). n 자리에서 잰다
  const motionOn = (n = root) => { const v = parseFloat(getComputedStyle(n.nodeType === 1 ? n : root).getPropertyValue("--ui-motion")); return Number.isFinite(v) ? Math.max(0, v) : 1; };
  const cssVar = (n, name) => getComputedStyle(n.nodeType === 1 ? n : root).getPropertyValue(`--ui-${name}`).trim();
  // 토큰 하나를 실제 시간(ms)·곡선으로: 보이지 않는 칸에 transition 으로 걸어 계산된 값을 읽는다
  function cssMotion(name, at = doc.body) {
    const p = doc.createElement("i"); p.hidden = true; (at === root ? doc.body : at).appendChild(p);
    p.style.setProperty("transition", `opacity var(--ui-dur-${name}, 0s) var(--ui-ease-${name}, ease)`);
    const cs = getComputedStyle(p), t = cs.transitionDuration, out = { ms: parseFloat(t) * (t.endsWith("ms") ? 1 : 1000) || 0, ease: cs.transitionTimingFunction };
    p.remove(); return out;
  }
  const settled = (a) => a.finished.then(() => {}, () => {});

  // 화면 전환: update(화면을 바꾸는 함수)를 한 번 부르고, 바뀐 화면이 그 종류대로 들어온다. 끝나면 풀리고, update 가 던지면 거절된다
  let goSeq = 0;
  async function transition(update, { type = "fade", event } = {}) {
    const run = () => (typeof update === "function" ? update() : undefined);
    if (!Motion.recipes.transition[type]) type = "fade";
    // 브라우저가 이미 그린 뒤로 가기(스와이프) 위에는 또 그리지 않는다. --ui-motion 0 이면 그냥 바꾼다
    if (event?.hasUAVisualTransition || !motionOn()) { await run(); return; }
    if (reduceMQ.matches) type = "fade";
    if (typeof doc.startViewTransition === "function") {
      const seq = ++goSeq; root.dataset.uiGo = type;
      // types 를 아는 브라우저에는 함께 넘긴다(쓰는 쪽 CSS 의 :active-view-transition-type 용). 키트 CSS 는 data-ui-go 로 고른다
      const vt = typeof ViewTransition === "function" && "types" in ViewTransition.prototype ? doc.startViewTransition({ update: run, types: [type] }) : doc.startViewTransition(run);
      vt.ready.catch(() => {});
      const clean = () => { if (goSeq === seq) delete root.dataset.uiGo; };
      vt.finished.then(clean, clean);
      await vt.updateCallbackDone;
      await vt.finished.catch(() => {});
      return;
    }
    await run();
    // view transition 이 없는 브라우저: 새 화면만 들어온다
    const scr = doc.querySelector(".ui-screen") || doc.querySelector("main");
    if (!scr?.animate) return;
    const r = Motion.recipes.transition[type], k = motionOn();
    if (r.cross) { const m = cssMotion("fade"); await settled(scr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: m.ms, easing: m.ease })); return; }
    if (r.through) { await settled(scr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: r.in * k, delay: r.out * k, easing: "linear", fill: "backwards" })); return; }
    const m = cssMotion("smooth"), box = scr.getBoundingClientRect(), d = Math.min(r.shift * (r.axis === "x" ? box.width : box.height), r.shiftMax);
    const x = r.axis === "x" ? r.dir * d : 0, y = r.axis === "y" ? r.dir * d : 0;
    scr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: r.fade * k, delay: r.fadeDelay * k, easing: "linear", fill: "backwards" });
    await settled(scr.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], { duration: m.ms, easing: m.ease }));
  }

  // 놀이 효과 — 드문 순간에만(GUIDE 의 빈도 표·절대 규칙). 손맛 단계·--ui-motion·동작 줄이기를 스스로 본다. 모두 Promise.
  // 움직임은 WAAPI 의 개별 속성(scale·translate)으로 — 부품이 쓰는 transform 을 덮지 않는다. 마스코트 앱은 document 의 "ui:play" 를 받아 그림을 그린다
  const levelOf = (n) => (reduceMQ.matches || !motionOn(n) ? "calm" : feelOf(n));
  const play = (kind, level) => fire("ui:play", { kind, level });
  // calm 판: 움직이지 않고 바탕만 한 번 물든다
  function tint(n, token) {
    const to = getComputedStyle(n).backgroundColor, c = cssVar(n, token);
    return settled(n.animate([{ backgroundColor: c }, { backgroundColor: to }], { duration: Motion.recipes.fx.calm.tint.ms, easing: "ease-out" }));
  }
  function punch(n, level) {
    const { scale, ms } = Motion.recipes.fx[level].pop;
    return settled(n.animate(scale.map((v) => ({ scale: String(v) })), { duration: ms * motionOn(n), easing: "ease-out" }));
  }
  const fx = {
    // 즐겨찾기·추가·연속 기록 +1: 한 번 커졌다 돌아온다
    pop(n) {
      if (!n?.animate) return Promise.resolve();
      const level = levelOf(n); play("pop", level);
      return level === "calm" ? tint(n, "accent-weak") : punch(n, level);
    },
    // 틀린 답·잘못된 입력: 짧게 좌우로(300ms). 위험 테두리·아이콘·글은 부르는 쪽이 바꾼다
    shake(n) {
      if (!n?.animate) return Promise.resolve();
      const level = levelOf(n); play("shake", level);
      if (level === "calm") return tint(n, "danger-weak");
      const { x, ms } = Motion.recipes.fx[level].shake;
      return settled(n.animate(x.map((v) => ({ translate: `${v}px 0` })), { duration: ms * motionOn(n), easing: "ease-out" }));
    },
    // 드문 완료: 종이 조각. standard 는 요소 둘레에 조금, playful 은 화면 전체. 입력을 막지 않고, 누르거나 화면을 떠나면 바로 끝난다.
    // once: "id" 면 이 기기에서 한 번만 튼다(두 번째부터는 false). calm·동작 줄이기면 at 요소의 바탕만 물든다
    celebrate({ at, once } = {}) {
      if (once) {
        if (store.get(`fx-once.${once}`)) return Promise.resolve(false);
        store.set(`fx-once.${once}`, "1");   // 저장이 막혀도 축하는 한다
      }
      const atEl = at?.nodeType === 1 ? at : null, level = levelOf(atEl || root); play("celebrate", level);
      if (level === "calm") return atEl ? tint(atEl, "accent-weak").then(() => true) : Promise.resolve(true);
      const { count, ms, local } = Motion.recipes.fx[level].celebrate, life = ms * motionOn(atEl || root);
      const c = el("canvas", "ui-fx-canvas", { "aria-hidden": "true" }); doc.body.appendChild(c);
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      const g = c.getContext("2d"); g.scale(dpr, dpr);
      const r = atEl?.getBoundingClientRect();
      const ox = r ? r.left + r.width / 2 : at?.x ?? W / 2, oy = r ? r.top + r.height / 2 : at?.y ?? H / 3;
      const colors = ["accent", "success", "warning-t", "danger"].map((t) => cssVar(root, t));
      const bits = Array.from({ length: count }, (_, i) => {
        const ang = local ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const sp = local ? 120 + Math.random() * 160 : 380 + Math.random() * 520;
        return { x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colors[i % colors.length] };
      });
      return new Promise((done) => {
        let t0 = null, last = 0, over = false;
        const stop = () => { if (over) return; over = true; c.remove(); removeEventListener("pointerdown", stop, true); doc.removeEventListener("visibilitychange", stop); done(true); };
        addEventListener("pointerdown", stop, { capture: true, passive: true }); doc.addEventListener("visibilitychange", stop);
        const step = (now) => {
          if (over) return;
          if (t0 === null) { t0 = now; last = now; }
          const t = now - t0, dt = Math.min(0.05, (now - last) / 1000); last = now;
          g.clearRect(0, 0, W, H);
          g.globalAlpha = t > life * 0.6 ? Math.max(0, 1 - (t - life * 0.6) / (life * 0.4)) : 1;
          for (const b of bits) {
            b.vy += (local ? 500 : 1500) * dt; b.vx *= 1 - 1.5 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
            g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
          }
          if (t < life) requestAnimationFrame(step); else stop();
        };
        requestAnimationFrame(step);
      });
    },
    // 점수·합계: 숫자를 굴려(ease-out) 바꾸고 끝에 한 번 튄다. 고정폭 숫자. 굴리는 동안 aria-busy 라 읽기 프로그램은 끝값만 읽는다
    count(n, to, { from } = {}) {
      if (!n) return Promise.resolve();
      const cur = from ?? (parseFloat(String(n.textContent).replace(/[^\d.-]/g, "")) || 0);
      const dec = (String(to).split(".")[1] || "").length;
      const fmt = new Intl.NumberFormat(root.lang || undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (getComputedStyle(n).fontVariantNumeric.indexOf("tabular-nums") < 0) n.style.setProperty("font-variant-numeric", "tabular-nums");
      const level = levelOf(n); play("count", level);
      if (reduceMQ.matches || !motionOn(n)) { n.textContent = fmt.format(to); return Promise.resolve(); }
      const ms = Motion.recipes.fx[level].count.ms * motionOn(n);
      n.setAttribute("aria-busy", "true");
      return new Promise((done) => {
        let t0 = null;
        const step = (now) => {
          t0 ??= now; const p = Math.min(1, (now - t0) / ms), e = 1 - (1 - p) ** 3;
          n.textContent = fmt.format(p < 1 ? cur + (to - cur) * e : to);
          if (p < 1) { requestAnimationFrame(step); return; }
          n.removeAttribute("aria-busy");
          (level === "calm" || !n.animate ? Promise.resolve() : punch(n, level)).then(done);
        };
        requestAnimationFrame(step);
      });
    },
  };
  // 손맛 단계: <html data-ui-feel> 에 적고 저장한다(테마·시안처럼). 컨테이너마다 다르게 하려면 그 요소에 data-ui-feel 을 직접
  function setFeel(level, { save = true } = {}) {
    if (!Motion.feelNames.includes(level)) level = "calm";
    root.dataset.uiFeel = level;
    if (save) store.set("feel", level === "calm" ? null : level);
    fire("ui:feel", { feel: level });
  }
  // 햅틱: 앱이 부를 때만(키트 부품은 스스로 울리지 않는다). navigator.playHaptics 가 있는 브라우저에서만, 없으면 조용히 false. UI.config({ haptics:false }) 로 끔
  function haptic(kind = "tick") {
    if (!cfg.haptics || !Motion.recipes.haptic[kind] || typeof navigator.playHaptics !== "function") return false;
    try { const r = navigator.playHaptics(kind); r?.catch?.(() => {}); return true; } catch { return false; }
  }

  /* ---------- 오버레이 ---------- */
  let scroller = null;               // 페이지 대신 스크롤하는 요소가 있으면 UI.setScroller(el)
  const host = () => doc.querySelector(".ui-app") || doc.body;
  function el(tag, cls, attrs = {}) {
    const n = doc.createElement(tag); n.className = cls;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  function part(cls, make) {
    let n = host().querySelector(`:scope > .${cls}`);
    if (!n) { n = make(); host().appendChild(n); }
    return n;
  }
  const openOverlay = () => host().querySelector(":scope > .ui-sheet.ui-show, :scope > .ui-dialog.ui-show");
  const scrim = () => part("ui-scrim", () => { const n = el("div", "ui-scrim", { hidden: "" }); n.addEventListener("click", () => closeTop()); return n; });
  function lock(on) {
    root.style.overflow = on ? "hidden" : "";
    if (scroller) scroller.style.overflowY = on ? "hidden" : "";
  }
  // CSS 에 적힌 전환 시간(지연 포함)만큼 기다린다. 시간을 CSS 에서만 바꿔도 끊기지 않게
  function afterTransition(n, fn) {
    const cs = getComputedStyle(n);
    const secs = (v) => v.split(",").map((s) => parseFloat(s) * (s.trim().endsWith("ms") ? 0.001 : 1) || 0);
    const d = secs(cs.transitionDuration), w = secs(cs.transitionDelay);
    const ms = Math.max(0, ...d.map((x, i) => (x + (w[i % w.length] || 0)) * 1000));
    if (ms < 1) fn(); else setTimeout(fn, ms + 40);
  }
  // 플랫폼의 닫기 요청(Android 뒤로 가기 등): 창이 열려 있는 동안 CloseWatcher 하나. 없는 브라우저는 Esc 만
  let watcher = null;
  function watchClose() {
    if (watcher || typeof window.CloseWatcher !== "function") return;
    try { watcher = new window.CloseWatcher(); watcher.onclose = () => { watcher = null; closeTop(); if (openOverlay()) watchClose(); }; } catch { watcher = null; }
  }
  function unwatchClose() { if (watcher && !openOverlay()) { const w = watcher; watcher = null; w.onclose = null; w.destroy(); } }
  function show(n) {
    n.hidden = false; const s = scrim(); s.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { n.classList.add("ui-show"); s.classList.add("ui-show"); }));
    lock(true); watchClose();
  }
  // done 을 주면(시트를 튕겨 닫을 때의 움직임) 그것이 끝난 뒤 숨긴다. 없으면 CSS 전환 시간만큼
  function hide(n, done) {
    n.classList.remove("ui-show");
    const s = scrim();
    if (!openOverlay()) { s.classList.remove("ui-show"); lock(false); }
    unwatchClose();
    const off = () => { if (!n.classList.contains("ui-show")) n.hidden = true; };
    if (done) done.then(off, off); else afterTransition(n, off);
    afterTransition(s, () => { if (!openOverlay() && !s.classList.contains("ui-show")) s.hidden = true; });
  }
  // 열린 창 안에서만 Tab 이 돈다
  function trapTab(e) {
    const box = openOverlay(); if (!box) return;
    const f = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length > 0);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    const first = f[0], last = f[f.length - 1], cur = doc.activeElement;
    if (!box.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (cur === first || cur === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }

  // 바텀시트
  let sheetState = null, sheetAnim = null;
  // 시트를 from → to(px, 세로)로 스프링 이동(놓는 순간 속도 velocity px/s 를 이어받음). 움직이지 않을 때(동작 줄이기·--ui-motion 0)는 null
  function springTo(n, from, to, velocity) {
    const k = motionOn(n);
    if (!k || reduceMQ.matches || !n.animate) return null;
    const kf = Motion.keyframes(Motion.feels[feelOf(n)].smooth, { from, to, velocity });
    n.style.transition = "none"; n.style.transform = `translateY(${to}px)`;
    return n.animate(kf.values.map((y) => ({ transform: `translateY(${y}px)` })), { duration: Math.max(1, kf.duration * k), easing: "linear" });
  }
  const sheetEl = () => part("ui-sheet", () => {
    const n = el("section", "ui-sheet", { role: "dialog", "aria-modal": "true", tabindex: "-1", hidden: "" });
    let y0 = null, dy = 0, pts = [];
    n.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".ui-grab")) return;
      // 움직이는 중에도 다시 잡는다: 지금 자리에서 이어 끈다
      let cur = 0;
      if (sheetAnim && sheetState) { cur = new DOMMatrixReadOnly(getComputedStyle(n).transform).m42; sheetAnim.cancel(); sheetAnim = null; }
      y0 = e.clientY - cur; dy = cur; pts = [[e.timeStamp, e.clientY]]; n.style.transition = "none"; n.style.transform = `translateY(${cur}px)`; n.setPointerCapture(e.pointerId);
    });
    n.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0); n.style.transform = `translateY(${dy}px)`;
      pts.push([e.timeStamp, e.clientY]); while (pts.length > 2 && e.timeStamp - pts[0][0] > 100) pts.shift();   // 마지막 0.1초만
    });
    // 시트 높이의 4분의 1(최소 80px) 넘게 끌거나, 놓을 때 아래로 빠르면(0.5px/ms 이상, 20px 넘게) 닫는다
    const end = (e) => {
      if (y0 === null) return;
      if (e?.type === "pointerup") { pts.push([e.timeStamp, e.clientY]); while (pts.length > 2 && e.timeStamp - pts[0][0] > 100) pts.shift(); }   // 멈췄다 놓으면 느림
      const [[t0, a], [t1, b]] = [pts[0], pts[pts.length - 1]], v = t1 > t0 ? (b - a) / (t1 - t0) : 0;
      y0 = null;
      if (dy > Math.max(80, n.offsetHeight / 4) || (v >= 0.5 && dy > 20)) { sheet.close({ from: dy, velocity: v * 1000 }); return; }
      // 제자리로: 놓는 순간 속도를 이어받는 스프링(smooth)
      const back = springTo(n, dy, 0, v * 1000);
      if (!back) { n.style.transition = ""; n.style.transform = ""; return; }
      sheetAnim = back;
      back.finished.then(() => { if (sheetAnim === back) { sheetAnim = null; n.style.transition = ""; } }, () => {});
    };
    n.addEventListener("pointerup", end); n.addEventListener("pointercancel", end);
    return n;
  });
  const sheet = {
    open(content, { onClose, grab = true } = {}) {
      const n = sheetEl();
      if (sheetState) sheetState.onClose?.();
      sheetState = { onClose, back: sheetState?.back || doc.activeElement };
      n.replaceChildren();
      if (grab) n.appendChild(el("div", "ui-grab", { "aria-hidden": "true" }));
      if (typeof content === "string") n.insertAdjacentHTML("beforeend", content); else n.appendChild(content);
      const h = n.querySelector("h1, h2, h3");
      if (h) { h.id ||= "ui-sheet-title"; n.setAttribute("aria-labelledby", h.id); } else n.removeAttribute("aria-labelledby");
      sheetAnim?.cancel(); sheetAnim = null; n.style.transition = "";
      n.style.transform = ""; n.scrollTop = 0;
      show(n); layoutSegs(n);
      setTimeout(() => n.focus({ preventScroll: true }), 60);
      return n;
    },
    // from·velocity: 끌다 놓아 닫을 때 — 그 자리·속도에서 이어 빠진다
    close({ from, velocity = 0 } = {}) {
      const n = host().querySelector(":scope > .ui-sheet");
      if (!n || n.hidden || !sheetState) return;
      const st = sheetState; sheetState = null;
      sheetAnim?.cancel(); sheetAnim = null;
      const a = from != null ? springTo(n, from, n.offsetHeight + 16, Math.max(velocity, 0)) : null;
      if (a) {
        sheetAnim = a;
        const done = a.finished.finally(() => { if (sheetAnim === a) sheetAnim = null; n.style.transition = ""; n.style.transform = ""; });
        hide(n, done.then(() => {}, () => {}));
      } else { n.style.transition = ""; n.style.transform = ""; hide(n); }
      st.onClose?.(); st.back?.focus?.({ preventScroll: true });
    },
    get el() { return sheetEl(); },
    get isOpen() { return !!sheetState; },
  };

  // 다이얼로그
  let dlgState = null;
  function dialog({ title = "", body = "", ok = "확인", cancel = "취소", danger = false } = {}) {
    if (dlgState) dlgState.done(false);
    const n = part("ui-dialog", () => el("section", "ui-dialog", { role: "alertdialog", "aria-modal": "true", "aria-labelledby": "ui-dlg-title", tabindex: "-1", hidden: "" }));
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    n.innerHTML = `<h3 id="ui-dlg-title">${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ""}
      <div class="ui-ctas ${cancel ? "ui-even" : "ui-one"}">${cancel ? `<button type="button" class="ui-btn ui-neutral ui-l" data-r="0">${esc(cancel)}</button>` : ""}<button type="button" class="ui-btn ${danger ? "ui-danger" : "ui-primary"} ui-l" data-r="1">${esc(ok)}</button></div>`;
    return new Promise((resolve) => {
      const back = doc.activeElement;
      dlgState = { done(v) { if (!dlgState) return; dlgState = null; hide(n); back?.focus?.({ preventScroll: true }); resolve(v); } };
      n.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) dlgState?.done(b.dataset.r === "1"); };
      show(n);
      setTimeout(() => n.querySelector("[data-r]")?.focus(), 60);
    });
  }
  function closeTop() { if (dlgState) dlgState.done(false); else sheet.close(); }

  // 토스트
  let toastT = 0;
  function toast(msg, { type = "ok", ms = cfg.toastMs } = {}) {
    const n = part("ui-toast", () => el("div", "ui-toast", { role: "status", "aria-live": "polite" }));
    const mark = type === "none" ? "" : `<span class="ui-mark ${type === "err" ? "ui-err" : ""}">${icon(type === "err" ? "x" : "check", "")}</span>`;
    n.innerHTML = `${mark}<span></span>`; n.lastChild.textContent = msg;
    n.classList.add("ui-show"); clearTimeout(toastT);
    toastT = setTimeout(() => n.classList.remove("ui-show"), ms);
  }

  /* ---------- 세그먼트 · 묶음 고르기 ---------- */
  // 고른 칸 뒤로 막대를 놓는다. 크기를 못 재면(숨은 채) 막대를 치우고 CSS 가 고른 칸에 바탕을 준다(data-ui-thumb 없음)
  function layoutSeg(s) {
    let th = s.querySelector(":scope > .ui-thumb");
    if (!th) { th = el("span", "ui-thumb", { "aria-hidden": "true" }); s.appendChild(th); }
    const on = s.querySelector(':scope > button[aria-pressed="true"]');
    if (!on || !on.offsetWidth) { th.style.width = "0"; delete s.dataset.uiThumb; return; }
    const first = !("uiThumb" in s.dataset);
    if (first) th.style.transition = "none";   // 처음 놓을 때는 미끄러지지 않게
    th.style.width = on.offsetWidth + "px"; th.style.transform = `translateX(${on.offsetLeft - parseFloat(getComputedStyle(th).left)}px)`;
    s.dataset.uiThumb = "";
    if (first) { th.offsetWidth; th.style.transition = ""; }
  }
  const layoutSegs = (r = doc) => (r.matches?.(".ui-seg") ? [r] : r.querySelectorAll(".ui-seg")).forEach(layoutSeg);
  // 크기가 바뀌면(글꼴이 늦게 옴, 숨었다 나타남, 폭 바뀜) 다시 놓는다. 그리기 전에 불려 깜빡이지 않는다
  const segRO = new ResizeObserver((es) => es.forEach((e) => layoutSeg(e.target)));
  const watchedSegs = new WeakSet();
  const watchSegs = (r) => (r.matches?.(".ui-seg") ? [r] : r.querySelectorAll(".ui-seg")).forEach((s) => { if (!watchedSegs.has(s)) { watchedSegs.add(s); segRO.observe(s); } });
  // 화살표 키로 고르는 묶음: Tab 은 묶음마다 한 번만 멈추고(roving tabindex), ←→·Home·End 로 포커스와 선택이 함께 옮겨 간다
  const ROVE = [[".ui-tabs", ".ui-tab", "aria-selected"], [".ui-seg", "button", "aria-pressed"], ['.ui-chips[data-ui="single"]', ".ui-chip", "aria-pressed"]];
  const ROVE_GROUP = ROVE.map((r) => r[0]).join(", ");
  const roveOf = (g) => ROVE.find((r) => g.matches(r[0]));
  const roveItems = (g) => { const [, item] = roveOf(g); return [...g.children].filter((x) => x.matches(item) && !x.disabled && !x.hidden); };
  function rove(g) {
    const [sel, , attr] = roveOf(g), its = roveItems(g);
    if (sel === ".ui-tabs") { if (!g.getAttribute("role")) g.setAttribute("role", "tablist"); its.forEach((x) => { if (!x.getAttribute("role")) x.setAttribute("role", "tab"); }); }
    else if (!g.getAttribute("role")) g.setAttribute("role", "group");
    const cur = its.find((x) => x.getAttribute(attr) === "true") || its[0];
    its.forEach((x) => { x.tabIndex = x === cur ? 0 : -1; });
  }
  function roveKey(e) {
    const g = e.target.parentElement;
    if (!g?.matches(ROVE_GROUP) || !e.target.matches(roveOf(g)[1])) return;
    const its = roveItems(g), i = its.indexOf(e.target), n = its.length;
    const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (j === undefined || !n) return;
    e.preventDefault();
    const next = its[(j + n) % n];
    next.focus(); next.click();
  }
  // 묶음에 data-ui-controlled 가 있으면 키트는 선택을 바꾸지 않는다(React 처럼 쓰는 쪽이 상태를 갖고 aria-* 를 그린다). 이벤트는 그대로 보낸다
  const controlled = (g) => g.hasAttribute("data-ui-controlled");
  const pickOne = (btn, sel, attr) => { if (!controlled(btn.parentElement)) btn.parentElement.querySelectorAll(`:scope > ${sel}`).forEach((b) => b.setAttribute(attr, String(b === btn))); };
  const change = (group, item) => group.dispatchEvent(new CustomEvent("ui:change", { bubbles: true, detail: { value: item.value || item.textContent.trim() } }));

  // 시안 점: UI.palDots(el) 로 그리고, 바뀌면 다시 칠한다
  function palDots(target) {
    target.classList.add("ui-pal-dots"); target.setAttribute("role", "group"); target.setAttribute("aria-label", target.getAttribute("aria-label") || "색 시안");
    target.dataset.uiDots = ""; paintDots(target);
  }
  function paintDots(t) {
    const mode = isDark() ? "dark" : "light", cur = root.dataset.uiAccent ? null : getPalette();
    t.innerHTML = PALETTES.map((p) => `<button type="button" class="ui-pal-dot" data-ui-palette="${p.id}" aria-pressed="${p.id === cur}" aria-label="${p.name} 시안" title="${p.name}"></button>`).join("");
    t.querySelectorAll(":scope > .ui-pal-dot").forEach((b, i) => b.style.setProperty("background", PALETTES[i].tokens[mode].accent));   // style 속성 글이 아니라 CSSOM: CSP style-src 'self' 에서도 칠해진다
  }
  function syncDots() {
    doc.querySelectorAll("[data-ui-dots]").forEach(paintDots);
    doc.querySelectorAll("[data-ui-palette]:not(.ui-pal-dot)").forEach((b) => b.setAttribute("aria-pressed", String(!root.dataset.uiAccent && b.dataset.uiPalette === getPalette())));
  }

  /* ---------- 목록-상세 ---------- */
  // .ui-list-detail 의 data-ui-view 를 바꾼다. 좁은 화면(한쪽만 보임)에서는 상세 맨 위가 보이게 옮기고 포커스를 상세로, 목록으로 오면 보던 자리와 연 항목으로 되돌린다.
  // 좁은 화면에서 상세를 열면 방문 기록을 한 칸 쌓는다: 폰·브라우저의 뒤로 가기가 페이지를 떠나지 않고 목록으로 온다(data-ui-history="off" 로 끔)
  const listScroll = new WeakMap(), pushed = new WeakSet();
  let skipPop = 0;
  const histOn = (box) => box.dataset.uiHistory !== "off";
  const histKey = (box) => box.id || String([...doc.querySelectorAll(".ui-list-detail")].indexOf(box));
  function setView(view, box = doc.querySelector(".ui-list-detail"), value, from = doc.activeElement, how) {
    if (!box) return;
    view = view === "detail" ? "detail" : "list";
    const scr = scroller || doc.scrollingElement;
    const list = box.querySelector(":scope > .ui-list-pane"), detail = box.querySelector(":scope > .ui-detail-pane");
    const both = () => [list, detail].every((p) => p && p.getClientRects().length > 0);
    const wasBoth = both();
    if (how !== "pop") {
      if (view === "detail" && !wasBoth && box.dataset.uiView !== "detail" && histOn(box)) {
        const st = history.state && typeof history.state === "object" ? history.state : {};
        history.pushState({ ...st, uiListDetail: histKey(box), uiValue: value ?? null }, "");
        pushed.add(box);
      } else if (view === "list" && pushed.has(box)) {
        // 키트의 뒤로 버튼·setView("list"): 쌓은 칸을 걷는다(그때 오는 popstate 는 무시)
        pushed.delete(box);
        if (history.state?.uiListDetail === histKey(box)) { skipPop++; history.back(); }
      }
    }
    if (view === "detail" && !wasBoth && box.dataset.uiView !== "detail") listScroll.set(box, { y: scr.scrollTop, from });
    box.dataset.uiView = view;
    if (!both()) {
      if (view === "detail") {
        // 상세의 맨 위가 보이게: 붙어 있는 상단바 아래까지만 올린다(페이지 중간에 있어도 그 자리로)
        const bar = [...doc.querySelectorAll(".ui-topbar")].find((x) => x.getClientRects().length && getComputedStyle(x).position === "sticky");
        const top = box.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0) - (bar ? bar.offsetHeight : 0);
        if (top < 0) scr.scrollTop += top;
        if (detail) { if (!detail.hasAttribute("tabindex")) detail.tabIndex = -1; detail.focus({ preventScroll: true }); } }
      else { const st = listScroll.get(box); if (st) { scr.scrollTop = st.y; st.from?.focus?.({ preventScroll: true }); } }
    }
    box.dispatchEvent(new CustomEvent("ui:view", { bubbles: true, detail: { view, value } }));
  }

  addEventListener("popstate", (e) => {
    if (skipPop) { skipPop--; return; }
    doc.querySelectorAll(".ui-list-detail").forEach((box) => {
      const mine = e.state?.uiListDetail === histKey(box);
      if (!mine && pushed.has(box)) { pushed.delete(box); if (box.dataset.uiView === "detail") setView("list", box, undefined, undefined, "pop"); }
      else if (mine && box.dataset.uiView !== "detail" && histOn(box)) {
        // 앞으로 가기: 같은 값으로 상세를 다시 연다
        const v = e.state.uiValue ?? undefined;
        if (v != null) box.querySelectorAll(":scope > .ui-list-pane [data-ui-detail]").forEach((x) => { if (x.dataset.uiDetail === String(v)) x.setAttribute("aria-current", "true"); else x.removeAttribute("aria-current"); });
        pushed.add(box); setView("detail", box, v, undefined, "pop");
      }
    });
  });

  /* ---------- 메뉴 한 벌 ---------- */
  // UI.nav({ items: [{ id, label, icon, href }], current }) 가 [data-ui-nav="gnb|tabbar|floatbar|list"] 자리마다 같은 항목을 그린다.
  // UI.nav.set(id) 는 모든 자리의 aria-current 를 함께 바꾼다. 항목을 누르면 저절로 set 하고 document 에 "ui:nav"(detail.id).
  let navState = null;
  const escHTML = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function paintNav(box) {
    const { items, current } = navState, kind = box.dataset.uiNav;
    box.innerHTML = items.map((it) => {
      const tag = it.href ? "a" : "button";
      const attrs = `${it.href ? `href="${escHTML(it.href)}"` : 'type="button"'} data-ui-nav-id="${escHTML(it.id)}"${it.id === current ? ' aria-current="page"' : ""}`;
      const label = escHTML(it.label);
      if (kind === "gnb") return `<div class="ui-menu"><${tag} ${attrs}>${label}</${tag}></div>`;
      if (kind === "list") return `<${tag} class="ui-row" ${attrs}>${it.icon ? `<span class="ui-tile ui-s">${icon(it.icon)}</span>` : ""}<div class="ui-txt"><span class="ui-t ui-plain">${label}</span></div>${icon("chev", "ui-chev")}</${tag}>`;
      return `<${tag} ${attrs}>${it.icon ? tabIcon(it.icon) : ""}${label}</${tag}>`;   // tabbar · floatbar
    }).join("");
  }
  function nav({ items = [], current } = {}) {
    navState = { items, current: current ?? items[0]?.id };
    doc.querySelectorAll("[data-ui-nav]").forEach(paintNav);
  }
  nav.set = (id) => {
    if (navState) navState.current = id;
    doc.querySelectorAll("[data-ui-nav] [data-ui-nav-id]").forEach((x) => { if (x.dataset.uiNavId === String(id)) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
  };
  nav.get = () => navState?.current ?? null;

  /* ---------- 이벤트 위임 ---------- */
  const choosePalette = (id) => { if (root.dataset.uiAccent) setAccent(null); setPalette(id); };
  doc.addEventListener("click", (e) => {
    const t = e.target;
    const seg = t.closest(".ui-seg > button");
    if (seg) { pickOne(seg, "button", "aria-pressed"); layoutSeg(seg.parentElement); rove(seg.parentElement); change(seg.parentElement, seg); }
    const tab = t.closest(".ui-tabs > .ui-tab");
    if (tab) { pickOne(tab, ".ui-tab", "aria-selected"); rove(tab.parentElement); change(tab.parentElement, tab); }
    const chip = t.closest(".ui-chips[data-ui] > .ui-chip");
    if (chip) {
      if (chip.parentElement.dataset.ui === "multi") { if (!controlled(chip.parentElement)) chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true")); }
      else { pickOne(chip, ".ui-chip", "aria-pressed"); rove(chip.parentElement); }
      change(chip.parentElement, chip);
    }
    const choice = t.closest('.ui-choices[data-ui="single"] > .ui-choice');
    if (choice) { pickOne(choice, ".ui-choice", "aria-pressed"); change(choice.parentElement, choice); }
    // 펼침 메뉴 버튼은 옆에 .ui-drop 이 있는 것만. UI.nav 가 그린 href 없는 항목(<button>)은 그냥 메뉴 항목이다
    let menuBtn = t.closest(".ui-menu > button:not([data-ui-nav-id])");
    if (menuBtn && !menuBtn.parentElement.querySelector(":scope > .ui-drop")) menuBtn = null;
    doc.querySelectorAll(".ui-menu.ui-open").forEach((m) => { if (!menuBtn || m !== menuBtn.parentElement) { m.classList.remove("ui-open"); m.querySelector(":scope > button")?.setAttribute("aria-expanded", "false"); } });
    if (menuBtn) { const m = menuBtn.parentElement, open = !m.classList.contains("ui-open"); m.classList.toggle("ui-open", open); menuBtn.setAttribute("aria-expanded", String(open)); }
    if (t.closest("[data-ui-close]")) closeTop();
    const opener = t.closest(".ui-list-pane [data-ui-detail]");
    if (opener) {
      const box = opener.closest(".ui-list-detail");
      box.querySelectorAll(':scope > .ui-list-pane [data-ui-detail][aria-current="true"]').forEach((x) => x.removeAttribute("aria-current"));
      opener.setAttribute("aria-current", "true");
      setView("detail", box, opener.dataset.uiDetail, opener);
    }
    const back = t.closest("[data-ui-back]");
    if (back) setView("list", back.closest(".ui-list-detail") || undefined);
    if (t.closest("[data-ui-theme]")) cycleTheme();
    const navItem = t.closest("[data-ui-nav] [data-ui-nav-id]");
    if (navItem) { nav.set(navItem.dataset.uiNavId); fire("ui:nav", { id: navItem.dataset.uiNavId }); }
    const pal = t.closest("[data-ui-palette]");
    if (pal && pal.tagName !== "INPUT") choosePalette(pal.dataset.uiPalette);
  });
  doc.addEventListener("change", (e) => { const t = e.target; if (t.matches("input[data-ui-palette]") && t.checked) choosePalette(t.dataset.uiPalette); });
  doc.addEventListener("keydown", (e) => {
    // 창이 열려 있으면 Esc 를 여기서 처리하고 막는다(CloseWatcher 가 한 겹 더 닫지 않게)
    if (e.key === "Escape") { if (openOverlay()) { e.preventDefault(); closeTop(); } doc.querySelectorAll(".ui-menu.ui-open").forEach((m) => m.classList.remove("ui-open")); }
    if (e.key === "Tab") trapTab(e);
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('.ui-row[role="button"]')) { e.preventDefault(); e.target.click(); }
    if (!e.altKey && !e.ctrlKey && !e.metaKey) roveKey(e);
  });
  // 마크업만으로 움직이는 부품을 갖춘다: 처음 그린 것과 나중에 넣은 것(SPA·React) 모두. 읽는 중에는 ready 가 한 번에 한다
  const all = (r, sel) => [...(r.matches?.(sel) ? [r] : []), ...r.querySelectorAll(sel)];
  function enhance(r) {
    watchSegs(r);
    all(r, "[data-ui-icon], [data-ui-tab-icon]").forEach(paintIcon);
    all(r, ROVE_GROUP).forEach(rove);
    const g = r.parentElement?.closest(ROVE_GROUP); if (g) rove(g);   // 묶음에 칸 하나를 나중에 넣은 경우
    if (navState) all(r, "[data-ui-nav]").forEach(paintNav);
  }
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "attributes") {
        if (m.attributeName.startsWith("data-ui-")) { if (m.target.matches("[data-ui-icon], [data-ui-tab-icon]")) paintIcon(m.target); continue; }
        // 쓰는 쪽(React 등)이 고른 칸을 바꾸면 막대와 Tab 멈춤이 따라간다
        const g = m.target.parentElement;
        if (g?.matches(".ui-seg")) layoutSeg(g);
        if (g?.matches(ROVE_GROUP)) rove(g);
        continue;
      }
      for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n);
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ui-icon", "data-ui-tab-icon", "aria-pressed", "aria-selected"] });
  const ready = () => { enhance(doc); doc.fonts?.ready.then(() => layoutSegs()); };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", ready); else ready();

  window.UI = Object.freeze({
    palettes: PALETTES,
    getTheme, isDark, setTheme, cycleTheme, getPalette, setPalette,
    setAccent, accentCSS, getAccent: () => root.dataset.uiAccent || null,
    icon, tabIcon, icons: Object.keys(ICONS), nav,
    toast, sheet, dialog, closeTop, setView, transition, fx: Object.freeze(fx), haptic, setFeel, getFeel: () => feelOf(root),
    layoutSegs, palDots,
    setScroller(n) { scroller = n; },
    config(o = {}) { if (o.toastMs > 0) cfg.toastMs = o.toastMs; if (typeof o.haptics === "boolean") cfg.haptics = o.haptics; return { ...cfg }; },
  });
})();
