import { z } from 'zod'

/**
 * 全スキーマ共通の部品。
 *
 * このディレクトリは **isomorphic**（prisma も server-only も import しない）。
 * サーバーの検証とクライアントのフォーム検証が同じ定義を使うため。
 */

/** cuid。Prisma の @default(cuid()) と対応する */
export const cuid = z.string().min(20, 'IDの形式が不正です')

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

/** 必須文字列。未入力と空文字の両方を同じ日本語文言で弾く */
export function requiredString(label: string, max: number) {
  return z
    .string({ error: `${label}は必須です` })
    .trim()
    .min(1, `${label}は必須です`)
    .max(max, `${label}は${max}文字以内で入力してください`)
}

/** 任意文字列。空文字は null に正規化する */
export function optionalString(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .nullish()
    .transform((v) => (v ? v : null))
}

export function optionalUrl(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .refine(
      (v) => !v || /^https?:\/\//.test(v),
      `${label}は「https://」または「http://」から始まる有効なURL形式で入力してください`
    )
    .nullish()
    .transform((v) => (v ? v : null))
}

/**
 * 必須のURL。**配列の要素に使う。**
 *
 * `optionalUrl` は `nullish` を返すので、配列に入れると
 * `(string | null)[]` になる。空の行はフォーム側で落としてから送る。
 */
export function requiredUrl(label: string, max: number) {
  return z
    .string({ error: `${label}は必須です` })
    .trim()
    .min(1, `${label}は必須です`)
    .max(max, `${label}は${max}文字以内で入力してください`)
    .refine(
      (v) => /^https?:\/\//.test(v),
      `${label}は「https://」または「http://」から始まる有効なURL形式で入力してください`
    )
}

/**
 * 任意のメールアドレス。空文字は null に正規化する。
 *
 * **小文字化しない。** ローカル部（@ の左）は仕様上 case-sensitive で、
 * 勝手に畳むと届かないアドレスになりうる。ホスト名だけを畳む
 * `normalizeServer`（`src/lib/normalize.ts`）とは別物。
 */
export function optionalEmail(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .refine(
      (v) => !v || z.email().safeParse(v).success,
      `${label}は正しい形式で入力してください`
    )
    .nullish()
    .transform((v) => (v ? v : null))
}

/** 'true' / 'false' の文字列クエリを真偽値として受ける */
export const booleanQuery = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true')
