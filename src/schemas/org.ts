import { z } from 'zod'

import { VALIDATION_LIMITS } from './limits'

import { optionalString, optionalUrl, requiredString } from './common'

/** グループID（slug）の形式。lib/org-id.ts の validateOrgSlug と同じ規則 */
export const orgSlug = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9_-]{4,50}$/,
    'グループIDは4文字以上50文字以内の英数字、ハイフン、アンダースコアで入力してください'
  )

export const orgAdminRole = z.enum(['admin', 'staff'], {
  error: '権限は admin か staff を指定してください',
})

const adminToAdd = z.object({
  username: z.string().trim().min(1),
  server: z.string().trim().min(1),
  role: orgAdminRole.optional(),
})

export const createOrgBody = z.object({
  name: requiredString('グループ名', VALIDATION_LIMITS.ORG_NAME),
  slug: orgSlug.optional(),
  description: optionalString('説明', VALIDATION_LIMITS.ORG_DESCRIPTION),
  relatedUrl: optionalUrl('関連URL', VALIDATION_LIMITS.ORG_RELATED_URL),
  adminsToAdd: z.array(adminToAdd).optional(),
})

export const updateOrgBody = z.object({
  name: requiredString('グループ名', VALIDATION_LIMITS.ORG_NAME).optional(),
  slug: orgSlug.optional(),
  description: optionalString('説明', VALIDATION_LIMITS.ORG_DESCRIPTION).optional(),
  relatedUrl: optionalUrl('関連URL', VALIDATION_LIMITS.ORG_RELATED_URL).optional(),
  adminsToAdd: z.array(adminToAdd).optional(),
  /** 削除する管理者の userId。作成者は指定しても無視される */
  adminsToRemove: z.array(z.string()).optional(),
  adminsToUpdate: z
    .array(z.object({ userId: z.string(), role: orgAdminRole }))
    .optional(),
})

export const orgIdParam = z.object({ orgId: z.string().trim().min(1) })

export type UpdateOrgBody = z.infer<typeof updateOrgBody>

export const addOrgAdminBody = z.object({
  username: requiredString('ユーザー名', 100),
  server: requiredString('サーバー', 255),
  role: orgAdminRole.default('staff'),
})

export const changeOrgAdminRoleBody = z.object({ role: orgAdminRole })

export const orgAdminParam = z.object({
  orgId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
})
