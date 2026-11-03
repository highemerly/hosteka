import { prisma } from '@/lib/prisma'

/**
 * イベントの主催者・幹事・グループのメンバー（管理責任者・スタッフ）かどうかをチェックする
 */
export async function checkOrganizerPermission(eventId: string, userId: string): Promise<boolean> {
  if (!eventId || !userId) return false

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      creatorId: true,
      organizationId: true,
      participants: {
        where: { userId },
        select: { isOrganizer: true }
      }
    }
  })

  if (!event) return false

  // 主催者チェック
  if (event.creatorId === userId) return true

  // 幹事チェック
  const participant = event.participants[0]
  if (participant?.isOrganizer) return true

  // 組織管理者チェック
  if (event.organizationId) {
    const orgAdmin = await prisma.organizationAdmin.findUnique({
      where: {
        organizationId_userId: {
          organizationId: event.organizationId,
          userId: userId
        }
      }
    })
    if (orgAdmin) return true
  }

  return false
}

/**
 * イベントの主催者かどうか。作成者、またはグループ名義なら
 * グループの管理責任者。**幹事とグループのスタッフは含まない。**
 *
 * 中止のように取り消せない操作に使う。幹事もスタッフも、イベントに対しては
 * 主催者を手伝う立場で、イベントそのものを畳む判断までは任せない。
 */
export async function checkEventOwnerPermission(eventId: string, userId: string): Promise<boolean> {
  if (!eventId || !userId) return false

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { creatorId: true, organizationId: true },
  })
  if (!event) return false
  if (event.creatorId === userId) return true

  return event.organizationId
    ? checkOrgAdminRolePermission(event.organizationId, userId)
    : false
}

/**
 * イベントの参加者へ連絡できるか。主催者・幹事・グループのメンバーに加えて、
 * **参加記録のある人なら誰でも**（参加者どうしの連絡も受け付ける）。
 *
 * 画面の取得と2つの投稿 API が同じ判定を使う。以前はそれぞれが手書きしていて、
 * 3本ともグループのメンバーを見ていなかった。
 */
export async function checkEventContactPermission(eventId: string, userId: string): Promise<boolean> {
  if (!eventId || !userId) return false

  const participant = await prisma.eventParticipant.findFirst({
    where: { eventId, userId },
    select: { id: true },
  })
  if (participant) return true

  return checkOrganizerPermission(eventId, userId)
}

/**
 * 組織の管理者かどうかをチェックする（admin/staff問わず）
 */
export async function checkOrgAdminPermission(orgId: string, userId: string): Promise<boolean> {
  if (!orgId || !userId) return false

  const admin = await prisma.organizationAdmin.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userId
      }
    }
  })

  return !!admin
}

/**
 * 組織の「管理者」(admin役割)かどうかをチェックする
 * スタッフは含まない - 組織の編集・削除・管理者管理に必要
 * 作成者は常に管理者権限を持つ
 */
export async function checkOrgAdminRolePermission(orgId: string, userId: string): Promise<boolean> {
  if (!orgId || !userId) return false

  // 組織を取得して作成者かどうかもチェック
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { creatorId: true }
  })

  // 作成者は常に管理者権限を持つ
  if (org?.creatorId === userId) return true

  // OrganizationAdminテーブルでadmin役割をチェック
  const admin = await prisma.organizationAdmin.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userId
      }
    }
  })

  return admin?.role === 'admin'
}

/**
 * 日程調整の主催者または組織管理者かどうかをチェックする
 */
export async function checkPreEventOrganizerPermission(preEventId: string, userId: string): Promise<boolean> {
  if (!preEventId || !userId) return false

  const preEvent = await prisma.preEvent.findUnique({
    where: { id: preEventId },
    select: { creatorId: true, organizationId: true }
  })

  if (!preEvent) return false

  // 主催者チェック
  if (preEvent.creatorId === userId) return true

  // 組織管理者チェック
  if (preEvent.organizationId) {
    const orgAdmin = await prisma.organizationAdmin.findUnique({
      where: {
        organizationId_userId: {
          organizationId: preEvent.organizationId,
          userId: userId
        }
      }
    })
    if (orgAdmin) return true
  }

  return false
}

/**
 * 日程調整の主催者かどうか。作成者、またはグループ名義なら
 * グループの管理責任者。**グループのスタッフは含まない。**
 *
 * 削除（日程調整の取り消し）に使う。イベントの中止と同じく、スタッフは
 * 編集や連絡はできても、畳む判断までは任せない（`checkEventOwnerPermission`）。
 */
export async function checkPreEventOwnerPermission(preEventId: string, userId: string): Promise<boolean> {
  if (!preEventId || !userId) return false

  const preEvent = await prisma.preEvent.findUnique({
    where: { id: preEventId },
    select: { creatorId: true, organizationId: true },
  })
  if (!preEvent) return false
  if (preEvent.creatorId === userId) return true

  return preEvent.organizationId
    ? checkOrgAdminRolePermission(preEvent.organizationId, userId)
    : false
}
