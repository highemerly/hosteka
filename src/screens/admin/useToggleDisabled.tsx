'use client'

import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { ApiClientError } from '@/lib/api/client'
import { useSetDisabled } from '@/lib/api/queries/admin'

const NOUN = { event: 'イベント', 'pre-event': '日程調整' } as const

/**
 * イベント・日程調整の無効化／有効化。確かめてから切り替える。
 *
 * **一覧と通報の詳細で同じ確認を出す。** 片方だけ確認を付けると、
 * 同じ操作が場所によって違う。
 *
 * 確認では「何が変わるか」だけを言う。**参加者の記録は消えない**ことを
 * 必ず添える — 無効化を削除だと思うと、戻せる操作を怖がって使わなくなる。
 */
export function useToggleDisabled() {
  const confirm = useConfirm()
  const setDisabled = useSetDisabled()

  const toggle = async (target: {
    kind: 'event' | 'pre-event'
    id: string
    title: string
    isDisabled: boolean
  }) => {
    const noun = NOUN[target.kind]
    const next = !target.isDisabled

    const ok = await confirm(
      next
        ? {
            title: `この${noun}を無効化しますか？`,
            description: (
              <>
                <p className="font-medium text-foreground">{target.title}</p>
                <p className="mt-2">
                  一覧から消え、主催者を含む管理者以外は、開くことも参加・連絡などの操作もできなくなります。
                  参加者の記録は残り、有効化すれば元に戻ります。
                </p>
              </>
            ),
            destructive: true,
            confirmLabel: '無効化する',
          }
        : {
            title: `この${noun}を有効化しますか？`,
            description: (
              <>
                <p className="font-medium text-foreground">{target.title}</p>
                <p className="mt-2">一覧とページに戻ります。</p>
              </>
            ),
            confirmLabel: '有効化する',
          }
    )
    if (!ok) return

    setDisabled.mutate(
      { kind: target.kind, id: target.id, isDisabled: next },
      {
        onSuccess: () => toast.success(next ? `${noun}を無効化しました` : `${noun}を有効化しました`),
        onError: (e) =>
          toast.error(e instanceof ApiClientError ? e.message : '切り替えられませんでした'),
      }
    )
  }

  return {
    toggle,
    /** いま切り替え中の対象。その行のボタンだけを止める */
    pendingId: setDisabled.isPending ? setDisabled.variables?.id : undefined,
  }
}
