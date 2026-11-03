import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptAccessToken: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkPreEventOrganizerPermission: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { decryptAccessToken } from '@/lib/crypto'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)
const mockDecrypt = vi.mocked(decryptAccessToken)
const mockIsOrganizer = vi.mocked(checkPreEventOrganizerPermission)

const params = Promise.resolve({ id: 'pre_1' })

const PRE_EVENT = {
  id: 'pre_1',
  title: '忘年会の日程',
  registrationDeadline: null as Date | null,
}

const RESPONDENT = {
  userId: 'user_2',
  user: {
    id: 'user_2',
    username: 'hanako',
    displayName: '花子',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
}

async function viewerOf(response: Response) {
  const payload = (await response.json()) as {
    data: { viewer: { mayPostDirectly: boolean; canPostDirectly: boolean } }
  }
  return payload.data.viewer
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockDecrypt.mockReset()
  mockIsOrganizer.mockReset()
  mockDecrypt.mockReturnValue('token')
})

describe('GET /api/v1/pre-events/[id]/contact', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('存在しない日程調整は404', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.preEvent.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('主催者でも回答者でもなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
    prismaMock.preEventParticipant.findMany.mockResolvedValue([RESPONDENT])
    mockIsOrganizer.mockResolvedValue(false)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  /*
    **回答者にも開かせる。** 自分の投稿から他の回答者へ声をかけられる。
    ただし直接投稿は主催者だけなので、`mayPostDirectly` は false。
    ここを取り違えると「選べるのに送ると失敗する選択肢」ができる。
  */
  it('回答者は開けるが、直接投稿はできない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
    prismaMock.preEventParticipant.findMany.mockResolvedValue([
      { userId: 'user_1', user: { ...RESPONDENT.user, id: 'user_1' } },
    ])
    mockIsOrganizer.mockResolvedValue(false)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
    expect(await viewerOf(response)).toMatchObject({
      mayPostDirectly: false,
      canPostDirectly: false,
    })
  })

  it('主催者は宛先と自分の投稿手段を受け取れる', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
    prismaMock.preEventParticipant.findMany.mockResolvedValue([RESPONDENT])
    mockIsOrganizer.mockResolvedValue(true)
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
    prismaMock.preEvent.findUnique.mockResolvedValue(PRE_EVENT)
    prismaMock.preEventParticipant.findMany.mockResolvedValue([RESPONDENT])
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: 'enc:v1:x',
      hasWritePermission: stored,
    })

    const response = await GET(makeRequest('/x'), { params })
    expect((await viewerOf(response)).canPostDirectly).toBe(expected)
  })
})
