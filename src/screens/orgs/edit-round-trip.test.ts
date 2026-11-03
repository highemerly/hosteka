import { describe, expect, it } from 'vitest'

import { updateOrgBody } from '@/schemas/org'
import type { OrgDto } from '@/server/serializers/org'

import {
  EMPTY_ORG_FORM,
  toOrgFormValues,
  toUpdateOrgBody,
  type OrgFormValues,
} from './org-form-values'

/**
 * 編集画面を開いて保存しただけで値が消えないこと。
 *
 * **この形の事故が繰り返し起きている**（イベントでも日程調整でも）。
 * サーバーは受け取った本文で上書きするので、`DTO → フォーム → 本文` の
 * どこか1箇所で項目が抜けると、開いて保存し直すだけでその項目が消える。
 * 画面は正常に見えるので、気づくのは後日になる。
 *
 * グループでとくに危ないのは**管理者**。差分（追加・削除・役割変更）で
 * 送る形なので、写し取りを間違えると「触っていないのに全員外れる」
 * 「役割が staff に戻る」が起きる。
 */

/** 全部の欄が埋まっているグループ。**空にしない** — null は往復しても null で通る */
const FULL: OrgDto = {
  id: 'org_1',
  slug: 'fediverse-club',
  name: 'Fediverse 交流会',
  description: '### 私たちについて\n毎月オフ会をしています。',
  relatedUrl: 'https://example.com/club',
  creatorId: 'u_owner',
  createdAt: '2026-01-15T00:00:00.000Z',
  admins: [
    {
      id: 'oa_1',
      role: 'admin',
      user: {
        id: 'u_owner',
        username: 'owner',
        displayName: '作成者',
        avatar: 'https://example.com/a.png',
        server: 'handon.club',
        platform: 'mastodon',
      },
    },
    {
      id: 'oa_2',
      role: 'staff',
      user: {
        id: 'u_staff',
        username: 'staff',
        displayName: 'スタッフ',
        avatar: null,
        server: 'misskey.io',
        platform: 'misskey',
      },
    },
  ],
  eventCount: 12,
}

/**
 * フォームの項目の分類。
 *
 * **`Record<keyof OrgFormValues, …>` にしてある。** 欄が増えると
 * ここが型エラーになり、「運ぶ」か「編集の対象外（理由付き）」かを
 * 決めるまで typecheck が通らない。
 */
const CLASSIFIED: Record<keyof OrgFormValues, 'carried' | string> = {
  name: 'carried',
  slug: 'carried',
  description: 'carried',
  relatedUrl: 'carried',
  admins: 'carried',
  newAdmins: '保存済みの値ではない（この画面で足す分だけ）',
}

/** 開いて保存しただけ、と同じ経路を通す */
function reopenAndSave(org: OrgDto) {
  const values = toOrgFormValues(org)
  return updateOrgBody.parse(toUpdateOrgBody(values, values))
}

describe('編集画面を開いて保存しただけで値が消えない', () => {
  it('分類がフォームの全項目を覆っている', () => {
    expect(Object.keys(CLASSIFIED).sort()).toEqual(Object.keys(EMPTY_ORG_FORM).sort())
  })

  it('文章の項目がそのまま残る', () => {
    const body = reopenAndSave(FULL)
    expect(body.name).toBe(FULL.name)
    expect(body.slug).toBe(FULL.slug)
    expect(body.description).toBe(FULL.description)
    expect(body.relatedUrl).toBe(FULL.relatedUrl)
  })

  /**
   * **管理者は差分で送る。** 触っていないなら差分は空でなければならない。
   * ここが空にならないと、開いて保存するだけで役割が書き換わる。
   */
  it('管理者に触っていなければ、差分は何も出ない', () => {
    const body = reopenAndSave(FULL)
    expect(body.adminsToAdd).toEqual([])
    expect(body.adminsToRemove).toEqual([])
    expect(body.adminsToUpdate).toEqual([])
  })

  it('空の項目は null で往復する（空文字にしない）', () => {
    const body = reopenAndSave({ ...FULL, description: null, relatedUrl: null })
    expect(body.description).toBeNull()
    expect(body.relatedUrl).toBeNull()
  })
})

describe('管理者の編集', () => {
  const values = toOrgFormValues(FULL)

  it('外した人だけが削除に載る', () => {
    const edited: OrgFormValues = {
      ...values,
      admins: values.admins.map((a) => (a.userId === 'u_staff' ? { ...a, removed: true } : a)),
    }
    const body = toUpdateOrgBody(edited, values)

    expect(body.adminsToRemove).toEqual(['u_staff'])
    expect(body.adminsToUpdate).toEqual([])
  })

  /** 作成者を外すとグループが管理不能になる。本文にも混ぜない */
  it('作成者は外せない', () => {
    const edited: OrgFormValues = {
      ...values,
      admins: values.admins.map((a) => ({ ...a, removed: true })),
    }
    expect(toUpdateOrgBody(edited, values).adminsToRemove).toEqual(['u_staff'])
  })

  it('役割を変えた人だけが更新に載る', () => {
    const edited: OrgFormValues = {
      ...values,
      admins: values.admins.map((a) => (a.userId === 'u_staff' ? { ...a, role: 'admin' } : a)),
    }
    const body = toUpdateOrgBody(edited, values)

    expect(body.adminsToUpdate).toEqual([{ userId: 'u_staff', role: 'admin' }])
    expect(body.adminsToRemove).toEqual([])
  })

  /** 外す人の役割はもう関係ない。両方に載せると API が二度手間になる */
  it('外す人は役割の更新に載せない', () => {
    const edited: OrgFormValues = {
      ...values,
      admins: values.admins.map((a) =>
        a.userId === 'u_staff' ? { ...a, role: 'admin', removed: true } : a
      ),
    }
    const body = toUpdateOrgBody(edited, values)

    expect(body.adminsToRemove).toEqual(['u_staff'])
    expect(body.adminsToUpdate).toEqual([])
  })

  /** 表示用の名前とアバターは持っているが、**送るのは username と server だけ** */
  it('足した人は username と server で送る', () => {
    const edited: OrgFormValues = {
      ...values,
      newAdmins: [
        {
          username: ' newbie ',
          server: ' fedibird.com ',
          role: 'staff',
          displayName: '新入り',
          avatar: null,
        },
      ],
    }
    expect(toUpdateOrgBody(edited, values).adminsToAdd).toEqual([
      { username: 'newbie', server: 'fedibird.com', role: 'staff' },
    ])
  })
})
