import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptAccessToken: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { decryptAccessToken } from '@/lib/crypto'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)
const mockDecrypt = vi.mocked(decryptAccessToken)

const params = Promise.resolve({ id: 'evt_1' })

const EVENT = {
  id: 'evt_1',
  title: '交流会',
  creatorId: 'user_1',
  registrationDeadlineDate: null as Date | null,
  registrationDeadlineTime: null as string | null,
  participants: [
    {
      userId: 'user_2',
      status: 'attending',
      user: {
        id: 'user_2',
        username: 'hanako',
        displayName: '花子',
        avatar: null,
        server: 'example.social',
        platform: 'mastodon',
      },
    },
  ],
}

async function body(response: Response) {
  return (await response.json()) as { data?: unknown; error?: { code: string } }
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockDecrypt.mockReset()
  mockDecrypt.mockReturnValue('token')
})

describe('GET /api/v1/events/[id]/contact', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('存在しないイベントは404', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('主催者でも参加者でもなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue({
      ...EVENT,
      creatorId: 'someone_else',
      participants: [],
    })
    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  it('主催者は宛先と自分の投稿手段を受け取れる', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(EVENT)
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: 'enc:v1:x',
      hasWritePermission: true,
    })

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
    await expectContract(response)
  })

  /*
    **投稿の権限は `false` と分かっているときだけ「駄目」にする。**
    `null`（この列より前に入ったユーザー）は分からないだけなので、
    従来どおり送ってみて、断られたら入り直しへ案内する。
  */
  it.each([
    [true, true],
    [null, true],
    [false, false],
  ])('hasWritePermission が %s なら canPostDirectly は %s', async (stored, expected) => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(EVENT)
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: 'enc:v1:x',
      hasWritePermission: stored,
    })

    const response = await GET(makeRequest('/x'), { params })
    const payload = (await body(response)) as {
      data: { viewer: { canPostDirectly: boolean } }
    }
    expect(payload.data.viewer.canPostDirectly).toBe(expected)
  })

  /*
    時刻列は文字列で、古いデータには `9:00`（0詰めなし）が入りうる。
    **そのまま日時に組むと Invalid Date になり、500 になる。**
  */
  it('締切の時刻列が壊れていても500にしない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue({
      ...EVENT,
      registrationDeadlineDate: new Date('2026-09-10T00:00:00.000Z'),
      registrationDeadlineTime: '9:00',
    })
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: 'enc:v1:x',
      hasWritePermission: true,
    })

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
  })
})
