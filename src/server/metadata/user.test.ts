import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { getUserProfileMetadata } from './user'

const USER = {
  username: 'taro',
  displayName: 'テスト太郎',
  server: 'example.social',
  bio: 'よろしくお願いします',
  ban: null,
}

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue(USER)
})

describe('getUserProfileMetadata', () => {
  it('名前とIDを題名にする', async () => {
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.title).toBe('テスト太郎（@taro@example.social） - Hosteka')
  })

  it('自己紹介を description にする', async () => {
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.description).toBe('よろしくお願いします')
    expect(meta.openGraph?.description).toBe('よろしくお願いします')
  })

  /*
    **改行が残ると description ごと出力から落ちる**（`<meta content>` の
    中に生の改行が入るため）。自己紹介は Markdown なので普通に改行が入る。
    実際にリンクプレビューが空になっていた。
  */
  it('自己紹介の改行を畳む', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...USER,
      bio: '### はじめまして\n\n毎月オフ会を\nしています。',
    })
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.description).toBe('### はじめまして 毎月オフ会を しています。')
    expect(meta.description).not.toContain('\n')
  })

  it('長い自己紹介は切る', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, bio: 'あ'.repeat(300) })
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.description).toHaveLength(160)
    expect(meta.description?.endsWith('...')).toBe(true)
  })

  it('自己紹介が無ければ既定の文を出す', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, bio: null })
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.description).toContain('テスト太郎（@taro@example.social）のページです。')
  })

  it('空白だけの自己紹介は既定の文に倒す', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, bio: '   \n  ' })
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.description).toContain('のページです。')
  })

  /* 存在しないハンドルの URL はいくらでも作れるので、索引させない */
  it('ハンドルの形になっていなければ索引させない。DBも引かない', async () => {
    const meta = await getUserProfileMetadata('taro')
    expect(meta.title).toBe('ユーザーが見つかりません - Hosteka')
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('居ない人は索引させない', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const meta = await getUserProfileMetadata('nobody@example.social')
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('停止中の人は索引させない。名前も出さない', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, ban: { id: 'ban_1' } })
    const meta = await getUserProfileMetadata('taro@example.social')
    expect(meta.title).toBe('ユーザーが見つかりません - Hosteka')
    expect(JSON.stringify(meta)).not.toContain('テスト太郎')
  })

  it('大文字混じりでも正規化して引く', async () => {
    await getUserProfileMetadata('Taro@Example.Social')
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({
      username_server: { username: 'taro', server: 'example.social' },
    })
  })

  /* 流入は Fediverse のリンクプレビュー。クローラーは JS を実行しない */
  it('OGP を付ける', async () => {
    const meta = await getUserProfileMetadata('taro@example.social')
    /*
      Next の Metadata 型は openGraph / twitter を種類ごとの判別ユニオンで
      持つので、素の値として見る。
    */
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('profile')
    expect((meta.twitter as { card?: string } | undefined)?.card).toBe('summary')
  })
})
