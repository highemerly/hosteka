'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarPlus, CalendarRange, ClipboardCheck, Heart } from 'lucide-react'

import { EventCard } from '@/components/event/EventCard'
import { Button } from '@/components/ui/button'
import { useHome } from '@/lib/api/queries/home'
import { PLATFORMS } from '@/screens/auth/sign-in-platforms'
import type { EventListItemDto } from '@/server/serializers/event'
import { MARQUEE_SEGMENTS, marqueeDuration, marqueeSegment } from './marquee'

/**
 * トップページ。**この画面だけランディングとして扱う**
 * （docs/DESIGN_GUIDELINES.md §6）。ヒーローと看板を持つのはここだけ。
 *
 * データは `/api/v1/home` から1往復で取る。ページ側（`app/page.tsx`）は
 * セッションもデータも触らないので、HTML は全閲覧者で同一になり
 * CDN にキャッシュできる（`proxy.ts` の `/` の設定が効く）。
 */

/**
 * 看板の横流し。
 *
 * 並びの作り方は `marquee.ts`。**件数が少ないときは1本の中で繰り返す** —
 * そうしないと巻き戻りの手前で右端に隙間が出る。
 *
 * **2本目以降は読み上げと Tab から外す。** 見た目のために同じ並びを
 * 3本つないでいるだけで、中身は1本目と同じ。外さないと同じイベントを
 * 3回読み上げ、Tab も3周する。
 */
function Marquee({ events }: { events: EventListItemDto[] }) {
  const segment = marqueeSegment(events)

  return (
    /*
      **窓は本文と同じ幅で閉じる。** 以前は画面の端まで流していたが、
      他のすべての面が `max-w-5xl` で揃っているので、ここだけ幅が違うと
      別の作りに見える。枠と面を持たせて、カードが切れているのが
      「窓の縁」だと分かるようにする（縁が無いと欠けて見える）。
    */
    <div className="overflow-hidden rounded-xl border border-border bg-muted/40 py-4">
      <div
        className="animate-marquee flex w-max gap-3"
        /* 速さは枚数から出す。CSS の既定（30秒）は上書きされる */
        style={{ animationDuration: `${marqueeDuration(segment.length)}s` }}
      >
        {Array.from({ length: MARQUEE_SEGMENTS }, (_, copy) => (
          <div
            key={copy}
            className="flex gap-3"
            {...(copy > 0 ? { 'aria-hidden': true, inert: true } : {})}
          >
            {segment.map((event, index) => (
              /* 繰り返しで同じイベントが並ぶので、id だけでは鍵が重なる。
                 幅は一覧の3列（`max-w-5xl` で約320px）に合わせる。狭くすると
                 参加人数と締切を両方持つカードだけ足元が折り返す */
              <div key={`${index}-${event.id}`} className="w-80 shrink-0">
                <EventCard event={event} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      {/*
        **3つとも素のアイコンを同じ大きさで並べる。** 以前は2つだけ
        淡い青の角丸に載せていたが、真ん中の SNS のロゴだけ枠が無く、
        3つで別々の作りに見えた。枠と面を足すほどの意味は無い
        （押せる要素ではない）。高さは揃える — ロゴの列は幅が違うので、
        揃えないと見出しの行が1つだけずれる。
      */}
      <div className="mb-4 flex h-6 items-center gap-2 text-muted-foreground">{icon}</div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export default function HomeScreen() {
  const { data, isPending } = useHome()

  /*
    **取れなかったら節ごと出さない。** 骨組みを出したままにすると
    永久に読み込み中に見える。ヒーローと特徴と導線は取得に依存しないので、
    1件も出せなくてもページとしては成立する。
  */
  const featured = isPending ? [] : (data?.featured ?? [])

  return (
    <div>
      {/* ヒーロー。背景は端まで伸ばし、中身だけ他の画面と同じ幅にそろえる */}
      <section className="bg-linear-to-b from-primary/10 to-background">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 text-center">
          <h1 className="text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl">
            イベント主催者のための
            <br />
            参加者募集プラットフォーム
          </h1>
          {/* 2文になったので `max-w-2xl` では3行になり、最終行に「す。」だけが
              残っていた。幅を広げ、`text-pretty` で中途半端な最終行を避ける */}
          <p className="mx-auto mt-4 max-w-3xl text-sm text-pretty text-muted-foreground sm:text-base">
            Hosteka（ホステカ）は、Mastodon・Misskey
            などのアカウントで参加登録できるイベントページを作れるサービスです。イベント主催者の負担軽減に主眼を置いた設計となっています。
          </p>
          {/*
            **作れるものを2つとも出す。** 以前は「イベントを作成」と
            「マイページへ」を並べていたが、初めて来た人にマイページは無い。
            アイコンの対応はヘッダーのメニューと同じにする。
          */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="primary" asChild>
              <Link href="/events/create">
                <CalendarPlus className="size-4" />
                イベントを作成
              </Link>
            </Button>
            <Button variant="default" asChild>
              <Link href="/pre-events/create">
                <CalendarRange className="size-4" />
                日程調整を作成
              </Link>
            </Button>
          </div>
        </div>

      </section>

      {/* ヒーローの下余白と足し算になるので、ここは控えめに開ける */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12">
        <div className="grid gap-8 md:grid-cols-3">
          <Feature
            icon={<ClipboardCheck className="size-6" />}
            title="充実した幹事用ツール"
          >
            参加者への一括連絡、複数人での主催、アンケート、出欠と集金の記録。
          </Feature>

          <Feature
            icon={
              /*
                ログイン画面と**同じ表**から出す（sign-in-platforms.ts）。
                ここに並びを書き写すと、対応を増やしたときにトップページだけ
                古いままになる。ロゴはブランド色を付けない（icons/social.tsx）。
              */
              <>
                {PLATFORMS.map((platform) => (
                  <platform.icon key={platform.value} className="size-6" />
                ))}
                {/*
                  ロゴ自体は `aria-hidden`（icons/social.tsx）なので、
                  **名前を別に置かないと読み上げに何も残らない。**
                  どのSNSが使えるかは画面の他のどこにも書いていない。
                */}
                <span className="sr-only">
                  {PLATFORMS.map((platform) => platform.label).join('、')}
                </span>
              </>
            }
            title="アカウント作成不要"
          >
            普段使っている SNS のアカウントでそのまま参加登録できます。
          </Feature>

          <Feature
            icon={<Heart className="size-6" />}
            title="完全無料・制限なし"
          >
            主催者も参加者も無料です。機能の制限はありません。
          </Feature>
        </div>

        {/*
          読み込み中に骨組みを出さない。**カードが1枚も無い状態が正常**
          （出せるイベントが無いときは節ごと消える）なので、
          プレースホルダを置くと「読み込みに失敗した」ように見える。
        */}
        {featured.length > 0 ? (
          <div className="mt-12">
            <h2 className="mb-4 text-base font-bold text-foreground">登録されたイベント</h2>
            <Marquee events={featured} />
          </div>
        ) : null}

        {/* primary は1画面に1つ（ヒーローの「イベントを作成」）。ここは中立色 */}
        <div className="mt-12 text-center">
          <Button variant="default" asChild>
            <Link href="/events">
              イベント一覧を見る
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
