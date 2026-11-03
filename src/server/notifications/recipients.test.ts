import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { prismaMock, resetPrismaMock } from '@/test/contract'

import {
  listEventOrganizerIds,
  listEventParticipantIds,
  listPreEventOrganizerIds,
  listPreEventRespondentIds,
} from './recipients'

/**
 * 通知の宛先。
 *
 * **`src/lib/permissions.ts` と条件を揃えること。** 片方だけ直すと
 * 「操作はできるのに通知が来ない人」ができる。
 */
beforeEach(() => {
  resetPrismaMock()
})

describe('イベントの主催・幹事', () => {
  it('作成者・幹事・グループの管理者を集めて重複を落とす', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: 'org_1',
      participants: [{ userId: 'staff_1' }, { userId: 'staff_2' }],
    })
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'host_1' })
    prismaMock.organizationAdmin.findMany.mockResolvedValue([
      { userId: 'admin_1' },
      { userId: 'staff_1' },
    ])

    expect(await listEventOrganizerIds('evt_1')).toEqual([
      'host_1',
      'staff_1',
      'staff_2',
      'admin_1',
    ])
  })

  /**
   * `checkOrganizerPermission` は参加状態を見ていない。
   * こちらだけ見ると「参加者を編集できるのに通知が来ない幹事」ができる
   */
  it('幹事は参加状態で絞らない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: null,
      participants: [],
    })

    await listEventOrganizerIds('evt_1')

    const select = prismaMock.event.findUnique.mock.calls[0][0].select
    expect(select.participants.where).toEqual({ isOrganizer: true })
  })

  it('グループに属していなければ管理者を引かない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: null,
      participants: [],
    })

    expect(await listEventOrganizerIds('evt_1')).toEqual(['host_1'])
    expect(prismaMock.organizationAdmin.findMany).not.toHaveBeenCalled()
  })

  it('イベントが無ければ空', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null)
    expect(await listEventOrganizerIds('evt_1')).toEqual([])
  })
})

describe('日程調整の主催', () => {
  /** `pre_event_participants` に isOrganizer が無いので、幹事という役割が存在しない */
  it('作成者とグループの管理者だけ', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: 'org_1',
    })
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: null })
    prismaMock.organizationAdmin.findMany.mockResolvedValue([{ userId: 'admin_1' }])

    expect(await listPreEventOrganizerIds('pre_1')).toEqual(['host_1', 'admin_1'])
  })

  /** 行が無くても作成者は常に管理者（checkOrgAdminRolePermission と同じ扱い） */
  it('グループの作成者は管理者の行が無くても含む', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: 'org_1',
    })
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'owner_1' })
    prismaMock.organizationAdmin.findMany.mockResolvedValue([])

    expect(await listPreEventOrganizerIds('pre_1')).toEqual(['host_1', 'owner_1'])
  })
})

describe('イベントの参加者', () => {
  /** 欠席とキャンセルの人に「日時が変わりました」を送っても仕方がない */
  it('回答を出している人だけに絞る', async () => {
    prismaMock.eventParticipant.findMany.mockResolvedValue([{ userId: 'user_1' }])

    await listEventParticipantIds('evt_1')

    expect(prismaMock.eventParticipant.findMany.mock.calls[0][0].where).toEqual({
      eventId: 'evt_1',
      status: { in: ['attending', 'maybe', 'participation_request'] },
    })
  })
})

describe('日程調整の回答者', () => {
  /** 候補日ごとに行があるので、同じ人が何行も出てくる */
  it('候補日ごとの行をまとめて1人にする', async () => {
    prismaMock.preEventParticipant.findMany.mockResolvedValue([
      { userId: 'user_1' },
      { userId: 'user_1' },
      { userId: 'user_2' },
    ])

    expect(await listPreEventRespondentIds('pre_1')).toEqual(['user_1', 'user_2'])
  })
})
