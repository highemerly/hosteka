'use client'

import * as React from 'react'
import { Share } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  BlueskyIcon,
  FacebookIcon,
  LineIcon,
  MastodonIcon,
  MisskeyIcon,
  PleromaIcon,
  ThreadsIcon,
  XIcon,
} from '@/components/icons/social'

import { buildAnypostShareUrl } from './share-targets'

/**
 * ボタンの中に並べるサービス。
 * **押せる要素ではない。** 「どこへ出せるか」を一目で伝える絵で、
 * 押し先は1つ（anypost.dev）。個別に押せるように見せると、
 * 実際には行き先が同じなので操作を裏切る。
 *
 * `mobile` は狭い画面でも出すもの。8つ並べるとボタンだけで**画面幅の6割**を
 * 占め、下部の操作列が1行1ボタンに崩れるので、狭いときは4つに絞る。
 *
 * **X は絞っても残す。** 残りの Fediverse 3つは互いに見分けが付きにくく、
 * 「Fediverse にも一般の SNS にも出せる」ことは Fediverse 1つ＋X で伝わる。
 * 先頭から4つ取ると X が落ち、Fediverse 専用のボタンに見えていた。
 */
const SERVICES = [
  { id: 'mastodon', icon: MastodonIcon, mobile: true },
  { id: 'misskey', icon: MisskeyIcon, mobile: true },
  { id: 'pleroma', icon: PleromaIcon, mobile: true },
  { id: 'bluesky', icon: BlueskyIcon, mobile: false },
  { id: 'threads', icon: ThreadsIcon, mobile: false },
  { id: 'line', icon: LineIcon, mobile: false },
  { id: 'x', icon: XIcon, mobile: true },
  { id: 'facebook', icon: FacebookIcon, mobile: false },
] as const

/**
 * イベントを SNS へシェアする。
 *
 * 投稿先の選択は anypost.dev に任せる（share-targets.ts の説明を参照）。
 * ボタンの中に対応サービスのアイコンを並べ、「どこへ出せるか」を
 * 押す前に見せる。ブランド色は付けない — 8色が常時並ぶと、そこが
 * 画面で最も強い面になり参加登録より目立つ。
 */
export function ShareBar({
  title,
  disabled = false,
  stretch = false,
}: {
  title: string
  /**
   * 狭い画面で、隣のボタンと一緒に横幅を分け合うか。
   *
   * 詳細ページの操作列でだけ真にする。**中に2つ持っているので、
   * 伸びしろも2つ分もらう**（`grow-[2]`）— 1つ分にすると、隣の
   * アイコン1つのボタンと同じ幅を2つで分けることになり、ここだけ細くなる。
   */
  stretch?: boolean
  /**
   * 作成前プレビュー用。**見た目は変えずに操作だけ止める。**
   * 共有する URL はイベントを保存して初めて決まるので、
   * ここで押させると `/events/create` を共有することになる。
   */
  disabled?: boolean
}) {
  /*
    navigator.share は iOS / Android にしかない。SSR では触れない。

    **状態ではなく外部ソースとして読む。** effect で `setState` すると
    「無い」と描いてから「ある」に差し替わる（`react-hooks/set-state-in-effect`）。
    購読するものは無いので、変更の通知は空のままでよい。
  */
  const canDeviceShare = React.useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    // サーバーでは「無い」として描く。ここが食い違うと hydration が壊れる
    () => false
  )

  const shareInput = () => ({
    url: typeof window === 'undefined' ? '' : window.location.href,
    title,
  })

  const handleShare = () => {
    window.open(
      buildAnypostShareUrl(shareInput()),
      '_blank',
      'width=600,height=700,noopener,noreferrer'
    )
  }

  const handleDeviceShare = async () => {
    const { url, title: text } = shareInput()
    try {
      await navigator.share({ title: text, url })
    } catch {
      // ユーザーが共有シートを閉じただけ。エラー表示はしない
    }
  }

  // 半透明にはしない（disabled を使わない）。プレビューの主題は見た目なので、
  // 薄くすると「本番でもこう見える」と誤解させる
  const inert = disabled ? { 'aria-disabled': true as const, tabIndex: -1 } : {}
  const inertClass = disabled ? 'pointer-events-none' : ''
  const stretchClass = stretch ? 'max-sm:grow' : ''

  return (
    /*
      **「シェア」と「共有」は必ず同じ行に置く。** 折り返すと、
      端末の共有シートが「シェアとは別の何か」に見える。
      狭い画面ではシェア側を縮めて場所を作る（アイコンは畳まれるが、
      押し先は変わらない）。
    */
    <div
      className={`flex items-center gap-2 ${
        /* 伸びしろは中のボタンの数だけもらう。端末の共有シートが無い
           ブラウザでは1つしか描かないので、そのときは1つ分 */
        stretch ? (canDeviceShare ? 'max-sm:grow-[2]' : 'max-sm:grow') : ''
      }`}
    >
      {/*
        **ラベルに文字サイズを書かない。** ボタンの size が決めた大きさを
        そのまま使う。ここだけ text-sm にしていたせいで、隣の
        「主催者へ連絡」「通報」と1段ずれて並んでいた。

        **横幅を伸ばさない**（`flex-1` を持たない）。操作列の中で1つだけ
        伸びると、狭い画面で他のボタンが弾き出されて1行1ボタンになる。
      */}
      <Button
        variant="default"
        size="sm"
        className={`${stretchClass} ${inertClass}`}
        onClick={handleShare}
        aria-label="SNSでシェア（anypost.dev が開きます）"
        {...inert}
      >
        <span className="flex items-center gap-1 text-muted-foreground sm:gap-1.5">
          {SERVICES.map(({ id, icon: Icon, mobile }) => (
            <Icon
              key={id}
              className={mobile ? 'size-3.5 sm:size-4' : 'hidden size-4 sm:block'}
            />
          ))}
        </span>
        {/*
          ロゴが行き先を語るので、ラベルは操作の名前だけでよい。
          **狭い画面では文字を畳む**（情報行の「カレンダーに追加」と同じ扱い）。
          ロゴが残るので、文字が無くても何のボタンかは読める。
        */}
        <span className="ml-1 max-sm:hidden">シェア</span>
      </Button>

      {/* 端末の共有シート。対応端末（iOS / Android）でだけ出す */}
      {canDeviceShare ? (
        <Button
          variant="default"
          size="sm"
          className={`max-sm:w-9 max-sm:px-0 ${stretchClass} ${inertClass}`}
          aria-label="端末の共有メニューを開く"
          title="その他の方法で共有"
          onClick={handleDeviceShare}
          {...inert}
        >
          <Share className="size-4" />
          <span className="max-sm:hidden">共有</span>
        </Button>
      ) : null}
    </div>
  )
}
