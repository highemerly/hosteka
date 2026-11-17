import { describe, expect, it } from 'vitest'

import { attachmentDisposition } from './content-disposition'

describe('attachmentDisposition', () => {
  /*
    **Safari は `filename="..."` の %XX を戻さない。** 日本語のタイトルが
    `%E6%98%A5...ics` という名前で保存されていた。`filename*` に UTF-8 で渡す。
  */
  it('日本語のファイル名は filename* に UTF-8 で渡す', () => {
    expect(attachmentDisposition('春の勉強会.ics')).toBe(
      `attachment; filename="_____.ics"; filename*=UTF-8''%E6%98%A5%E3%81%AE%E5%8B%89%E5%BC%B7%E4%BC%9A.ics`
    )
  })

  it("filename* に使えない `'()*` も逃がす", () => {
    expect(attachmentDisposition("it's (draft)*.csv")).toContain(
      `filename*=UTF-8''it%27s%20%28draft%29%2A.csv`
    )
  })

  it('filename には ASCII だけを、引用符と改行を潰して入れる', () => {
    const header = attachmentDisposition('a"b\\c\r\nX-Evil: 1.ics')
    expect(header).toContain('filename="a_b_c__X-Evil: 1.ics"')
    expect(header).not.toMatch(/[\r\n]/)
  })
})
