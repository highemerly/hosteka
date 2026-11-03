'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { Notice } from '@/components/common/Notice'
import { Button } from '@/components/ui/button'

/**
 * 外部サイトへ出る前の一枚。
 *
 * **行き先を読ませるための画面。** 押した先が Hosteka の管理外だと
 * 分かるようにし、ホスト名を大きく出す（信用を決めているのはそこ）。
 */
export default function ExternalLinkScreen() {
  const searchParams = useSearchParams()
  const target = searchParams.get('url')

  /*
    **`http`/`https` だけを通す。** ここは受け取ったURLをそのまま
    リンクにする画面なので、`javascript:` などを弾く場所がここしかない。
  */
  let url: URL | null = null
  try {
    if (target) {
      const parsed = new URL(target)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed
    }
  } catch {
    url = null
  }

  if (!url) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          開けないリンクです
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          行き先が指定されていないか、対応していない形式です。
        </p>
        <Button variant="primary" className="mt-6" asChild>
          <Link href="/">トップページへ</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          外部のサイトへ移動します
        </h1>

        <Notice tone="attention" title="このサイトは Hosteka の管理外です" className="mt-4">
          <p>内容について Hosteka は責任を負いません。金銭のやり取りにはとくに注意してください。</p>
        </Notice>

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">移動先</p>
          {/* 信用を決めているのはホスト名。ここだけ大きく出す */}
          <p className="mt-1 font-bold break-all text-foreground">{url.hostname}</p>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{url.href}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" asChild>
            {/* 新しいタブで開く。ここで置き換えると、戻る場所を奪う */}
            <a href={url.href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              このサイトへ移動する
            </a>
          </Button>
          <Button variant="default" onClick={() => window.history.back()}>
            前のページへ戻る
          </Button>
        </div>
      </div>
    </div>
  )
}
