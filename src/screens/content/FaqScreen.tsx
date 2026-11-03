'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { ContentPage } from '@/components/content/ContentPage'
import { cn } from '@/lib/utils'
import { FAQ_CATEGORIES } from '@/screens/content/faq-data'

/**
 * よくある質問。
 *
 * **カテゴリは開いた状態で始める。** 畳んで始めると、目次から飛んでも
 * 見出ししか無い画面に着く。畳めるのは「読み終えた節を片付ける」ためで、
 * 「まだ読んでいないものを隠す」ためではない。
 */
export default function FaqScreen() {
  const [closed, setClosed] = React.useState<Set<string>>(() => new Set())

  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <ContentPage title="よくある質問">
      {/*
        目次。**リンクにする。** 以前は scrollIntoView を呼ぶボタンだったが、
        押しても URL が変わらないので、質問を人に教えるときに位置を渡せない。
        アンカーなら「#category-events-create」で共有できて、戻るでも帰れる。
      */}
      <nav aria-label="目次" className="rule-y">
        {FAQ_CATEGORIES.map((category) => {
          const example = category.questions.find((q) => q.id === category.exampleQuestionId)
          return (
            <a
              key={category.id}
              href={`#category-${category.id}`}
              className="block py-3 transition-colors hover:text-primary"
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-foreground">{category.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {category.questions.length}件
                </span>
              </span>
              {example ? (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  例: {example.question}
                </span>
              ) : null}
            </a>
          )
        })}
      </nav>

      <div className="mt-10 space-y-8">
        {FAQ_CATEGORIES.map((category) => {
          const open = !closed.has(category.id)
          return (
            <section
              key={category.id}
              id={`category-${category.id}`}
              className="scroll-mt-20 border-t border-border pt-6"
            >
              <button
                type="button"
                onClick={() => toggle(category.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 text-left"
              >
                <ChevronDown
                  className={cn(
                    'size-5 shrink-0 text-muted-foreground transition-transform',
                    !open && '-rotate-90'
                  )}
                  aria-hidden
                />
                <span className="text-lg font-bold text-foreground">{category.title}</span>
              </button>

              {open ? (
                <dl className="mt-4 space-y-6">
                  {category.questions.map((item) => (
                    <div key={item.id}>
                      {/*
                        Q/A の印。**色は増やさない。** 以前は Q が青、A が緑で、
                        緑は青系基調から外れていた。強弱で描き分ける
                        （docs/DESIGN_GUIDELINES.md「情報の強弱」）— 探している
                        質問は塗り、続きの答えは線だけ。

                        文字としては読み上げに要らない（`<dt>` `<dd>` が
                        すでに質問と答えを言っている）ので `aria-hidden`。
                      */}
                      <dt className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
                        >
                          Q
                        </span>
                        <span className="text-sm font-medium text-foreground">{item.question}</span>
                      </dt>
                      <dd className="mt-2 flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border border-border text-xs font-bold text-muted-foreground"
                        >
                          A
                        </span>
                        {/*
                          min-w-0 が要る。**表が入る答えがある**ので、
                          これが無いと flex の子が縮まず、表の最小幅ぶん
                          本文ごと横へはみ出す（囲いの中だけを流したい）。
                        */}
                        <div className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                          {item.answer}
                        </div>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          )
        })}
      </div>
    </ContentPage>
  )
}
