import { describe, expect, it } from 'vitest'

import { describeUserAgent, deviceKind } from './user-agent'

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 iPad',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  curl: 'curl/8.7.1',
}

describe('describeUserAgent', () => {
  it('OS とブラウザを2語で返す', () => {
    expect(describeUserAgent(UA.chromeMac)).toBe('macOS / Chrome')
    expect(describeUserAgent(UA.safariIphone)).toBe('iPhone / Safari')
    expect(describeUserAgent(UA.firefoxAndroid)).toBe('Android / Firefox')
  })

  it('Edge は Chrome を名乗る。先に見ないと全部 Chrome になる', () => {
    expect(describeUserAgent(UA.edgeWindows)).toBe('Windows / Edge')
  })

  it('iOS の Chrome は CriOS。Safari と混ざらない', () => {
    expect(describeUserAgent(UA.chromeIos)).toBe('iPhone / Chrome')
  })

  it('iPad は Macintosh も名乗る。先に見ないと macOS になる', () => {
    expect(describeUserAgent(UA.safariIpad)).toBe('iPad / Safari')
  })

  it('片方しか分からなければ分かったほうだけ返す', () => {
    expect(describeUserAgent(UA.curl)).toBe('不明な端末')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
  })

  it('記録が無いときも文字列を返す。空欄にすると行が欠けて見える', () => {
    expect(describeUserAgent(null)).toBe('不明な端末')
    expect(describeUserAgent('')).toBe('不明な端末')
  })
})

describe('deviceKind', () => {
  it('記号を選ぶための区分を返す', () => {
    expect(deviceKind(UA.chromeMac)).toBe('desktop')
    expect(deviceKind(UA.safariIphone)).toBe('mobile')
    expect(deviceKind(UA.safariIpad)).toBe('tablet')
    expect(deviceKind(UA.firefoxAndroid)).toBe('mobile')
    expect(deviceKind(UA.curl)).toBe('unknown')
    expect(deviceKind(null)).toBe('unknown')
  })

  it('Mobile を持たない Android はタブレット扱い', () => {
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36')).toBe(
      'tablet'
    )
  })
})
