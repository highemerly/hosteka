import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
  revokeUserSessions: vi.fn(),
}))

import { getSession, isAdminUser, revokeUserSessions } from '@/server/auth/session'
import { POST } from './route'

const ID = 'clbanuserxxxxxxxxxxxxxxx1'
const args = { params: Promise.resolve({ id: ID }) }

const TARGET = {
  id: ID,
  username: 'spammer',
  server: 'example.social',
  platform: 'mastodon',
  isAdmin: false,
  ban: null,
}

/** $transaction(コールバック) を、同じモックをそのまま渡して実行する */
function runTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
  )
}

const ban = (body: unknown = { reason: 'スパム投稿' }) =>
  POST(makeRequest(`/api/v1/admin/users/${ID}/ban`, { method: 'POST', body }), args)

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.admin)
  vi.mocked(isAdminUser).mockResolvedValue(true)
  vi.mocked(revokeUserSessions).mockResolvedValue(1)
  prismaMock.user.findUnique.mockResolvedValue(TARGET)
  runTransaction()
})

/**
 * BAN は**停止**であって削除ではない。
 *
 * 以前は `users` の行を消しており、BAN の根拠になった通報も、主催していた
 * ものも、参加の記録も cascade で一緒に消えていた。ここで固定するのは
 * 「消さないこと」そのもの — 消す実装に戻ると通報の記録が黙って失われる。
 */
describe('POST /api/v1/admin/users/[id]/ban', () => {
  it('ユーザーを削除しない', async () => {
    await ban()
    expect(prismaMock.user.delete).not.toHaveBeenCalled()
    expect(prismaMock.user.deleteMany).not.toHaveBeenCalled()
  })

  it('停止の記録を、当人を指した状態で作る', async () => {
    await ban()
    expect(prismaMock.bannedUser.create.mock.calls[0][0].data).toMatchObject({
      userId: ID,
      username: 'spammer',
      server: 'example.social',
      platform: 'mastodon',
      reason: 'スパム投稿',
      bannedByAdmin: PERSONAS.admin.user.id,
    })
  })

  it('主催しているイベントと日程調整を無効化する（既に無効なものは触らない）', async () => {
    await ban()
    expect(prismaMock.event.updateMany).toHaveBeenCalledWith({
      where: { creatorId: ID, isDisabled: false },
      data: { isDisabled: true },
    })
    expect(prismaMock.preEvent.updateMany).toHaveBeenCalledWith({
      where: { creatorId: ID, isDisabled: false },
      data: { isDisabled: true },
    })
  })

  it('参加・回答・通報の記録には触らない', async () => {
    await ban()
    for (const model of [
      prismaMock.eventParticipant,
      prismaMock.preEventParticipant,
      prismaMock.report,
      prismaMock.eventAttendance,
    ]) {
      expect(model.delete).not.toHaveBeenCalled()
      expect(model.deleteMany).not.toHaveBeenCalled()
    }
  })

  it('停止の記録を作る前にセッションを失効させる', async () => {
    await ban()
    expect(revokeUserSessions).toHaveBeenCalledWith(ID)
    const revokedAt = vi.mocked(revokeUserSessions).mock.invocationCallOrder[0]
    const createdAt = prismaMock.bannedUser.create.mock.invocationCallOrder[0]
    expect(revokedAt).toBeLessThan(createdAt)
  })

  it('既に停止されていれば 409 で、二重に記録しない', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...TARGET, ban: { id: 'ban_1' } })
    const res = await ban()
    expect(res.status).toBe(409)
    expect(prismaMock.bannedUser.create).not.toHaveBeenCalled()
  })

  it('管理者は BAN できない', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...TARGET, isAdmin: true })
    const res = await ban()
    expect(res.status).toBe(400)
    expect(revokeUserSessions).not.toHaveBeenCalled()
  })

  it('居なければ 404', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await ban()
    expect(res.status).toBe(404)
  })

  it('理由が空なら 400（何も起こさない）', async () => {
    const res = await ban({ reason: '   ' })
    expect(res.status).toBe(400)
    expect(revokeUserSessions).not.toHaveBeenCalled()
    expect(prismaMock.bannedUser.create).not.toHaveBeenCalled()
  })
})
