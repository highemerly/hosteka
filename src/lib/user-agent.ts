/**
 * User-Agent から「どの端末か」を読める形にする。
 *
 * **見分けが付けばよい。** ここは自分のセッションの一覧で使うもので、
 * 統計を取る場所ではない。利用者がすることは「この行は自分の端末か」の
 * 判断だけなので、OS とブラウザの2語まで落とす。
 *
 * 生の User-Agent は出さない。1行が3行に折り返すうえ、
 * 見分けに要る語はその中の2つだけ。
 */

/** 上から順に見る。**Edge は Chrome を、Chrome は Safari を名乗る** */
const BROWSERS: [pattern: RegExp, name: string][] = [
  [/\bEdg[A-Z]?\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

/**
 * 上から順に見る。**iPad は Macintosh も名乗る**ので先に置く
 * （デスクトップ表示の iPadOS には iPad の語すら無く、そちらは macOS と出る。
 * ここで見分けようとすると当て推量になるので踏み込まない）。
 */
const PLATFORMS: [pattern: RegExp, name: string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b|\bMac OS X\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
]

function match(table: [RegExp, string][], ua: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(ua)) return name
  }
  return null
}

/**
 * 「macOS / Chrome」のような短い説明。**OS を先に置く** — 端末を
 * 見分ける手がかりとして大きいのは OS のほう（同じ Chrome が何台にも入っている）。
 *
 * どちらも分からなければ「不明な端末」。**生の文字列で埋めない** —
 * 読めない文字列が並ぶと、行を見分けるのがかえって難しくなる。
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '不明な端末'

  const browser = match(BROWSERS, userAgent)
  const platform = match(PLATFORMS, userAgent)

  if (browser && platform) return `${platform} / ${browser}`
  return platform ?? browser ?? '不明な端末'
}

/** 行の左に出す記号を決めるための区分 */
export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'unknown'

/**
 * 端末の区分。**記号を選ぶためだけに使う。**
 *
 * `describeUserAgent` の戻り値を文字列で判定しない（表示のための語を
 * 分岐の入力にすると、語を直した瞬間に記号が壊れる）。
 */
export function deviceKind(userAgent: string | null | undefined): DeviceKind {
  if (!userAgent) return 'unknown'
  if (/\biPad\b|\bTablet\b/.test(userAgent)) return 'tablet'
  // Android のタブレットは Mobile を持たない
  if (/\biPhone\b|\biPod\b|\bMobile\b/.test(userAgent)) return 'mobile'
  if (/\bAndroid\b/.test(userAgent)) return 'tablet'
  if (/\bWindows\b|\bMacintosh\b|\bCrOS\b|\bLinux\b/.test(userAgent)) return 'desktop'
  return 'unknown'
}
