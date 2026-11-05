import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { POST } from './route'

/**
 * **作ったものは `{ id }` だけを返す。** 画面は詳細ページへ移るだけで、中身は
 * `GET /pre-events/[id]` が DTO にして返す。以前は Prisma の行をそのまま返していて、
 * 列を足すと黙って外へ出る作りだった。
 */

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  // select を無視して行を丸ごと返しても、応答に出ないことを見る
  prismaMock.preEvent.create.mockResolvedValue({ id: 'pre_new', isDisabled: false, creatorId: PERSONAS.user.user.id })
})

describe('POST /api/v1/pre-events の応答', () => {
  it('id だけを返す', async () => {
    const res = await POST(
      makeRequest('/api/v1/pre-events', {
        method: 'POST',
        body: {
          title: 'テスト日程調整',
          description: '',
          location: '',
          fee: '',
          terms: '',
          relatedUrl: '',
          dateOptions: [{ startDate: '2030-02-01T10:00:00.000Z', endDate: null }],
          registrationDeadline: null,
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          isAllowedForTwitter: false,
          allowedFediverseServers: [],
          allowAutoRegistration: false,
          isPublic: true,
          isHighlighted: false,
        },
      })
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: 'pre_new' } })
  })
})
