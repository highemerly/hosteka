import { describe, expect, it } from 'vitest'

import { isUrlLocation, resolveLocation } from './location'

/**
 * 「場所」の解釈。
 *
 * 1つの欄でリアルの会場とオンラインの会場を受けるので、**判定を外すと
 * 行き先ごと間違える**（Discord の招待URLで Google マップを検索する、
 * 住所を外部リンクとして開く）。書き出しだけで決めることを固定しておく。
 */
describe('isUrlLocation', () => {
  it.each([
    ['https://discord.gg/AbCdEfG', true],
    ['http://example.com/room', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['  https://discord.gg/AbCdEfG  ', true],
    ['渋谷区道玄坂1-2-3 サンプルビル 5F', false],
    ['', false],
    // 途中のURLで引っ張られない。会場は現地にある
    ['渋谷区道玄坂1-2-3（詳細は https://example.com/access ）', false],
    // スキームのないドメインは住所として扱う。判定は書き出しだけで決める
    ['discord.gg/AbCdEfG', false],
  ])('%s → %s', (input, expected) => {
    expect(isUrlLocation(input)).toBe(expected)
  })
})

describe('resolveLocation', () => {
  it('URLは中間ページ経由で開く（主催者が入れた外部URLなので）', () => {
    const r = resolveLocation('https://discord.gg/AbCdEfG')
    expect(r.kind).toBe('url')
    expect(r.href).toBe(
      '/external-link?url=' + encodeURIComponent('https://discord.gg/AbCdEfG')
    )
    // 中間ページは自サイト。新しいタブでは開かない
    expect(r.newTab).toBe(false)
    // 長いURLは押せる見た目のほうが自然
    expect(r.linkText).toBe(true)
  })

  it('住所は Google マップの検索へ送る', () => {
    const r = resolveLocation('渋谷区道玄坂1-2-3')
    expect(r.kind).toBe('place')
    expect(r.href).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('渋谷区道玄坂1-2-3')
    )
    expect(r.newTab).toBe(true)
    // 住所は本文として読ませる。行き先は右端の地図ボタンが持つ
    expect(r.linkText).toBe(false)
  })

  it('前後の空白は行き先に持ち込まない', () => {
    expect(resolveLocation('  https://discord.gg/x  ').href).toBe(
      '/external-link?url=' + encodeURIComponent('https://discord.gg/x')
    )
  })
})
