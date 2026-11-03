import * as React from 'react'

/**
 * 読み物の中に置く小さな表。
 *
 * **狭い画面では表だけを横に流す。** 表は列数ぶんの最小幅を持つので、
 * 何もしないと本文ごと画面が横スクロールし、縦読みしている最中に
 * 行の頭が画面外へ出る。囲いの中だけが動けば本文は動かない。
 *
 * 中身は文字列で受ける。**JSX で表を組ませない** — 同じ表を2つ書けば
 * 罫線の付け方が必ずずれるし、横スクロールの囲いを片方だけ忘れる。
 */
export function DataTable({
  head,
  rows,
  caption,
  align = 'center',
  mono = false,
}: {
  head: string[]
  rows: string[][]
  /** 読み上げ用の表の名前。画面には出さない */
  caption: string
  /**
   * 2列目以降の揃え。○ × のような一文字は中央、文章は左。
   *
   * **文章を中央寄せにしない。** 行ごとに書き出しの位置が変わって、
   * 上から下へ読めなくなる。
   */
  align?: 'center' | 'left'
  /**
   * 1列目を等幅にする。Cookie 名やキーのように、**綴りをそのまま写す値**のため。
   * 画面側で `<code>` を書かせない（prose が前後に ` を足す）。
   */
  mono?: boolean
}) {
  const valueAlign = align === 'left' ? 'text-left' : 'text-center'
  return (
    <div className="my-4 overflow-x-auto">
      {/* 最小幅は中身で決める。文章の表を ○ × と同じ幅に詰めると、
          1列が10文字ほどになって升目の中で何度も折り返す */}
      <table
        className={`w-full border-collapse text-sm ${align === 'left' ? 'min-w-xl' : 'min-w-md'}`}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-muted">
            {head.map((cell, i) => (
              <th
                key={cell}
                scope="col"
                className={`border border-border px-3 py-2 font-medium text-foreground ${
                  i === 0 ? 'text-left' : valueAlign
                }`}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...values]) => (
            <tr key={label}>
              {/* 1列目は行の見出し。読み上げが「◯◯は 主催者 ○」と読める */}
              <th
                scope="row"
                className={`border border-border px-3 py-2 text-left font-normal text-foreground ${
                  mono ? 'font-mono text-xs' : ''
                }`}
              >
                {label}
              </th>
              {values.map((cell, i) => (
                <td
                  key={i}
                  className={`border border-border px-3 py-2 text-foreground ${valueAlign}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
