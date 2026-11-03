import '@testing-library/dom'

/**
 * jsdom は ResizeObserver を持っていない。
 *
 * Radix の一部（`ToggleSwitch` のつまみなど）が要素の大きさを測るために
 * 使うので、無害な空実装を置く。**測れた値はテストで使わない** —
 * 見たいのは見た目ではなく状態なので、0 のままで困らない。
 */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

/**
 * jsdom は `matchMedia` を持っていない。
 *
 * テーマの切り替え（`useTheme`）が OS の設定を読むのに使うので、
 * **ヘッダーを含む画面を描くテストは全部ここで落ちる。**
 * 「ダークではない」と答える最小の実装を置く。
 * 実際の切り替えを見たいテストは、各自でこれを差し替えること。
 */
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia
}
