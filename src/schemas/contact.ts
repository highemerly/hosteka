import { z } from 'zod'

import { cuid } from './common'

/**
 * 参加者への連絡（SNS への投稿）の入力。
 *
 * イベントと日程調整で**同じ形にそろえる**。違いは宛先の決まり方だけで、
 * イベントは参加者を選び、日程調整は回答者全員に届く
 * （`components/attendable/contact/mentions.ts`）。
 */

/**
 * 本文の上限。**プラットフォームごとの上限はここで決めない。**
 * X は 280、Mastodon は 500、Misskey は 3000 で、しかもサーバーが広げていることがある
 * （`components/attendable/contact/post-limits.ts`）。ここは「明らかに桁が違う」
 * ものを止めるための枠で、実際の上限は投稿先が決める。
 */
const MESSAGE_MAX = 5000

const message = z
  .string()
  .trim()
  .min(1, '本文を入力してください')
  .max(MESSAGE_MAX, `本文は${MESSAGE_MAX}文字以内で入力してください`)

/**
 * 公開範囲。**値の集合はプラットフォームごとに違う**ので enum にしない
 * （Mastodon の `private` は Misskey では `followers`）。送られた値が
 * その人のプラットフォームで使えるかは `normalizeVisibility` が決める。
 */
const visibility = z.string().trim().min(1).max(32).default('public')

/** 予約投稿の日時。過ぎた時刻かどうかはルート側が見る（いまの時刻が要るため） */
const scheduledFor = z
  .string()
  .trim()
  .min(1, '予約する日時を指定してください')
  .refine((v) => !Number.isNaN(Date.parse(v)), '予約する日時の形式が正しくありません')

/** 宛先。イベントの連絡は参加者を選べる */
const participantIds = z
  .array(z.string().trim().min(1))
  .min(1, '宛先を1人以上選んでください')

export const eventPostImmediateBody = z.object({
  eventId: cuid,
  message,
  participantIds,
  visibility,
})

export const eventPostScheduledBody = z.object({
  eventId: cuid,
  message,
  scheduledFor,
  visibility,
})

/** 日程調整の連絡。宛先は「回答者全員」の1つしかないので選ばせない */
export const preEventPostImmediateBody = z.object({
  message,
  visibility,
})

export const preEventPostScheduledBody = z.object({
  message,
  scheduledFor,
  visibility,
})
