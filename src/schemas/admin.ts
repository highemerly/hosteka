import { z } from 'zod'

import { cuid, paginationQuery } from './common'

/** 一覧の絞り込みで共通に使う公開状態 */
export const visibilityFilter = z
  .enum(['all', 'public', 'private', 'disabled'])
  .default('all')

export type VisibilityFilter = z.infer<typeof visibilityFilter>

export const sortOrder = z.enum(['asc', 'desc']).default('desc')

/** 検索語。空文字は「絞り込まない」に倒す（URL から `q=` だけ来ることがある） */
const searchTerm = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v || undefined)

export const adminEventsQuery = paginationQuery.extend({
  search: searchTerm,
  status: visibilityFilter,
  sortBy: z.enum(['createdAt', 'startDate']).default('createdAt'),
  sortOrder,
  creatorId: z.string().trim().optional(),
})

export const adminPreEventsQuery = paginationQuery.extend({
  search: searchTerm,
  status: visibilityFilter,
  sortBy: z.enum(['createdAt']).default('createdAt'),
  sortOrder,
  creatorId: z.string().trim().optional(),
})

/**
 * ユーザー一覧。
 *
 * **BAN の状態で絞る条件は持たない。** BAN はユーザーを削除して
 * `BannedUser` に名前を残す操作なので、ユーザー一覧に BAN 済みの人は
 * 現れない。BAN 済みの一覧は `/api/v1/admin/users/banned` が別に持つ。
 */
export const adminUsersQuery = paginationQuery.extend({
  search: searchTerm,
  sortBy: z.enum(['lastLoginAt', 'createdAt']).default('lastLoginAt'),
  sortOrder,
})

export const adminOrgsQuery = paginationQuery.extend({
  search: searchTerm,
  creatorId: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'name']).default('createdAt'),
  sortOrder,
})

export const adminBannedQuery = paginationQuery.extend({
  search: searchTerm,
})

export const disableBody = z.object({
  isDisabled: z.boolean({ error: 'isDisabled は真偽値で指定してください' }),
})

/** BAN 理由の上限。`BannedUser.reason` に保存する */
export const BAN_REASON_MAX = 500

export const banUserBody = z.object({
  reason: z
    .string({ error: 'BAN理由は必須です' })
    .trim()
    .min(1, 'BAN理由は必須です')
    .max(BAN_REASON_MAX, `BAN理由は${BAN_REASON_MAX}文字以内で入力してください`),
})

export const idParam = z.object({ id: cuid })
/** BannedUser の id は cuid だが、既存データを考慮して緩めに受ける */
export const looseIdParam = z.object({ id: z.string().trim().min(1) })
