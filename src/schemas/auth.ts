import { z } from 'zod'

/**
 * OAuth を始めるときの入力。
 *
 * **5本のルートで別々に書かない。** 違いは「ホスト名が要るか」と
 * 「投稿の権限を頼めるか」だけで、そこは `screens/auth/sign-in-platforms.ts` が
 * 既に表にしている。ここで形を分けると、片方にだけ項目が増える。
 *
 * **同意はここで必須にする。** サーバー側は `requireTermsAccepted` でも
 * 確かめているが（5本すべてが呼ぶ）、契約書に現れるのはこちら。
 * 文言は既存のものと揃えてある — 画面がこの文を出す。
 */

const termsAccepted = z.literal(true, {
  error: '利用規約への同意が必要です',
})

/**
 * 戻り先。**中身の検証はここでしない。**
 * 外部サイトへ飛ばさないための判定はサーバー側（`getBaseUrl` と突き合わせる）にある。
 */
const callbackUrl = z.string().trim().max(2000).optional()

/**
 * サーバーのホスト名。
 *
 * **形だけを見る。** 内部アドレス（10.0.0.0/8 など）への接続を止める判定は
 * ルート側に置いてある。あちらは「送信先として安全か」の話で、
 * 入力の形が正しいかとは別の問題。
 */
const serverHost = z
  .string()
  .trim()
  .min(1, 'サーバーのホスト名を入力してください')
  .max(253)
  .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'サーバーのホスト名の形式が正しくありません')

/** Mastodon / Misskey。投稿の権限まで頼める */
export const registerWithServerBody = z.object({
  server: serverHost,
  callbackUrl,
  /** 投稿できる権限を一緒に受け取るか。既定は読み取りだけ */
  requestWritePermission: z.boolean().optional(),
  termsAccepted,
})

/**
 * Pleroma。**`requestWritePermission` を受け取らない** —
 * register が `read:accounts` 固定で、渡しても何も起きないため
 * （`sign-in-platforms.ts` の `canRequestWrite` が false）。
 */
export const registerPleromaBody = z.object({
  server: serverHost,
  callbackUrl,
  termsAccepted,
})

/** Discord / X。ホスト名が要らない */
export const registerHostedBody = z.object({
  callbackUrl,
  termsAccepted,
})
