'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * 書きかけの入力を持ったまま画面を離れようとしたときに引き止める。
 *
 * **画面ごとに書かない。** 抜け道は3つあり（リンク・ブラウザバック・
 * タブを閉じる／再読み込み）、どれか1つでも塞ぎ忘れると
 * 「ある道からは守られるが、別の道からは黙って消える」ことになる。
 * 塞ぎ方をここに1つだけ置く。
 *
 * 使う側は「未保存かどうか」だけを渡す:
 *
 * ```tsx
 * <UnsavedChangesGuard when={formState.isDirty && !saved} />
 * ```
 *
 * ### 塞いでいる道
 *
 * | 抜け道 | 見えるもの |
 * |---|---|
 * | 画面内のリンク（ヘッダー・戻る・やめる） | このダイアログ |
 * | ブラウザの「戻る」 | このダイアログ |
 * | タブを閉じる・再読み込み・別サイトへ | ブラウザ標準の確認 |
 *
 * 最後の1つだけ姿が違うのは仕様。`beforeunload` の文言はブラウザが
 * 決めるもので、こちらから差し替えられない。
 *
 * ### 塞げていない道
 *
 * - **前に進む（Forward）** … 戻るのように差し込む先がない
 * - **履歴に前のページが無いときの「戻る」** … 戻り先そのものが無いので、
 *   引き止めたあと「離れる」を選んでも行き先が無い。直リンクで開いた
 *   ときにだけ起きる
 */
export function UnsavedChangesGuard({
  when,
  title = '編集中の内容が保存されていません',
  description = 'このまま移動すると、入力した内容は失われます。',
  leaveLabel = '移動する',
}: {
  /** 未保存の変更があるか。false の間は何もしない */
  when: boolean
  title?: string
  description?: string
  /** 「離れる」側のボタンの文言。画面に合わせて変える */
  leaveLabel?: string
}) {
  const router = useRouter()

  /** 引き止めている行き先。`'back'` はブラウザの戻る */
  const [pending, setPending] = React.useState<string | 'back' | null>(null)

  /*
    「離れる」を選んだ直後は、自分の仕掛けが自分の遷移を止めないように
    素通しにする。state ではなく ref なのは、同じ tick の中で
    ハンドラから読むため。
  */
  const leaving = React.useRef(false)

  // ------------------------------------------------------------------
  // タブを閉じる・再読み込み・別サイトへ
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!when) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return
      // 文言はブラウザが決める。preventDefault が「確認を出す」の合図
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  // ------------------------------------------------------------------
  // 画面内のリンク
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!when) return

    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented) return
      // 中クリック・修飾キー付きは別タブで開く操作。この画面は残る
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || anchor.hasAttribute('download')) return
      // 別タブで開くリンク（Markdownの解説など）はこの画面を離れない
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(href, window.location.href)
      // ページ内アンカーと、いま居る場所そのものへのリンクは移動ではない
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }

      /*
        capture 段階で止める。next/link は自前の onClick で遷移するので、
        bubble を待つと先に遷移が始まってしまう。
      */
      e.preventDefault()
      e.stopPropagation()
      setPending(url.pathname + url.search + url.hash)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [when])

  // ------------------------------------------------------------------
  // ブラウザの「戻る」
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!when) return

    /*
      戻るを1回吸収するための番兵を積む。同じURLなので画面は変わらない。
      戻られたら番兵を積み直して踏みとどまり、確認を出す。

      **積み直しても履歴は伸びない。** 戻ったあとの pushState は
      前へ進む側の履歴を切り捨てるので、番兵は常にちょうど1つに保たれる。
      だから「離れる」は必ず2つ分（番兵＋この画面）戻ればよい。
    */
    const pushSentinel = () =>
      window.history.pushState({ unsavedGuard: true }, '', window.location.href)

    pushSentinel()

    const onPopState = () => {
      if (leaving.current) return
      pushSentinel()
      setPending('back')
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [when])

  const leave = () => {
    if (pending === null) return
    leaving.current = true

    if (pending === 'back') {
      // 番兵とこの画面の2つ分。番兵は常に1つなのでこの数で足りる
      window.history.go(-2)
    } else {
      router.push(pending)
    }
    setPending(null)
  }

  const stay = () => {
    setPending(null)
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => (open ? null : stay())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {/*
            既定は「留まる」側。押し間違いで失われるものが大きいほうを
            主要な操作にしない。移動は destructive で「戻せない」ことを示す
          */}
          <Button variant="primary" onClick={stay}>
            編集を続ける
          </Button>
          <Button variant="destructive" onClick={leave}>
            {leaveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
