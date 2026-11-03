/**
 * Cloudflare の訪問者位置ヘッダ。
 *
 * ダッシュボードで **"Add visitor location headers" を On** にしていることが前提。
 * 付いていなければ全部 null になり、画面はその欄を出さない
 * （ローカル開発と、CF を通さない経路がこれ）。
 *
 * 使うのは国（`cf-ipcountry`）と地域（`cf-region`）だけ。
 * **緯度経度や郵便番号までは持たない** — セッション一覧で人がすることは
 * 「自分の心当たりと合うか」の判断で、それには国と地域で足りる。
 */

export type Geo = {
  /**
   * ISO 3166-1 alpha-2。
   * **`T1`（Tor 経由）だけは CF 独自のコードのまま持つ** — 「分からない」
   * （`XX` → null）と一緒にすると、Tor から入られたことが記録から消える。
   */
  country: string | null
  /** 地域名。CF は英語で返す（例: Tokyo, California） */
  region: string | null
}

/** Tor 出口ノードに CF が付ける擬似国コード */
export const TOR_COUNTRY = 'T1'

/** 列の長さに合わせて切る。ヘッダは相手（CDN）が決めるので長さを信用しない */
const REGION_MAX = 64

export function readGeoFromHeaders(headers: Headers): Geo {
  const raw = headers.get('cf-ipcountry')?.trim().toUpperCase() ?? ''
  const region = headers.get('cf-region')?.trim().slice(0, REGION_MAX) || null

  // XX は「分からない」。国コードとして持たない。
  // 数字を許すのは T1（Tor）を通すため
  const country = /^[A-Z][A-Z0-9]$/.test(raw) && raw !== 'XX' ? raw : null

  return { country, region }
}

/**
 * 国名。**英語で出す** — 地域名は CF が英語で返すので、国だけ訳すと
 * 「日本 / Tokyo」のように1行の中で言語が混ざる。
 *
 * **表を持たない。** `Intl.DisplayNames` が ICU の名前を返す。
 * 環境によっては無いのでコードのまま返す（`of` は入力をそのまま返す）。
 */
export function countryName(country: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country
  } catch {
    return country
  }
}

/**
 * 一覧に出す場所。「Japan / Tokyo」。**分かっているところまでしか書かない。**
 * 何も分からなければ null（欄ごと出さない。「不明」の行を並べても読む意味がない）。
 *
 * **出す側が見出しに「（推定）」を付けること。** IP から引いた地域は、
 * 回線の事業者の拠点が出ることが多く、隣の県が出ても珍しくない。
 * 言い切ると、自分の端末を身に覚えのない端末だと思わせる。
 */
export function formatGeo(geo: Geo): string | null {
  if (geo.country === TOR_COUNTRY) return 'Tor 経由'
  if (!geo.country) return geo.region
  const country = countryName(geo.country)
  return geo.region ? `${country} / ${geo.region}` : country
}
