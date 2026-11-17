/* ui-kit 0.4.3 */
// ui-kit 전역 타입 — ui.js 가 window 에 만드는 UI 와 UIColor.
// 쓰는 쪽(TypeScript·Vite)에서: tsconfig 의 "include" 에 이 파일을 넣거나, 아무 .ts 파일 맨 위에
//   /// <reference path="../vendor/ui-kit/ui.d.ts" />
// ui.js 는 <script> 로 읽는다(모듈이 아니다). 그래서 import 하지 않고 전역으로 쓴다.

export {};

declare global {
  type UIPaletteId = "blue" | "mint" | "sunset" | "mono";
  type UITheme = "light" | "dark";
  /** 색 토큰 이름(앞의 --ui- 를 뺀 것) → 값 */
  type UITokens = Record<string, string>;

  interface UIPalette {
    readonly id: UIPaletteId;
    readonly name: string;
    readonly desc: string;
    readonly accent: string;
    readonly accentDark?: string;
    readonly tokens: { readonly light: UITokens; readonly dark: UITokens };
  }

  interface UINavItem {
    id: string;
    label: string;
    /** UI.icons 의 이름 */
    icon?: string;
    /** 없으면 <button> 으로 그린다 */
    href?: string;
  }

  interface UINav {
    /** [data-ui-nav="gnb|tabbar|floatbar|list"] 자리마다 같은 항목을 그린다 */
    (options: { items: UINavItem[]; current?: string }): void;
    /** 모든 자리의 aria-current 를 함께 바꾼다 */
    set(id: string): void;
    get(): string | null;
  }

  type UIFeel = "calm" | "standard" | "playful";
  type UITransitionType = "forward" | "back" | "tab" | "up" | "down" | "fade";
  type UIHapticKind = "hint" | "edge" | "tick" | "align" | "success" | "error";
  /** 스프링 성질: duration(초, 체감 시간) · bounce(−1~1, 넘침) */
  interface UISpring { duration: number; bounce?: number }

  interface UIFx {
    /** 즐겨찾기·추가: 한 번 커졌다 돌아옴(calm·동작 줄이기는 바탕만 물듦) */
    pop(el: Element): Promise<void>;
    /** 틀린 답·잘못된 입력: 짧게 좌우로(300ms) */
    shake(el: Element): Promise<void>;
    /** 드문 완료: 종이 조각. once 면 이 기기에서 한 번만(두 번째부터 false) */
    celebrate(options?: { at?: Element | { x: number; y: number }; once?: string }): Promise<boolean>;
    /** 점수·합계를 굴려 바꿈 */
    count(el: Element, to: number, options?: { from?: number }): Promise<void>;
  }

  interface UISheet {
    /** 바텀시트(데스크톱은 가운데 창)를 연다. 안에 h1~h3 이 있으면 그것으로 이름을 붙인다 */
    open(content: string | Node, options?: { onClose?: () => void; grab?: boolean }): HTMLElement;
    /** from·velocity(px/s) 는 끌다 놓아 닫을 때 키트가 쓴다 */
    close(options?: { from?: number; velocity?: number }): void;
    readonly el: HTMLElement;
    readonly isOpen: boolean;
  }

  interface UIDialogOptions {
    title?: string;
    body?: string;
    ok?: string;
    /** 빈 글이면 확인 버튼만 */
    cancel?: string;
    danger?: boolean;
  }

  interface UIKit {
    readonly palettes: readonly UIPalette[];
    getTheme(): UITheme | null;
    isDark(): boolean;
    /** null 이면 시스템 설정을 따른다. 저장한다 */
    setTheme(theme: UITheme | null, options?: { save?: boolean }): void;
    cycleTheme(): UITheme | null;
    getPalette(): UIPaletteId;
    setPalette(id: UIPaletteId, options?: { save?: boolean }): void;
    /** 내 색: 포인트 색 하나로 라이트·다크 전부. null 이면 끔 */
    setAccent(accent: string | null): void;
    getAccent(): string | null;
    /** 그 포인트 색으로 만든 라이트·다크 CSS (붙여 쓸 것) */
    accentCSS(accent: string): string;

    /** <svg class="ui-ic"> 글. 없는 이름이면 빈 svg */
    icon(name: string, cls?: string): string;
    /** 하단바용 선·채운 아이콘 한 쌍 */
    tabIcon(name: string): string;
    readonly icons: readonly string[];
    readonly nav: UINav;

    toast(message: string, options?: { type?: "ok" | "err" | "none"; ms?: number }): void;
    readonly sheet: UISheet;
    /** 확인 → true, 취소·바깥·Esc → false */
    dialog(options?: UIDialogOptions): Promise<boolean>;
    /** 맨 위 다이얼로그나 시트를 닫는다 */
    closeTop(): void;
    /** 목록-상세(.ui-list-detail) 전환. root 가 없으면 문서의 첫 것. 좁은 화면에서 상세로 가면 방문 기록 한 칸(data-ui-history="off" 로 끔),
     *  화면 전환 forward·back(data-ui-transition="off" 로 끔). 바뀌기를 마치면 풀린다 */
    setView(view: "list" | "detail", root?: Element, value?: string): Promise<void>;

    /** 화면 전환: update 를 한 번 부르고 그 종류대로 바뀐다. update 가 던지면 거절. event.hasUAVisualTransition 이면 움직이지 않음 */
    transition(update: () => unknown, options?: { type?: UITransitionType; event?: { hasUAVisualTransition?: boolean } }): Promise<void>;
    /** 놀이 효과(드문 순간에만) */
    readonly fx: UIFx;
    /** 햅틱: navigator.playHaptics 가 있을 때만. 울렸으면 true */
    haptic(kind?: UIHapticKind): boolean;
    /** 손맛 단계(기본 calm). <html data-ui-feel> 에 적고 저장한다 */
    setFeel(level: UIFeel, options?: { save?: boolean }): void;
    getFeel(): UIFeel;

    /** 세그먼트 막대를 다시 놓는다. 보통은 저절로 된다(크기·선택이 바뀌면) */
    layoutSegs(root?: ParentNode | Element): void;
    /** 시안 점을 그린다 */
    palDots(el: Element): void;
    /** 페이지 대신 스크롤하는 요소(시트를 열 때 잠근다) */
    setScroller(el: Element | null): void;
    config(options?: { toastMs?: number; haptics?: boolean }): { toastMs: number; haptics: boolean };
  }

  interface UIColorKit {
    readonly palettes: readonly UIPalette[];
    /** [밝기, 채도, 색상] */
    oklch(hex: string): [number, number, number];
    from(L: number, C: number, H: number): string;
    mix(a: string, b: string, t?: number): string;
    contrast(a: string, b: string): number;
    derive(spec: { accent: string; accentDark?: string; tint?: number; light?: UITokens; dark?: UITokens }): { light: UITokens; dark: UITokens };
    /** 대비 기준을 못 넘는 것 목록 */
    check(tokens: UITokens): { a: string; b: string; min: number; ratio: number }[];
    css(tokens: { light: UITokens; dark: UITokens }, base?: string): string;
  }

  /** 움직임 원본(시간·곡선·스프링·손맛·레시피). Node 에서도 돈다 */
  interface UIMotionKit {
    readonly dur: Readonly<Record<string, number>>;
    readonly ease: Readonly<Record<string, readonly [number, number, number, number]>>;
    readonly feels: Readonly<Record<UIFeel, Readonly<Record<string, unknown>>>>;
    readonly feelNames: readonly UIFeel[];
    readonly recipes: Readonly<Record<string, unknown>>;
    physics(spring: UISpring): { stiffness: number; dampingRatio: number; damping: number; omega: number };
    settle(spring: UISpring, v0?: number, eps?: number): number;
    overshoot(spring: UISpring, v0?: number): number;
    linear(spring: UISpring, options?: { eps?: number; step?: number; digits?: number }): { easing: string; duration: number; points: number };
    keyframes(spring: UISpring, options: { from: number; to: number; velocity?: number; fps?: number }): { values: number[]; duration: number };
    impulse(spring: UISpring, options?: { peak?: number; fps?: number }): { values: number[]; duration: number };
    compose(spring: UISpring): { dampingRatio: number; stiffness: number };
    fromPhysics(p: { dampingRatio: number; stiffness: number }): { duration: number; bounce: number };
    tokens(feel?: UIFeel): Record<string, string | number>;
  }

  /** 키트가 보내는 이벤트 */
  interface DocumentEventMap {
    "ui:theme": CustomEvent<{ theme: UITheme | null; dark: boolean }>;
    "ui:palette": CustomEvent<{ palette: UIPaletteId }>;
    "ui:accent": CustomEvent<{ accent: string | null }>;
    "ui:nav": CustomEvent<{ id: string }>;
    "ui:feel": CustomEvent<{ feel: UIFeel }>;
    /** 놀이 효과를 틀 때(마스코트 앱이 그림을 그림) */
    "ui:play": CustomEvent<{ kind: "pop" | "shake" | "celebrate" | "count"; level: UIFeel }>;
  }
  interface HTMLElementEventMap {
    /** 세그먼트·탭·칩·고르기 칸 묶음에서 */
    "ui:change": CustomEvent<{ value: string }>;
    /** .ui-list-detail 에서 */
    "ui:view": CustomEvent<{ view: "list" | "detail"; value?: string }>;
  }

  interface Window {
    UI: UIKit;
    UIColor: UIColorKit;
    UIMotion: UIMotionKit;
  }
  const UI: UIKit;
  const UIColor: UIColorKit;
  const UIMotion: UIMotionKit;
}
