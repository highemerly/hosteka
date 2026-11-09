import 'server-only'

import { after } from 'next/server'

import { prisma } from '@/lib/prisma'
import type { NotificationPayload } from '@/lib/notification-text'
import type { ParticipantStatus } from '@/lib/status-transition'
import type { NotificationKind, NotificationTargetType } from '@/schemas/notification'

import { foldKeyFor } from './fold'
import { KIND_FOLD } from './kinds'
import {
  listEventOrganizerIds,
  listEventParticipantIds,
  listPreEventOrganizerIds,
  listPreEventRespondentIds,
} from './recipients'

/**
 * 通知を作る。
 *
 * **受信者が何人でもクエリは一定。** 人ごとにループしてクエリを撃つと、
 * 参加者の多いイベントで編集するたびに数百本走る。
 */

/** `updateMany` の OR をこの数で割る。500項を1本にするとプランナがつらい */
const OR_CHUNK = 200

export type DeliverInput = {
  kind: NotificationKind
  targetType: NotificationTargetType
  targetId: string
  /** 原因になった人。**この人は宛先から外れる** */
  actorId: string | null
  payload: NotificationPayload
  recipientIds: string[]
  /** テストのために外から渡せる。既定は今 */
  now?: Date
}

export type DeliverResult = { created: number; folded: number }

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  const now = input.now ?? new Date()

  /*
    **本人を外すのはここ1箇所。** 呼び出し側でやると、いつか必ずどこかで
    忘れる（自分がイベントを編集して、自分に「編集されました」が届く）。
  */
  const recipients = [...new Set(input.recipientIds)].filter(
    (id) => Boolean(id) && id !== input.actorId
  )
  if (recipients.length === 0) return { created: 0, folded: 0 }

  const users = await prisma.user.findMany({
    where: { id: { in: recipients } },
    select: { id: true, notificationsSeenAt: true },
  })
  if (users.length === 0) return { created: 0, folded: 0 }

  const strategy = KIND_FOLD[input.kind]
  const payload = JSON.stringify(input.payload)

  const rows = users.map((user) => ({
    userId: user.id,
    kind: input.kind,
    targetType: input.targetType,
    targetId: input.targetId,
    actorId: input.actorId,
    payload,
    foldKey: foldKeyFor(strategy, user.notificationsSeenAt, input.actorId),
    createdAt: now,
    occurredAt: now,
  }))

  /*
    **先に作る。** 「読んで、無ければ作る」は読みと書きの間に隙間があり、
    同時に2つ走ると行が2つできる。一意制約に当てて DB に決めさせる。
    未読の同種行を既に持っている人の分だけが飛ばされる。
  */
  const { count: created } = await prisma.notification.createMany({
    data: rows,
    skipDuplicates: true,
  })

  // 畳まない種別は衝突しようがないので、更新も要らない
  if (strategy === 'none' || created >= rows.length) return { created, folded: 0 }

  let folded = 0
  for (const chunk of chunked(rows, OR_CHUNK)) {
    const { count } = await prisma.notification.updateMany({
      where: {
        kind: input.kind,
        targetType: input.targetType,
        targetId: input.targetId,
        // 上で今まさに作った行を除く（あちらの occurredAt はちょうど now）
        occurredAt: { lt: now },
        OR: chunk.map((row) => ({ userId: row.userId, foldKey: row.foldKey })),
      },
      data: {
        occurredAt: now,
        // **読んだ値に足さない。** 同時に2つ来ると片方が消える
        repeatCount: { increment: 1 },
        /*
          畳んだ側の値で上書きする。イベント編集の通知で古い写しを残すと、
          「編集されました」と言いながら変更前のタイトルを出すことになる。
        */
        actorId: input.actorId,
        payload,
      },
    })
    folded += count
  }

  return { created, folded }
}

/**
 * 通知の送出を応答の後ろに回す。
 *
 * **本体には影響させない。** 通知を作れなかったことで参加登録が巻き戻ったら
 * 本末転倒なので、トランザクションの外に出したうえで例外も外へ出さない。
 * ただし `after()` は握り潰すので、**必ずログに残す**。
 */
export function notifyAfter(label: string, run: () => Promise<unknown>): void {
  after(async () => {
    try {
      await run()
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'notify.failed',
          label,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      )
    }
  })
}

// ==================== 出来事ごとの送出 ====================

type TargetRef = { id: string; title: string }

/** 参加リクエストが来た → 主催・幹事へ */
export async function notifyParticipationRequested(event: TargetRef, actorId: string) {
  return deliver({
    kind: 'participation_requested',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: await listEventOrganizerIds(event.id),
  })
}

/** 参加登録・参加内容の変更 → 主催・幹事へ */
export async function notifyParticipationRegistered(
  event: TargetRef,
  actorId: string,
  status: ParticipantStatus
) {
  return deliver({
    kind: 'participation_registered',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title, status },
    recipientIds: await listEventOrganizerIds(event.id),
  })
}

/** 本人が参加を取り消した → 主催・幹事へ */
export async function notifyParticipationCancelled(event: TargetRef, actorId: string) {
  return deliver({
    kind: 'participation_cancelled',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: await listEventOrganizerIds(event.id),
  })
}

/**
 * 本人の回答が変わった → 主催・幹事へ。
 *
 * **登録と変更の両方がここを通る。** 状態ごとの振り分けを POST と PUT の
 * 両方に書くと、片方だけ直した日に通知の種類が食い違う。
 */
