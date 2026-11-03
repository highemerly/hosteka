import { describe, it, vi, beforeEach, expect } from 'vitest'

import { prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import {
  checkEventContactPermission,
  checkEventOwnerPermission,
  checkPreEventOwnerPermission,
} from '@/lib/permissions'

/**
 * イベント・日程調整に対する立場ごとの権限。
 *
 * **グループのスタッフはイベントに対しては幹事と同じ。** 編集も連絡もできるが、
 * 中止はできない。管理責任者は作成者と同じで、中止までできる。
 * 日程調整では、中止にあたる操作が削除になる。
 */

const ME = 'user_1'

/** グループ名義のイベント。自分は参加登録していない */
function orgEvent(role: 'admin' | 'staff' | null) {
  prismaMock.event.findUnique.mockResolvedValue({
    creatorId: 'user_9',
    organizationId: 'org_1',
    participants: [],
  })
  prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'user_8' })
  prismaMock.organizationAdmin.findUnique.mockResolvedValue(role ? { role } : null)
}

beforeEach(() => {
  resetPrismaMock()
  prismaMock.eventParticipant.findFirst.mockResolvedValue(null)
})

describe('checkEventContactPermission', () => {
  it('参加登録していなくても、グループのスタッフは参加者へ連絡できる', async () => {
    orgEvent('staff')
    expect(await checkEventContactPermission('evt_1', ME)).toBe(true)
  })

  it('参加記録があれば、一般の参加者も連絡できる', async () => {
    prismaMock.eventParticipant.findFirst.mockResolvedValue({ id: 'p_1' })
    expect(await checkEventContactPermission('evt_1', ME)).toBe(true)
  })

  it('イベントと関わりのない人は連絡できない', async () => {
    orgEvent(null)
    expect(await checkEventContactPermission('evt_1', ME)).toBe(false)
  })
})

describe('checkEventOwnerPermission', () => {
  it('グループの管理責任者は主催者として扱う', async () => {
    orgEvent('admin')
    expect(await checkEventOwnerPermission('evt_1', ME)).toBe(true)
  })

  it('グループのスタッフは主催者として扱わない', async () => {
    orgEvent('staff')
    expect(await checkEventOwnerPermission('evt_1', ME)).toBe(false)
  })

  it('グループの作成者は、役割の行が無くても主催者として扱う', async () => {
    orgEvent(null)
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: ME })
    expect(await checkEventOwnerPermission('evt_1', ME)).toBe(true)
  })
})

describe('checkPreEventOwnerPermission', () => {
  function orgPreEvent(role: 'admin' | 'staff' | null) {
    prismaMock.preEvent.findUnique.mockResolvedValue({ creatorId: 'user_9', organizationId: 'org_1' })
    prismaMock.organization.findUnique.mockResolvedValue({ creatorId: 'user_8' })
    prismaMock.organizationAdmin.findUnique.mockResolvedValue(role ? { role } : null)
  }

  it('作成者は削除できる', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({ creatorId: ME, organizationId: null })
    expect(await checkPreEventOwnerPermission('pre_1', ME)).toBe(true)
  })

  it('グループの管理責任者は削除できる', async () => {
    orgPreEvent('admin')
    expect(await checkPreEventOwnerPermission('pre_1', ME)).toBe(true)
  })

  it('グループのスタッフは削除できない', async () => {
    orgPreEvent('staff')
    expect(await checkPreEventOwnerPermission('pre_1', ME)).toBe(false)
  })
})
