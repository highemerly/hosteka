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
 * `GET /events/[id]` が DTO にして返す。以前は Prisma の行をそのまま返していて、
 * 列を足すと黙って外へ出る作りだった。
 */

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
  // select を無視して行を丸ごと返しても、応答に出ないことを見る
  prismaMock.event.create.mockResolvedValue({ id: 'evt_new', isDisabled: false, creatorId: PERSONAS.user.user.id })
})

describe('POST /api/v1/events の応答', () => {
  it('id だけを返す', async () => {
    const res = await POST(
      makeRequest('/api/v1/events', {
        method: 'POST',
        body: {
          title: 'テストイベント',
          description: '',
          hashtags: [],
          startDate: '2030-01-15',
          startTime: '19:00',
          endTime: '',
          location: '',
          fee: '',
          relatedUrl: '',
          terms: '',
          registrationDeadlineTime: '',
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          isAllowedForTwitter: false,
          allowedFediverseServers: [],
          isPublic: true,
          isHighlighted: false,
          allowMaybe: true,
          allowParticipationRequest: false,
          optionGroups: [],
        },
      })
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: 'evt_new' } })
  })
})
