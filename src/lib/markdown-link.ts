/**
 * 本文（Markdown）のリンクを、このサイトの中か外かに分ける。
 *
 * **文字列の頭で判定しない。** `//evil.example`、`/\evil.example`、
 * `/<タブ>/evil.example` はどれも `/` で始まるが、ブラウザは外のサイトとして
 * 解決する。外へ出るリンクは中間ページ（`/external-link`）を挟む約束なので、
 * 頭の文字で「中」とみなすと、そこを通らずに飛ばせる。
 *
 * ブラウザと同じ規則（WHATWG URL）で、架空のオリジンを基準に解決して、
 * オリジンが変わらないものだけを「中」とする。
 */

const PROBE_ORIGIN = 'https://hosteka.invalid'

export type MarkdownLinkTarget = { kind: 'internal'; href: string } | { kind: 'external'; href: string }

export function markdownLinkTarget(href: string): MarkdownLinkTarget {
  let resolved: URL
  try {
    resolved = new URL(href, PROBE_ORIGIN)
  } catch {
    // 解決できないものはブラウザも遷移できない。中のリンクとして置いておく
    return { kind: 'internal', href }
  }

  if (resolved.origin === PROBE_ORIGIN) return { kind: 'internal', href }
  return { kind: 'external', href: `/external-link?url=${encodeURIComponent(resolved.href)}` }
}
