import { z } from 'zod'

import { optionalString, paginationQuery, requiredString } from './common'

/**
 * 運営から全員へのお知らせ。
 *
 * **通知（`notification.ts`）とは別物。** あちらは一人ひとりに宛てた
 * 出来事の記録で、こちらは全閲覧者に同じものを出す掲示。
 */

/**
 * 重要度。**"low" はヘッダー下のバナーに一切出さない**（一覧と詳細だけ）。
 * 全員の画面の上に居座らせる価値があるかどうかを、ここで決める。
 */
export const ANNOUNCEMENT_TYPES = ['warning', 'info', 'low'] as const

export const announcementType = z.enum(ANNOUNCEMENT_TYPES)

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  warning: '重要',
  info: 'お知らせ',
  low: '軽微',
}

export const ANNOUNCEMENT_TITLE_MAX = 200
export const ANNOUNCEMENT_BODY_MAX = 20000

/** `YYYY-MM-DD`。<input type="date"> の値をそのまま受ける（イベントと同じ） */
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')
  .refine((v) => {
    const year = Number(v.slice(0, 4))
    return year >= 2000 && year <= 2999
  }, '日付は2000年〜2999年の範囲で入力してください')

/** `HH:MM`。未入力は 00:00 として扱う */
const timeInput = z
  .string()
  .regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const announcementBody = z
  .object({
    type: announcementType,
    title: requiredString('題名', ANNOUNCEMENT_TITLE_MAX),
    /**
     * 本文（Markdown）。**空なら詳細ページを作らない。**
     * 一覧では題名だけを出し、押しても何も増えないページへ連れて行かない。
     */
    body: optionalString('本文', ANNOUNCEMENT_BODY_MAX),
    publishedDate: dateInput,
    publishedTime: timeInput,
    /**
     * バナーへの掲載を終える日時。**空は「公開から7日で降ろす」**
     * （`DEFAULT_BANNER_DAYS`）。降ろしたあとも一覧には残る。
     */
    pinnedUntilDate: dateInput.optional().or(z.literal('').transform(() => undefined)),
    pinnedUntilTime: timeInput,
  })
  .refine((v) => !v.pinnedUntilTime || v.pinnedUntilDate, {
    message: 'バナーを降ろす日付を入力してください',
    path: ['pinnedUntilDate'],
  })

export type AnnouncementBody = z.infer<typeof announcementBody>

/**
 * 公開側の一覧。`placement` で「一覧に出すもの」と「バナーに出すもの」を分ける。
 *
 * **絞り込みはサーバーでやる。** 掲載中かどうかは時刻で決まるので、
 * 閲覧者の端末の時計に任せると、ずれている人にだけ出たり消えたりする。
 */
export const publicAnnouncementsQuery = z.object({
  placement: z.enum(['list', 'banner']).default('list'),
})

export const adminAnnouncementsQuery = paginationQuery

/** お知らせの id。連番（閉じたバナーを Cookie に並べるので短くしてある） */
export const announcementId = z.coerce.number().int().positive().max(2147483647)

export const announcementIdParam = z.object({ id: announcementId })
