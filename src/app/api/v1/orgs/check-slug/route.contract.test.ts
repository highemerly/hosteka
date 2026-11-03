import { describe, it, vi, beforeEach } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { GET } from './route'

beforeEach(resetPrismaMock)

describe('GET /api/v1/orgs/check-slug', () => {
  it('slug 未指定は400', async () => {
    await expectContract(await GET(makeRequest('/api/v1/orgs/check-slug')))
  })

  it('未使用の slug は available: true', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/api/v1/orgs/check-slug?slug=newgroup')))
  })

  it('使用中の slug は available: false', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ slug: 'taken' })
    await expectContract(await GET(makeRequest('/api/v1/orgs/check-slug?slug=taken')))
  })

  it('編集時に自分自身を除外できる', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ slug: 'mine' })
    await expectContract(
      await GET(makeRequest('/api/v1/orgs/check-slug?slug=mine&exclude=mine'))
    )
  })
})
