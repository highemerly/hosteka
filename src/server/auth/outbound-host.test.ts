import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.fn()
vi.mock('dns/promises', () => ({ default: { lookup: (...args: unknown[]) => lookup(...args) } }))

import { checkOutboundHost, isBlockedHostname, isPrivateAddress } from './outbound-host'

/**
 * ログインの入口（`register`）は未認証で叩けて、本文のホスト名へ
 * こちらから接続する。何も見ないと、クラスタの中だけに見えるものを
 * 外から叩かせられる（blind SSRF）。
 */
beforeEach(() => {
  lookup.mockReset()
  lookup.mockResolvedValue([{ address: '93.184.216.34' }])
})

describe('isBlockedHostname', () => {
  it.each([
    'localhost',
    'redis.hosteka.svc.cluster.local',
    'metadata.google.internal',
    'printer.local',
    'db.private',
    'nas.home',
    'host.lan',
    '1.0.0.127.in-addr.arpa',
  ])('%s は引くまでもなく断る', (host) => {
    expect(isBlockedHostname(host)).toBe(true)
  })

  it('末尾のドットを付けても同じ', () => {
    expect(isBlockedHostname('metadata.google.internal.')).toBe(true)
  })

  it('大文字でも同じ', () => {
    expect(isBlockedHostname('Metadata.Google.Internal')).toBe(true)
  })

  it.each(['mastodon.social', 'misskey.io', 'internal-affairs.example.com'])(
    '%s は通す',
    (host) => {
      expect(isBlockedHostname(host)).toBe(false)
    }
  )
})

describe('isPrivateAddress', () => {
  it.each([
    '0.0.0.0',
    '10.42.0.7',
    '127.0.0.1',
    '169.254.169.254', // クラウドのメタデータ
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1', // CGNAT
    '192.0.0.1', // IETF 用
    '192.0.2.1', // 文書用
    '198.18.0.1', // ベンチマーク
    '198.19.255.255',
    '198.51.100.1', // 文書用
    '203.0.113.1', // 文書用
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'fc00::1',
    'ff02::1',
    '::ffff:10.0.0.1',
    '64:ff9b::1',
  ])('%s は内部とみなす', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['93.184.216.34', '1.1.1.1', '172.32.0.1', '192.167.0.1', '2606:4700::1111'])(
    '%s は外部とみなす',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false)
    }
  )

  /*
    予約されているのは /24 だけ。2つ目の数字までで切ると、隣の実在する
    公開アドレスまで断り、そこに載っているサーバーの人がログインできなくなる。
  */
  it.each([
    '192.0.1.1',
    '192.0.66.1',
    '198.20.0.1',
    '198.51.99.1',
    '198.51.101.1',
    '203.0.112.1',
    '203.0.114.1',
  ])('%s は予約範囲の隣なので外部とみなす', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })

  it('IP として読めないものは通さない', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
    expect(isPrivateAddress('')).toBe(true)
  })
})

describe('checkOutboundHost', () => {
  it('外部のアドレスに解決されるなら通す', async () => {
    expect(await checkOutboundHost('mastodon.social')).toBeNull()
  })

  it('名前の形で断れるものは、引かずに断る', async () => {
    expect(await checkOutboundHost('redis.hosteka.svc.cluster.local')).toBe('blocked-name')
    expect(lookup).not.toHaveBeenCalled()
  })

  /** ワイルドカード DNS（`10-42-0-7.nip.io`）は名前が普通なので、引いて初めて分かる */
  it('内部アドレスに解決される名前は断る', async () => {
    lookup.mockResolvedValue([{ address: '10.42.0.7' }])
    expect(await checkOutboundHost('10-42-0-7.nip.io')).toBe('private-address')
  })

  it('1つでも内部に当たれば断る', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '127.0.0.1' }])
    expect(await checkOutboundHost('dual.example')).toBe('private-address')
  })

  it('引けない名前は接続できない扱いにする', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'))
    expect(await checkOutboundHost('nope.example')).toBe('unresolvable')
  })

  it('空で返ってきたときも接続できない扱いにする', async () => {
    lookup.mockResolvedValue([])
    expect(await checkOutboundHost('empty.example')).toBe('unresolvable')
  })
})
