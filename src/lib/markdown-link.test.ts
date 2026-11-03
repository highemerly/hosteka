import { describe, expect, it } from 'vitest'

import { markdownLinkTarget } from './markdown-link'

describe('markdownLinkTarget', () => {
  it.each(['/events/abc', '/events?page=2', '#section', 'faq', '../orgs/x'])(
    '%s はサイトの中のリンク',
    (href) => {
      expect(markdownLinkTarget(href)).toEqual({ kind: 'internal', href })
    }
  )

  it('外の URL は中間ページを挟む', () => {
    expect(markdownLinkTarget('https://example.com/a?b=c')).toEqual({
      kind: 'external',
      href: `/external-link?url=${encodeURIComponent('https://example.com/a?b=c')}`,
    })
  })

  /*
    **`/` で始まっても外へ出るもの。** ブラウザはどれも evil.example へ解決する。
    頭の文字で判定すると、中間ページを通らずに飛ばせる。
  */
  it.each(['//evil.example/phish', '/\\evil.example/phish', '/\t/evil.example/phish', '\\\\evil.example'])(
    '%j は外のリンクとして中間ページを挟む',
    (href) => {
      const target = markdownLinkTarget(href)
      expect(target.kind).toBe('external')
      expect(decodeURIComponent(target.href)).toContain('https://evil.example/')
    }
  )
})
