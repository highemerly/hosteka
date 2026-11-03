import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkOrganizerPermission: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { checkOrganizerPermission } from '@/lib/permissions'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsOrganizer = vi.mocked(checkOrganizerPermission)

const params = Promise.resolve({ id: 'evt_1' })

const USER = {
  id: 'user_2',
  username: 'hanako',
  displayName: '花子',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
  // Prisma が返しうる機密。DTOに出てはならない
  accessToken: 'enc:v1:SECRET',
}

const EVENT = {
  id: 'evt_1',
  title: '交流会',
  status: 'published',
  allowMaybe: true,
  allowParticipationRequest: true,
  creatorId: 'user_1',
  optionGroups: [
    {
      id: 'g1',
      title: '食事',
      responseType: 'single',
      options: [{ id: 'o1', name: '肉', maxParticipants: 10 }],
    },
    {
      id: 'g2',
      title: 'どこで知りましたか',
      responseType: 'text',
      options: [],
    },
  ],
  participants: [
    {
      id: 'p1',
      userId: 'user_2',
      status: 'attending',
      comment: 'よろしく',
      isOrganizer: false,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      user: USER,
      groupSelections: [
        { groupId: 'g1', textAnswer: null, options: [{ option: { id: 'o1', name: '肉' } }] },
        { groupId: 'g2', textAnswer: '友人から', options: [] },
      ],
    },
  ],
}

async function dataOf(response: Response) {
  const payload = (await response.json()) as { data: Record<string, unknown> }
  return payload.data
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsOrganizer.mockReset()
  mockIsOrganizer.mockResolvedValue(true)
})

describe('GET /api/v1/events/[id]/manage-participants', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('主催者・幹事でなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    mockIsOrganizer.mockResolvedValue(false)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  it('存在しないイベントは404', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  /*
    **選んだオプションのIDを返す。** 詳細のDTOは名前しか持たないので、
    これが無いと編集画面の初期値を作れない。
  */
  it('参加者と、選んだオプションのIDを返す', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(EVENT)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
    await expectContract(response)
  })

  it('幹事の指定ができるのは作成者だけ', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, creatorId: 'someone_else' })

    const data = await dataOf(await GET(makeRequest('/x'), { params }))
    expect(data.viewer).toEqual({ isCreator: false })
  })

  it('機密が混じらない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.event.findUnique.mockResolvedValue(EVENT)

    const response = await GET(makeRequest('/x'), { params })
    expect(JSON.stringify(await response.json())).not.toContain('SECRET')
  })
})
