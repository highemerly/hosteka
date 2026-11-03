'use client'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { logout } from '@/lib/logout'

/**
 * 確かめてからログアウトする。
 *
 * **押し間違いが取り返しにくい。** 入り直すには OAuth のサーバーまで
 * 往復するので、書きかけのフォームを持ったまま押すと戻れない。
 *
 * **画面ごとに書かない。** ヘッダーとマイページの2箇所から呼ぶが、
 * 片方だけ確認を付けると「同じ操作なのに場所によって挙動が違う」ことになる。
 */
export function useConfirmedLogout(): () => Promise<void> {
  const confirm = useConfirm()

  return async () => {
    const ok = await confirm({
      title: 'ログアウトしますか？',
      confirmLabel: 'ログアウト',
      destructive: true,
    })
    if (!ok) return
    await logout()
  }
}
