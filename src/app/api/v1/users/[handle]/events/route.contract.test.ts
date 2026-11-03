import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { GET } from './route'

const ctx = (handle: string) => ({ params: Promise.resolve({ handle }) })
const request = (query = '') =>
  makeRequest(`/api/v1/users/taro@example.social/events${query}`)

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1', ban: null })
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.event.count.mockResolvedValue(45)
})

describe('GET /api/v1/users/[handle]/events', () => {
  it('未ログインでも一覧を返す（公開）', async () => {
    await expectContract(await GET(request(), ctx('taro@example.social')))
  })

  /*
    **ページ送りで全部見られる。** 以前は詳細が先頭20件だけを詰めて返し、
    あふれたぶんはイベント一覧へ送っていたが、送った先でこの人のものだけを
    絞れないので探し直しになっていた。
  */
  it('ページを指定すると、その位置から返す', async () => {
    await GET(request('?page=3&perPage=12'), ctx('taro@example.social'))
    const args = prismaMock.event.findMany.mock.calls[0][0]
    expect(args.skip).toBe(24)
    expect(args.take).toBe(12)
  })

  it('総ページ数を meta に入れる', async () => {
    const response = await GET(request('?perPage=20'), ctx('taro@example.social'))
    const body = (await response.json()) as { meta: { total: number; totalPages: number } }
    expect(body.meta).toMatchObject({ total: 45, totalPages: 3 })
  })

  /** 一覧と件数が同じ where を読む。ずれると「45件」と出て20件しか出ない */
  it('一覧と件数に同じ条件を使う', async () => {
    await GET(request(), ctx('taro@example.social'))
    expect(prismaMock.event.findMany.mock.calls[0][0].where).toEqual(
      prismaMock.event.count.mock.calls[0][0].where
    )
  })

  it('指定が無ければ、所属グループのものも含める', async () => {
    await GET(request(), ctx('taro@example.social'))
    expect(prismaMock.event.findMany.mock.calls[0][0].where.AND).toEqual([
      { isDisabled: false },
      { isPublic: true },
      { isHighlighted: true },
      {
        OR: [
          { creatorId: 'user_1' },
          { organization: { admins: { some: { userId: 'user_1' } } } },
        ],
      },
    ])
  })

  it('scope=personal ならグループ名義のものを除く', async () => {
    await GET(request('?scope=personal'), ctx('taro@example.social'))
    expect(prismaMock.event.findMany.mock.calls[0][0].where.AND).toEqual([
      { isDisabled: false },
      { isPublic: true },
      { isHighlighted: true },
      { creatorId: 'user_1' },
      { organizationId: null },
    ])
  })

  it('知らない scope は400', async () => {
    const response = await GET(request('?scope=everything'), ctx('taro@example.social'))
    expect(response.status).toBe(400)
  })

  it('居ない人は404', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expectContract(await GET(request(), ctx('nobody@example.social')))
  })

  /** 詳細が 404 なのに一覧だけ開ける、という状態を作らない */
  it('停止中の人は404', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1', ban: { id: 'ban_1' } })
    const response = await GET(request(), ctx('taro@example.social'))
    expect(response.status).toBe(404)
    expect(prismaMock.event.findMany).not.toHaveBeenCalled()
  })

  it('ハンドルの形になっていなければ404。DBも引かない', async () => {
    await expectContract(await GET(request(), ctx('taro')))
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
