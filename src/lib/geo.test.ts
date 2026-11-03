import { describe, expect, it } from 'vitest'

import { countryName, formatGeo, readGeoFromHeaders } from './geo'

const headers = (init: Record<string, string>) => new Headers(init)

describe('readGeoFromHeaders', () => {
  it('国と地域を読む', () => {
    expect(readGeoFromHeaders(headers({ 'cf-ipcountry': 'JP', 'cf-region': 'Tokyo' }))).toEqual({
      country: 'JP',
      region: 'Tokyo',
    })
  })

  it('ヘッダが無ければ全部 null。CF を通さない経路がこれ', () => {
    expect(readGeoFromHeaders(headers({}))).toEqual({ country: null, region: null })
  })

  it('XX は「分からない」。国コードとして扱わない', () => {
    expect(readGeoFromHeaders(headers({ 'cf-ipcountry': 'XX' })).country).toBeNull()
  })

  it('T1（Tor）はそのまま持つ。XX と同じ扱いにすると記録から消える', () => {
    expect(readGeoFromHeaders(headers({ 'cf-ipcountry': 'T1' })).country).toBe('T1')
  })

  it('国コードの形をしていない値は捨てる。ヘッダの中身は相手が決める', () => {
    expect(readGeoFromHeaders(headers({ 'cf-ipcountry': 'JAPAN' })).country).toBeNull()
    expect(readGeoFromHeaders(headers({ 'cf-ipcountry': '' })).country).toBeNull()
  })

  it('地域は列の長さに合わせて切る', () => {
    // ヘッダは ByteString なので ASCII で試す（CF の地域名も英語）
    const long = 'A'.repeat(100)
    expect(readGeoFromHeaders(headers({ 'cf-region': long })).region).toHaveLength(64)
  })
})

describe('countryName', () => {
  it('国名は英語にする（地域名と言語を揃える）', () => {
    expect(countryName('JP')).toBe('Japan')
  })
})

describe('formatGeo', () => {
  it('国と地域を「/」でつなぐ', () => {
    expect(formatGeo({ country: 'JP', region: 'Tokyo' })).toBe('Japan / Tokyo')
  })

  it('地域が無ければ国だけ', () => {
    expect(formatGeo({ country: 'JP', region: null })).toBe('Japan')
  })

  it('国が無くて地域だけ分かれば地域だけ', () => {
    expect(formatGeo({ country: null, region: 'Tokyo' })).toBe('Tokyo')
  })

  it('何も分からなければ null。「不明」の行を並べない', () => {
    expect(formatGeo({ country: null, region: null })).toBeNull()
  })

  it('Tor は国の代わりにそう言う', () => {
    expect(formatGeo({ country: 'T1', region: null })).toBe('Tor 経由')
  })
})
