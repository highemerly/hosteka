import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * 通知の宛先。**IDの配列だけを返す。**
 *
 * ユーザーの中身を取るのはシリアライザの `actor` だけにしてある
 * （`select: { user: true }` を書くと `src/lib/select-presets.test.ts` に
 * 引っかかるうえ、宛先の解決に表示用の値は要らない）。
 */

/** 回答を出している人。欠席とキャンセルは含めない */
const ACTIVE_PARTICIPANT_STATUSES = ['attending', 'maybe', 'participation_request']

function unique(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

/**
 * イベントの主催・幹事。
 *
 * **`checkOrganizerPermission`（`src/lib/permissions.ts`）と同じ条件にする。**
 * 出どころは3つ — 作成者・`isOrganizer` の参加者・グループの管理者。
 *
 * あちらは参加状態を見ていない（`isOrganizer` だけ）ので、こちらも見ない。
 * 見ると「参加者を編集できるのに、参加リクエストの通知が来ない幹事」ができる。
 */
export async function listEventOrganizerIds(eventId: string): Promise<string[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      creatorId: true,
      organizationId: true,
      participants: { where: { isOrganizer: true }, select: { userId: true } },
    },
  })
  if (!event) return []

  const ids = [event.creatorId, ...event.participants.map((p) => p.userId)]
  if (event.organizationId) {
    ids.push(...(await listOrgAdminIds(event.organizationId)))
  }
  return unique(ids)
}

/**
 * 日程調整の主催。
 * **幹事の概念が無い**（`pre_event_participants` に `isOrganizer` が無い）ので、
 * 作成者とグループの管理者だけ。`checkPreEventOrganizerPermission` と同じ。
 */
export async function listPreEventOrganizerIds(preEventId: string): Promise<string[]> {
  const preEvent = await prisma.preEvent.findUnique({
    where: { id: preEventId },
    select: { creatorId: true, organizationId: true },
  })
  if (!preEvent) return []

  const ids = [preEvent.creatorId]
  if (preEvent.organizationId) {
    ids.push(...(await listOrgAdminIds(preEvent.organizationId)))
  }
  return unique(ids)
}

/** グループの管理者。admin と staff の両方（`checkOrgAdminPermission` と同じ） */
export async function listOrgAdminIds(organizationId: string): Promise<string[]> {
  const [org, admins] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { creatorId: true } }),
    prisma.organizationAdmin.findMany({ where: { organizationId }, select: { userId: true } }),
  ])
  // 作成者は行が無くても常に管理者（`checkOrgAdminRolePermission` と同じ扱い）
  return unique([org?.creatorId, ...admins.map((a) => a.userId)])
}

/** イベントに回答を出している人。欠席とキャンセルには届けない */
export async function listEventParticipantIds(eventId: string): Promise<string[]> {
  const rows = await prisma.eventParticipant.findMany({
    where: { eventId, status: { in: ACTIVE_PARTICIPANT_STATUSES } },
    select: { userId: true },
  })
  return unique(rows.map((r) => r.userId))
}

/** 日程調整に回答した人。候補日ごとに行があるので重複する */
export async function listPreEventRespondentIds(preEventId: string): Promise<string[]> {
  const rows = await prisma.preEventParticipant.findMany({
    where: { preEventId },
    select: { userId: true },
  })
  return unique(rows.map((r) => r.userId))
}
