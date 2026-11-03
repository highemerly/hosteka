import type { UpdateOrgBody } from '@/schemas/org'
import type { OrgDto } from '@/server/serializers/org'

/**
 * 保存済みのグループを、フォームの入力欄の形へ写す。
 *
 * **画面の中に書かない。** ここが1つでも欠けると、編集して保存した瞬間に
 * その項目が消える（サーバーは受け取った本文で上書きする）。画面の
 * `reset()` の中にあると、抜けても画面は正常に見えるし、テストからも触れない。
 *
 * 往復（開いて保存しただけで値が変わらないこと）は
 * `edit-round-trip.test.ts` が固定している。
 */
export type OrgAdminValue = {
  userId: string
  username: string
  server: string
  displayName: string
  avatar: string | null
  role: 'admin' | 'staff'
  /** 作成者は外せない。グループが管理不能になるため */
  isCreator: boolean
  /** 保存時に外す印。すぐ消さないのは、押し間違いを戻せるようにするため */
  removed: boolean
}

/**
 * これから足す管理者。サーバーへは username と server で送る。
 *
 * 表示用の名前とアバターも持つ。**追加のときに存在確認を通しているので、
 * その応答をそのまま使える** — 既存の管理者と同じ姿で並べられる。
 */
export type NewOrgAdminValue = {
  username: string
  server: string
  role: 'admin' | 'staff'
  displayName: string
  avatar: string | null
}

export type OrgFormValues = {
  name: string
  slug: string
  description: string
  relatedUrl: string
  admins: OrgAdminValue[]
  newAdmins: NewOrgAdminValue[]
}

export const EMPTY_ORG_FORM: OrgFormValues = {
  name: '',
  slug: '',
  description: '',
  relatedUrl: '',
  admins: [],
  newAdmins: [],
}

function isRole(value: string): value is 'admin' | 'staff' {
  return value === 'admin' || value === 'staff'
}

export function toOrgFormValues(org: OrgDto): OrgFormValues {
  return {
    name: org.name,
    slug: org.slug,
    // null は空欄にする。**戻すときに空欄を null へ返すこと**
    description: org.description ?? '',
    relatedUrl: org.relatedUrl ?? '',
    admins: org.admins.map((admin) => ({
      userId: admin.user.id,
      username: admin.user.username,
      server: admin.user.server,
      displayName: admin.user.displayName,
      avatar: admin.user.avatar,
      role: isRole(admin.role) ? admin.role : 'staff',
      isCreator: admin.user.id === org.creatorId,
      removed: false,
    })),
    newAdmins: [],
  }
}

/**
 * 更新の本文。
 *
 * **管理者は一覧ではなく差分で送る**（API がそう受ける）。開いて保存した
 * だけのときに差分が出ないことが、この関数のいちばん大事な性質。
 * 差分の出し方を画面に書くと、「外したのに残る」「役割だけ戻る」が起きる。
 */
export function toUpdateOrgBody(values: OrgFormValues, original: OrgFormValues): UpdateOrgBody {
  const before = new Map(original.admins.map((a) => [a.userId, a]))

  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim() || null,
    relatedUrl: values.relatedUrl.trim() || null,
    adminsToAdd: values.newAdmins.map((a) => ({
      username: a.username.trim(),
      server: a.server.trim(),
      role: a.role,
    })),
    // 作成者は外せない。画面でも外させないが、本文にも混ぜない
    adminsToRemove: values.admins.filter((a) => a.removed && !a.isCreator).map((a) => a.userId),
    adminsToUpdate: values.admins
      .filter((a) => !a.removed && before.get(a.userId)?.role !== a.role)
      .map((a) => ({ userId: a.userId, role: a.role })),
  }
}

/** 作成の本文。グループIDは空なら送らない（サーバーが自動で決める） */
export function toCreateOrgBody(values: OrgFormValues) {
  const slug = values.slug.trim()
  return {
    name: values.name.trim(),
    ...(slug ? { slug } : {}),
    description: values.description.trim() || null,
    relatedUrl: values.relatedUrl.trim() || null,
    adminsToAdd: values.newAdmins.map((a) => ({
      username: a.username.trim(),
      server: a.server.trim(),
      role: a.role,
    })),
  }
}
