import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

/**
 * 読み物ページの外枠。
 *
 * 利用規約・プライバシーポリシー・Markdown解説・よくある質問・
 * リリースノート・お知らせが使う。**画面ごとに組み立てない** —
 * 見出しの大きさも本文の幅も、揃っていないと「別のサイトへ来た」ように読める。
 *
 * 幅は他の画面と同じ `max-w-5xl` いっぱいに使う（ヘッダーと左端を揃える）。
 * 以前は読む列を `max-w-3xl` に絞っていたが、PCでは右側に大きな空きが
 * 残り、幅が制限されているようにしか見えなかった。
 */
export function ContentPage({
  title,
  lead,
  back,
  children,
}: {
  title: string
  /** 見出しの下に置く一行。無くてもよい */
  lead?: React.ReactNode
  /**
   * 戻り先。**見出しより上に出す**（docs/DESIGN_GUIDELINES.md §8）。
   * 文字リンクにする — ボタンにすると、この画面の主役の操作に見える。
   */
  back?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {back ? (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      {lead ? <p className="mt-2 text-sm text-muted-foreground">{lead}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  )
}

/**
 * 文章そのもの。`<h2>` `<p>` `<ul>` をそのまま書ける。
 *
 * **要素ごとにクラスを振らない。** 規約のような長い文書で1つずつ
 * 色や余白を書くと、書き足した段落だけ揃っていない、が必ず起きる。
 */
export function Prose({ children }: { children: React.ReactNode }) {
  /*
    **`prose-sm` を付ける。** 素の `prose` は本文 16px だが、このアプリの
    本文は `text-sm`（14px）で揃っている。規約だけ一段大きいと、画面を
    移った瞬間に文字の大きさが変わる。見出しも比例して縮む。
  */
  return <div className="prose prose-sm prose-content max-w-none">{children}</div>
}
