import { describe, it, vi, beforeEach, expect } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))
vi.mock('@/server/notifications/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/notifications/notify')>()),
  notifyAfter: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { PUT } from './route'

/**
 * **グループ（主催の名義）を変えられるのは作成者だけ**（`canChangeOrganization`）。
 *
 * 幹事やグループのスタッフも編集はできる。名義まで変えられると、自分が
 * 管理するグループへ付け替えて、そのグループの管理責任者として中止の
 * 権限を取れる。外すのも同じで、元のグループの管理者から取り上げられる。
 */

const ME = PERSONAS.user.user.id
const SOMEONE_ELSE = 'clcreatorxxxxxxxxxxxxxxx1'

/** guard・権限・本体の3回引かれる event.findUnique を1つで賄う。閲覧者は幹事 */
function event(creatorId: string, organizationId: string | null) {
  return {
    id: 'evt_1',
    isDisabled: false,
    creatorId,
    organizationId,
    status: 'published',
    startDate: new Date('2026-09-12T00:00:00+09:00'),
    terms: null,
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowParticipationRequest: true,
    participants: [
      {
        userId: ME,
        status: 'attending',
        isOrganizer: true,
        user: { platform: 'mastodon', server: 'example.social' },
      },
    ],
  }
}

function body(organizationId: string) {
  return {
    title: 'テストイベント',
    description: '',
    hashtags: [],
    startDate: '2026-09-12',
    startTime: '',
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
    allowParticipationRequest: true,
    optionGroups: [],
    organizationId,
  }
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

async function put(organizationId: string) {
  return PUT(makeRequest('/api/v1/events/evt_1', { method: 'PUT', body: body(organizationId) }), ctx)
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.user)
  prismaMock.$transaction.mockResolvedValue(undefined)
  prismaMock.eventOptionGroup.findMany.mockResolvedValue([])
  // 付け替え先のグループでは、閲覧者はスタッフ（誰でもグループを作れば管理者になれる）
  prismaMock.organizationAdmin.findUnique.mockResolvedValue({ role: 'staff' })
})

describe('PUT /api/v1/events/[id] のグループ', () => {
  it('幹事は、自分が管理するグループへ付け替えられない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event(SOMEONE_ELSE, null))

    expect((await put('org_mine')).status).toBe(403)
  })

  it('幹事は、グループから外せない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event(SOMEONE_ELSE, 'org_theirs'))

    expect((await put('')).status).toBe(403)
  })

  it('幹事でも、グループを変えない編集は通る（空文字と null は同じ「グループなし」）', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event(SOMEONE_ELSE, null))

    expect((await put('')).status).toBe(200)
  })

  it('作成者は、自分が管理するグループへ付け替えられる', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event(ME, null))

    expect((await put('org_mine')).status).toBe(200)
  })

  it('作成者でも、管理していないグループへは付けられない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event(ME, null))
    prismaMock.organizationAdmin.findUnique.mockResolvedValue(null)

    expect((await put('org_other')).status).toBe(403)
  })
})
