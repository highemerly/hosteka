import { z } from 'zod'

import { cuid, paginationQuery, requiredString } from './common'

export const reportStatus = z.enum(['pending', 'resolved'])

/**
 * 通報の対象。イベントか日程調整のどちらか一方だけを指定する
 * （DB制約では表現できないのでここで担保する）。
 */
const targetShape = { eventId: cuid.optional(), preEventId: cuid.optional() }
const exactlyOneTarget = (v: { eventId?: string; preEventId?: string }) =>
  Boolean(v.eventId) !== Boolean(v.preEventId)
const exactlyOneTargetError = {
  message: 'イベントか日程調整のどちらか一方を指定してください',
  path: ['eventId'],
}

/**
 * 対象だけの検証。
 *
 * **理由の入力とは別に判定できるようにしてある。** 対象IDが契約に合わない
 * のは閲覧者にはどうにもできないことなので、入力欄のエラーとして出しては
 * ならない（理由をいくら書き直しても消えない文言が理由欄に付く）。
 * 通報できない対象では、そもそもボタンを出さないために使う。
 */
export const reportTarget = z.object(targetShape).refine(exactlyOneTarget, exactlyOneTargetError)

export type ReportTarget = z.infer<typeof reportTarget>

/** 通報できる対象か。シードのモックのように cuid でないIDは通報できない */
export function isReportableTarget(target: ReportTarget): boolean {
  return reportTarget.safeParse(target).success
}

/** 通報の作成。 */
export const createReportBody = z
  .object({
    // 500 は schema.prisma の Report.reason VarChar(500) に対応
    reason: requiredString('通報理由', 500),
    ...targetShape,
  })
  .refine(exactlyOneTarget, exactlyOneTargetError)

export type CreateReportBody = z.infer<typeof createReportBody>

export const listReportsQuery = paginationQuery.extend({
  status: z.union([reportStatus, z.literal('all')]).default('pending'),
})

export type ListReportsStatus = z.infer<typeof listReportsQuery>['status']

/** 対応メモの上限。一覧で読み切れる長さに留める */
export const ADMIN_NOTE_MAX = 2000

/**
 * 通報の更新（管理者）。**送った項目だけが変わる。**
 * メモを消すときは `null` か空文字を明示する。
 */
export const updateReportBody = z
  .object({
    status: reportStatus.optional(),
    adminNote: z
      .string()
      .trim()
      .max(ADMIN_NOTE_MAX, `対応メモは${ADMIN_NOTE_MAX}文字以内で入力してください`)
      .nullish(),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: '変更する項目がありません',
  })

export type UpdateReportBody = z.infer<typeof updateReportBody>
