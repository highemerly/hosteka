import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { GET } from './route'

const NOW = new Date('2026-06-15T12:00:00+09:00')

const PUBLISHED = {
  id: 1,
  type: 'info',
  title: 'カレンダーの改善',
  body: '## 変わったこと\n\n- 予定が見やすくなりました',
  publishedAt: new Date('2026-06-14T00:00:00.000Z'),
  pinnedUntil: null,
}

function call(id: string) {
  return GET(makeRequest(`/api/v1/announcements/${id}`), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  resetPrismaMock()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

describe('GET /api/v1/announcements/[id]', () => {
  it('公開済みで本文のあるものを返す', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(PUBLISHED)
    await expectContract(await call('1'))
  })

  it('無いものは404', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null)
    await expectContract(await call('999'))
  })

  it('連番でない id は DB に問い合わせずに弾く（cuid だった頃の URL を含む）', async () => {
    const response = await call('cmu711zqe0000ottzlxlf7hqb')
    expect(response.status).toBe(400)
    expect(prismaMock.announcement.findUnique).not.toHaveBeenCalled()
  })

  it('本文の無いものは404（題名だけのページへ連れて行かない）', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ ...PUBLISHED, body: null })
    expect((await call('1')).status).toBe(404)
  })

  it('公開前のものは404（予約の存在ごと隠す）', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      ...PUBLISHED,
      publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    expect((await call('1')).status).toBe(404)
  })
})
