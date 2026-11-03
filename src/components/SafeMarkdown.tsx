'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import Link from 'next/link'

import { markdownLinkTarget } from '@/lib/markdown-link'

type Props = {
  children: string
  className?: string
}

/**
 * 許可する色のホワイトリスト
 */
const ALLOWED_COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'pink', 'gray'] as const

const DETAILS_OPEN = /^:::details[ \t]+(\S.*)$/
const DETAILS_CLOSE = /^:::[ \t]*$/

/**
 * :::details タイトル ... ::: 記法を <details><summary> に変換するプリプロセッサ
 *
 * **正規表現1本で書かない。** `\s+(.+?)\s*$` のように空白を食う部品が
 * 重なると、閉じの `:::` が無い入力で総当たりになり、空白を数千並べた
 * 説明文だけで**開いた人のタブが固まる**（長さに対して三乗で遅くなる）。
 * 行ごとに見て、開きの後ろで最初に来る閉じと組にする。
 */
function preprocessDetailsBlocks(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []

  // 各行より後ろで最初に来る閉じの位置。開きのたびに探すと、閉じの無い開きを
  // 並べただけで行数の二乗になる
  const nextClose: number[] = new Array(lines.length)
  let closeAt = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    nextClose[i] = closeAt
    if (DETAILS_CLOSE.test(lines[i])) closeAt = i
  }

  for (let i = 0; i < lines.length; i++) {
    const open = DETAILS_OPEN.exec(lines[i])
    const close = open ? nextClose[i] : -1
    if (!open || close === -1) {
      out.push(lines[i])
      continue
    }

    const title = open[1].trim()
    // 内容の前後の空行をトリム
    const content = lines.slice(i + 1, close).join('\n').trim()
    out.push(`<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>`)
    i = close
  }

  return out.join('\n')
}

/**
 * {color}テキスト{/color} 記法を <span class="text-color-{color}"> に変換するプリプロセッサ
 * コードブロック内は変換しない
 */
function preprocessColorText(markdown: string): string {
  // コードブロックとインラインコードを一時的にプレースホルダーに置換
  const codeBlocks: string[] = []
  const inlineCodes: string[] = []

  // コードブロック（```...```）を保護
  let processed = markdown.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })

  // インラインコード（`...`）を保護
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match)
    return `__INLINE_CODE_${inlineCodes.length - 1}__`
  })

  // 色記法を変換（許可された色のみ、ネストは非対応）
  const colorPattern = new RegExp(
    `\\{(${ALLOWED_COLORS.join('|')})\\}([\\s\\S]*?)\\{\\/\\1\\}`,
    'g'
  )
  processed = processed.replace(colorPattern, (_, color, text) => {
    return `<span class="text-color-${color}">${text}</span>`
  })

  // プレースホルダーを元に戻す
  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[parseInt(index)])
  processed = processed.replace(/__INLINE_CODE_(\d+)__/g, (_, index) => inlineCodes[parseInt(index)])

  return processed
}

/**
 * 出してよい要素。**サニタイザと react-markdown で同じものを使う。**
 * 2箇所に書くと、片方にだけ足した日に食い違う。
 */
const ALLOWED_ELEMENTS = [
  // 見出し
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // テキスト装飾
  'strong', 'em', 'del', 'code',
  // 段落・改行
  'p', 'br',
  // リスト
  'ul', 'ol', 'li',
  // 引用
  'blockquote',
  // テーブル
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // コードブロック
  'pre',
  // リンク（特別処理）
  'a',
  // チェックボックス用
  'input',
  // 折りたたみ
  'details', 'summary',
  // 色文字用
  'span',
]

/**
 * 属性を落とすためのスキーマ。
 *
 * **`allowedElements` だけでは足りない。** あれは**要素名**の許可リストで、
 * 属性は素通りする。`rehypeRaw` で生の HTML を許しているので、
 * 許可された要素に `style` や `class` を好きなだけ付けられた
 * （本文の中に Hosteka の警告枠をそっくり作る、といった見た目のなりすまし）。
 * react-markdown 自身も rehypeRaw を使うならサニタイザを通すよう言っている。
 *
 * 通すのは、この画面が実際に読んでいる属性だけ:
 *
 * - `a` の `href`（行き先は `/external-link` 経由に組み替える）
 * - `input` の `type` / `checked`（GFM のタスクリスト）
 * - `span` の `class`（色文字。**値も許可した色だけ**に絞る）
 * - `th` / `td` の `align`（GFM のテーブル）
 *
 * `style` はどの要素でも通さない。`id` も通さない（ページの id と衝突する）。
 */
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: ALLOWED_ELEMENTS,
  attributes: {
    a: ['href'],
    input: ['type', 'checked'],
    span: [['className', ...ALLOWED_COLORS.map((color) => `text-color-${color}`)]],
    th: ['align'],
    td: ['align'],
  },
  // 生の HTML に書かれたコメントを残さない
  allowComments: false,
  /*
    **`href` に使えるスキームを絞る。** 画面側でも `/external-link` が
    `http`/`https` 以外を弾くが、規則を片方だけに置くと、もう片方の
    書き換えで黙って穴が開く。
  */
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

/** 前処理: :::details 記法と色記法を HTML に変換する（このあとサニタイザを通る） */
export function preprocessMarkdown(markdown: string): string {
  return preprocessColorText(preprocessDetailsBlocks(markdown))
}

export default function SafeMarkdown({ children, className = '' }: Props) {
  const processedMarkdown = preprocessMarkdown(children)
  return (
    // prose: 本文の体裁は @tailwindcss/typography に任せる。
    // markdown-content: prose の色をセマンティックトークンへ差し替え、
    //                   独自記法（:::details / 色文字）を補う（globals.css）。
    <div className={`markdown-content prose max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed={true}
        components={{
          // 見出しレベルを制限
          h1: 'h3',
          h2: 'h3',
          // 外へ出るリンクは中間ページを挟む（判定は `lib/markdown-link.ts`）
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>
            return (
              <Link href={markdownLinkTarget(href).href} className="text-blue-600 hover:underline">
                {children}
              </Link>
            )
          },
          // チェックボックスの処理
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return <input type="checkbox" checked={checked} disabled className="mr-1" />
            }
            return null
          },
          // 色文字用span（許可されたクラスのみ適用）
          span: ({ className, children }) => {
            // 許可された色クラスのパターン
            const allowedClassPattern = /^text-color-(red|blue|green|orange|purple|pink|gray)$/
            if (className && allowedClassPattern.test(className)) {
              return <span className={className}>{children}</span>
            }
            // 許可されていないクラスの場合はクラスなしで表示
            return <span>{children}</span>
          }
        }}
      >
        {processedMarkdown}
      </ReactMarkdown>
    </div>
  )
}