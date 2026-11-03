import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { GET } from './route'

const ctx = { params: Promise.resolve({ orgId: 'my-group' }) }
const request = (query = '') => makeRequest(`/api/v1/orgs/my-group/events${query}`)

beforeEach(() => {
  resetPrismaMock()
  prismaMock.organization.findUnique.mockResolvedValue({ id: 'org_1' })
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.event.count.mockResolvedValue(32)
})

describe('GET /api/v1/orgs/[orgId]/events', () => {
  it('未ログインでも一覧を返す（公開）', async () => {
    await expectContract(await GET(request(), ctx))
  })

  it('ページを指定すると、その位置から返す', async () => {
    await GET(request('?page=2&perPage=12'), ctx)
    expect(prismaMock.event.findMany.mock.calls[0][0].skip).toBe(12)
  })

  /*
    **一覧と件数が同じ where を読む。** 以前はグループ詳細の `_count` に
    where が無く、非公開のイベントまで数えていたので「32件」と出ているのに
    20件しか並ばないことがあった。
  */
  it('一覧と件数に同じ条件を使う', async () => {
    await GET(request(), ctx)
    expect(prismaMock.event.findMany.mock.calls[0][0].where).toEqual(
      prismaMock.event.count.mock.calls[0][0].where
    )
  })

  /*
    **一覧に載せない設定のものも外す。** フォームは「URLを知っている人だけが
    閲覧できる」と約束しているので、未ログインで開けるページに並べない。
  */
  it('無効・非公開・一覧に載せないものを外す', async () => {
    await GET(request(), ctx)
    expect(prismaMock.event.findMany.mock.calls[0][0].where).toEqual({
      AND: [
        { isDisabled: false },
        { isPublic: true },
        { isHighlighted: true },
        { organizationId: 'org_1' },
      ],
    })
  })

  it('大文字のグループIDでも引ける', async () => {
    await GET(makeRequest('/api/v1/orgs/My-Group/events'), {
      params: Promise.resolve({ orgId: 'My-Group' }),
    })
    expect(prismaMock.organization.findUnique.mock.calls[0][0].where).toEqual({
      slug: 'my-group',
    })
  })

  it('居ないグループは404', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null)
    await expectContract(await GET(request(), ctx))
  })
})
