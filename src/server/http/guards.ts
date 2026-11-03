import 'server-only'

import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'
import {
  checkOrgAdminPermission,
  checkOrgAdminRolePermission,
  checkEventOwnerPermission,
  checkOrganizerPermission,
  checkPreEventOrganizerPermission,
  checkPreEventOwnerPermission,
} from '@/lib/permissions'
import { isAdminUser, type Session } from '@/server/auth/session'

import { ApiError } from './errors'

/**
 * リソースIDを必要とする権限判定。
 *
 * defineRoute の auth モードでは表現できない（「このグループの管理者か」は
 * パスパラメータを見ないと決まらない）ため、合成可能なガードとして渡す。
 *
 * 権限ロジック自体は既存の lib/permissions.ts をそのまま使う。
 * あれはユニットテスト済みなので、ここで書き直さない。
 */

/** slug から組織を引く。無ければ404 */
export async function loadOrgBySlug(slug: string) {
  const org = await prisma.organization.findUnique({
    where: { slug: normalizeSlug(slug) },
    // name は通知の写しに使う（グループ名を出すため）
    select: { id: true, slug: true, name: true, creatorId: true },
  })
  if (!org) throw ApiError.notFound('グループが見つかりません')
  return org
}

/** admin ロール（または作成者）のみ。編集・削除に使う */
export function requireOrgAdminRole<P extends { orgId: string }>(action: string) {
  return async ({ params, session }: { params: P; session: Session }) => {
    const org = await loadOrgBySlug(params.orgId)
    const allowed = await checkOrgAdminRolePermission(org.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden(`グループの${action}は管理者のみ可能です`)
    }
  }
}

/** admin / staff いずれか。閲覧系に使う */
export function requireOrgMember<P extends { orgId: string }>() {
  return async ({ params, session }: { params: P; session: Session }) => {
    const org = await loadOrgBySlug(params.orgId)
    const allowed = await checkOrgAdminPermission(org.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden('このグループの管理者ではありません')
    }
  }
}

const EVENT_NOT_FOUND = 'イベントが見つかりません'
const PRE_EVENT_NOT_FOUND = '日程調整が見つかりません'

/**
 * イベントを引く。無い、または管理者が無効化していれば404。
 *
 * **主催者にも404を返す。** 無効化は「管理者以外には無い」ことにする操作で、
 * 主催者だけ操作を続けられると、止めたはずのイベントから参加者へ
 * 連絡（SNS への投稿）が出せてしまう。
 */
export async function loadVisibleEvent(id: string, session: Session | null) {
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, isDisabled: true },
  })
  if (!event) throw ApiError.notFound(EVENT_NOT_FOUND)
  await hideDisabledFromNonAdmins(event.isDisabled, session, EVENT_NOT_FOUND)
  return event
}

/** 日程調整を引く。無い、または管理者が無効化していれば404 */
export async function loadVisiblePreEvent(id: string, session: Session | null) {
  const preEvent = await prisma.preEvent.findUnique({
    where: { id },
    select: { id: true, isDisabled: true },
  })
  if (!preEvent) throw ApiError.notFound(PRE_EVENT_NOT_FOUND)
  await hideDisabledFromNonAdmins(preEvent.isDisabled, session, PRE_EVENT_NOT_FOUND)
  return preEvent
}

/**
 * 無効化されていないイベントにだけ通す。**主催者でなくてよい操作**
 * （参加登録・参加者の連絡画面など）に使う。主催者の操作は
 * `requireEventOrganizer` が同じ判定を含んでいる。
 */
export function requireVisibleEvent<P extends { id: string }>() {
  return async ({ params, session }: { params: P; session: Session }) => {
    await loadVisibleEvent(params.id, session)
  }
}

/** 無効化されていない日程調整にだけ通す（回答など） */
export function requireVisiblePreEvent<P extends { id: string }>() {
  return async ({ params, session }: { params: P; session: Session }) => {
    await loadVisiblePreEvent(params.id, session)
  }
}

/** イベントの主催者・幹事・所属グループ管理者のみ */
export function requireEventOrganizer<P extends { id: string }>(action = '操作') {
  return async ({ params, session }: { params: P; session: Session }) => {
    const event = await loadVisibleEvent(params.id, session)

    const allowed = await checkOrganizerPermission(event.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden(`イベントの${action}は主催者・幹事のみ可能です`)
    }
  }
}

/**
 * イベントの主催者・所属グループの管理責任者のみ。**幹事とスタッフは通さない**。
 * 中止のように取り消せない操作に使う（`checkEventOwnerPermission`）。
 */
export function requireEventOwner<P extends { id: string }>(action = '操作') {
  return async ({ params, session }: { params: P; session: Session }) => {
    const event = await loadVisibleEvent(params.id, session)

    const allowed = await checkEventOwnerPermission(event.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden(`イベントの${action}は主催者のみ可能です`)
    }
  }
}

/** 日程調整の主催者・幹事のみ */
export function requirePreEventOrganizer<P extends { id: string }>(action = '操作') {
  return async ({ params, session }: { params: P; session: Session }) => {
    const preEvent = await loadVisiblePreEvent(params.id, session)

    const allowed = await checkPreEventOrganizerPermission(preEvent.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden(`日程調整の${action}は主催者・幹事のみ可能です`)
    }
  }
}

/**
 * 日程調整の主催者・所属グループの管理責任者のみ。**スタッフは通さない**。
 * 削除のように取り消せない操作に使う（`checkPreEventOwnerPermission`）。
 */
export function requirePreEventOwner<P extends { id: string }>(action = '操作') {
  return async ({ params, session }: { params: P; session: Session }) => {
    const preEvent = await loadVisiblePreEvent(params.id, session)

    const allowed = await checkPreEventOwnerPermission(preEvent.id, session.user.id)
    if (!allowed) {
      throw ApiError.forbidden(`日程調整の${action}は主催者のみ可能です`)
    }
  }
}

/**
 * 管理者が無効化したものは、管理者以外には「無い」ことにする。
 *
 * **一覧から外すだけでは止まらない。** URL を知っている人（参加者・
 * 通報した人・SNS に貼られたリンクを踏んだ人）は詳細を開ける。
 * 詳細は API から取るので、判定は API の側に置く。
 *
 * **管理者には見せる。** 通報を読んで無効化したものを、あとから
 * 見直して戻せないと困る。判定は DB で行う（トークンの adm はヒント）。
 * 無効化されていないものでは DB に触れない。
 */
export async function hideDisabledFromNonAdmins(
  isDisabled: boolean,
  session: Session | null,
  notFoundMessage: string
): Promise<void> {
  if (!isDisabled) return
  if (session && (await isAdminUser(session.user.id))) return
  throw ApiError.notFound(notFoundMessage)
}
