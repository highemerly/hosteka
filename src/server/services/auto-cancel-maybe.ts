import 'server-only'

import { eventDeadlineAt } from '@/lib/event-datetime'
import { prisma } from '@/lib/prisma'

/**
 * 回答期限を過ぎたイベントの「未定」参加者をキャンセルに変える。
 *
 * 呼び出し元はすべてここを通す（規則を書き分けない）:
 *   1. GET api/v1/events/[id]  … 詳細を開いたとき（`after()`）
 *   2. api/v1/events/[id]/auto-cancel-maybe  … 個別イベント用
 *   3. api/v1/events/auto-cancel-maybe       … 一括用。cron から定期実行する
 */

export type AutoCancelResult = {
  eventId: string
  eventTitle: string
  cancelledCount: number
  deadline: string
}

/** 1イベントを処理する。期限前・対象なしなら null */
export async function autoCancelMaybeForEvent(
  eventId: string,
  now = new Date()
): Promise<AutoCancelResult | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      registrationDeadlineDate: true,
      registrationDeadlineTime: true,
      participants: { where: { status: 'maybe' }, select: { id: true } },
    },
  })

  /*
    締切は参加登録・画面の表示と同じ式で読む（`lib/event-datetime.ts`）。
    以前はここで UTC の日付から組み立てていて、旧形式の行の「未定」を
    画面に出ている締切より1日早くキャンセルしていた。
  */
  const deadline = eventDeadlineAt(
    event?.registrationDeadlineDate ?? null,
    event?.registrationDeadlineTime ?? null
  )
  if (!event || !deadline) return null
  if (now <= deadline) return null
  if (event.participants.length === 0) return null

  await prisma.eventParticipant.updateMany({
    where: { eventId: event.id, status: 'maybe' },
    data: { status: 'cancelled', cancellationReason: 'auto_cancelled' },
  })

  return {
    eventId: event.id,
    eventTitle: event.title,
    cancelledCount: event.participants.length,
    deadline: deadline.toISOString(),
  }
}

/** 期限を持つ全イベントを処理する（cron 用） */
export async function autoCancelMaybeForAll(now = new Date()) {
  const events = await prisma.event.findMany({
    where: { registrationDeadlineDate: { not: null }, isDisabled: false },
    select: { id: true },
  })

  const results: AutoCancelResult[] = []
  for (const event of events) {
    const result = await autoCancelMaybeForEvent(event.id, now)
    if (result) results.push(result)
  }

  return {
    processedEvents: events.length,
    totalCancelled: results.reduce((sum, r) => sum + r.cancelledCount, 0),
    results,
  }
}