export async function notifyParticipationChanged(
  event: TargetRef,
  actorId: string,
  status: ParticipantStatus
) {
  if (status === 'participation_request') return notifyParticipationRequested(event, actorId)
  if (status === 'cancelled') return notifyParticipationCancelled(event, actorId)
  return notifyParticipationRegistered(event, actorId, status)
}

/** 参加リクエストの承認・見送り → 本人へ */
export async function notifyParticipationDecided(
  event: TargetRef,
  userId: string,
  approved: boolean,
  actorId: string
) {
  return deliver({
    kind: approved ? 'participation_approved' : 'participation_rejected',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: [userId],
  })
}

/**
 * 主催者が参加者をキャンセルにした → 本人へ。
 *
 * **本人の取り下げ（`participation_cancelled`）と別の種別にする。**
 * あちらは主催者へ届くもので、向きも文言も違う。
 */
export async function notifyParticipationRemoved(
  event: TargetRef,
  userId: string,
  actorId: string
) {
  return deliver({
    kind: 'participation_removed',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: [userId],
  })
}

/**
 * 参加リクエストの受け付けをやめたことによる一括取り消し → 本人たちへ。
 *
 * **主催者が見送ったのと同じ通知にしない。** `reason: 'closed'` を添えて
 * 「受け付けをやめました」と出す。本人の回答が判断されたわけではないので。
 */
export async function notifyParticipationRequestsClosed(
  event: TargetRef,
  userIds: string[],
  actorId: string
) {
  return deliver({
    kind: 'participation_rejected',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title, reason: 'closed' },
    recipientIds: userIds,
  })
}

/** 幹事の指定・解除 → 本人へ */
export async function notifyOrganizerChanged(
  event: TargetRef,
  userId: string,
  assigned: boolean,
  actorId: string
) {
  return deliver({
    kind: assigned ? 'organizer_assigned' : 'organizer_unassigned',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: [userId],
  })
}

/**
 * イベントが編集された → 参加者へ。
 * **`changed` が空なら何もしない**（差分ゲートは `event-change.ts`）。
 */
export async function notifyEventUpdated(event: TargetRef, changed: string[], actorId: string) {
  if (changed.length === 0) return { created: 0, folded: 0 }
  return deliver({
    kind: 'event_updated',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title, changed },
    recipientIds: await listEventParticipantIds(event.id),
  })
}

/** イベントが中止された → 参加者へ */
export async function notifyEventCancelled(event: TargetRef, actorId: string) {
  return deliver({
    kind: 'event_cancelled',
    targetType: 'event',
    targetId: event.id,
    actorId,
    payload: { title: event.title },
    recipientIds: await listEventParticipantIds(event.id),
  })
}

/** 日程調整に回答が入った → 主催へ */
export async function notifyPreEventAnswered(preEvent: TargetRef, actorId: string) {
  return deliver({
    kind: 'pre_event_answered',
    targetType: 'pre_event',
    targetId: preEvent.id,
    actorId,
    payload: { title: preEvent.title },
    recipientIds: await listPreEventOrganizerIds(preEvent.id),
  })
}

/** 日程調整が編集された → 回答した人へ */
export async function notifyPreEventUpdated(
  preEvent: TargetRef,
  changed: string[],
  actorId: string
) {
  if (changed.length === 0) return { created: 0, folded: 0 }
  return deliver({
    kind: 'pre_event_updated',
    targetType: 'pre_event',
    targetId: preEvent.id,
    actorId,
    payload: { title: preEvent.title, changed },
    recipientIds: await listPreEventRespondentIds(preEvent.id),
  })
}

/**
 * 日程調整が取り消される → 回答した人へ。
 *
 * **削除の前に呼ぶ。** 回答の行が消えたあとでは宛先が引けない。
 * 日程調整には「中止」の状態が無く（`pre_events` に `status` 列が無い）、
 * 取り消しは削除でしか表せない。
 */
export async function notifyPreEventDeleted(preEvent: TargetRef, actorId: string) {
  return deliver({
    kind: 'pre_event_deleted',
    targetType: 'pre_event',
    targetId: preEvent.id,
    actorId,
    payload: { title: preEvent.title },
    recipientIds: await listPreEventRespondentIds(preEvent.id),
  })
}

/**
 * 日程調整がイベントになった → 回答した人へ。**宛先はイベントで、名前もイベントのもの。**
 *
 * 自動で参加登録された人とそれ以外で文が違う（`payload.registered`）。
 * 回答した人には○を付けなかった人も含む — 参加しない人にも、決まったことは届ける。
 */
export async function notifyPreEventPromoted(
  preEvent: { id: string },
  event: TargetRef,
  registeredIds: string[],
  actorId: string
) {
  const registered = new Set(registeredIds)
  const others = (await listPreEventRespondentIds(preEvent.id)).filter((id) => !registered.has(id))
  const base = { kind: 'pre_event_promoted', targetType: 'event', targetId: event.id, actorId } as const
  const [a, b] = await Promise.all([
    deliver({ ...base, payload: { title: event.title, registered: true }, recipientIds: registeredIds }),
    deliver({ ...base, payload: { title: event.title }, recipientIds: others }),
  ])
  return { created: a.created + b.created, folded: a.folded + b.folded }
}

/** グループの管理者に追加された → 本人へ */
export async function notifyOrgAdminAdded(
  org: { id: string; name: string; slug: string },
  userId: string,
  actorId: string
) {
  return deliver({
    kind: 'org_admin_added',
    targetType: 'org',
    targetId: org.id,
    actorId,
    payload: { title: org.name, orgSlug: org.slug },
    recipientIds: [userId],
  })
}
