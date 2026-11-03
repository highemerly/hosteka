/**
 * 「場所」の解釈。
 *
 * **1つの欄でリアルの会場とオンラインの会場の両方を受ける。** 別々の欄に
 * 分けると、オンラインのイベントで「場所」が空のまま「関連URL」だけ
 * 埋まる、という読みにくい形になる（実際そうなっていた）。
 *
 * 判定は**書き出しだけ**で決める。`http://` か `https://` で始まれば
 * オンラインの会場、それ以外はリアルの住所。「どこかにURLが含まれるか」で
 * 探すと、「渋谷区…（詳細は https://… ）」のような住所を
 * オンライン扱いにしてしまう。
 *
 * 入力欄（EventFormScreen）と詳細ページ（EventDetailView）で同じ規則を
 * 使う。書き分けると「入力欄では住所として案内したのに詳細ではリンクに
 * なる」ことが起きる。
 */

export type ResolvedLocation =
  | {
      kind: 'url'
      /** 押した先。外部URLは中間ページを挟む */
      href: string
      /** 文字そのものをリンクにするか。URLは押せる見た目が自然 */
      linkText: true
      newTab: false
    }
  | {
      kind: 'place'
      href: string
      linkText: false
      newTab: true
    }

/** `http://` / `https://` で始まるか。前後の空白は無視する */
export function isUrlLocation(location: string): boolean {
  return /^https?:\/\//i.test(location.trim())
}

export function resolveLocation(location: string): ResolvedLocation {
  const trimmed = location.trim()

  if (isUrlLocation(trimmed)) {
    return {
      kind: 'url',
      /*
        主催者が入れた外部URLなので、中間ページを挟む
        （関連URLの欄がそうしていたのと同じ扱い）。
        中間ページは自サイトなので、新しいタブでは開かない。
      */
      href: `/external-link?url=${encodeURIComponent(trimmed)}`,
      linkText: true,
      newTab: false,
    }
  }

  return {
    kind: 'place',
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`,
    linkText: false,
    newTab: true,
  }
}
