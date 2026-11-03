import Link from 'next/link'
import { CalendarRange, CircleSlash, Link2, MapPin, Users } from 'lucide-react'

import { DateBadge } from '@/components/event/DateBadge'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { Tag } from '@/components/event/Tag'
import { DeadlineText } from '@/components/event/DeadlineText'
import { isUrlLocation } from '@/components/event/location'
import { primaryDate, scheduleNote, type Attendable } from './attendable'

/** カードに出すハッシュタグの数。溢れると日付とタイトルの視線を奪う */
const TAG_LIMIT = 2

/**
 * 一覧のカード。**イベントと日程調整で同じものを使う。**
 *
 * 詳細ページと同じ語彙で組む。左に日めくりの `DateBadge`、右にタイトル。
 * 「この四角＝開催日」という対応を一覧でも育てる。
 * 日程調整では**いちばん早い候補**を出し、下に「候補3日」と添える。
 *
 * **カード全体が押せるが、リンクは入れ子にしない。**
 * `<a>` の中に `<a>` は置けないので、カード自体は div にして、
 * タイトルのリンクを疑似要素でカード全体に広げる（stretched link）。
 * ハッシュタグはその上に載せて、別の行き先として押せるようにする。
 */
export function AttendableCard({ item }: { item: Attendable }) {
  const date = primaryDate(item.schedule)
  const note = scheduleNote(item.schedule)
  const tags = item.tags.slice(0, TAG_LIMIT)
  const remaining =
    item.people.capacity != null ? item.people.capacity - item.people.count : null

  return (
    <div className="raised relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex items-start gap-3">
        {/* 候補が1つも無い日程調整は日付を出せない。枠だけ残すと
            読み込み中に見えるので、記号に置き換える */}
        {date ? (
          <DateBadge date={date} size="sm" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">
            <CalendarRange className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/*
            中止は**題名の上**に出す。読んでから気づくのでは遅い。
            題名の後ろに付けると、長い題名では折り返しの先へ回って見えない。
          */}
          {item.cancelled ? (
            <span className="mb-1 inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-bold text-destructive">
              <CircleSlash className="size-3" aria-hidden />
              中止
            </span>
          ) : null}
          <h3 className="text-sm leading-snug font-bold text-foreground">
            {/* after:inset-0 でカード全体が押せる。タグはこの上に載せる */}
            <Link
              href={item.href}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {item.title}
            </Link>
          </h3>
          {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
        </div>
      </div>

      {item.location ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* 場所の欄はURLも受ける。オンラインの会場にピンを出すと
              現地でやるように読める（components/event/location.ts） */}
          {isUrlLocation(item.location) ? (
            <Link2 className="size-3.5 shrink-0" />
          ) : (
            <MapPin className="size-3.5 shrink-0" />
          )}
          <span className="line-clamp-1">{item.location}</span>
        </p>
      ) : null}

      {tags.length > 0 ? (
        // relative z-10 でカード全体のリンクより手前に出す
        <div className="relative z-10 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Tag key={tag} href={item.tagHref?.(tag)}>
              #{tag}
            </Tag>
          ))}
          {item.tags.length > tags.length ? (
            <span className="self-center text-xs text-muted-foreground">
              +{item.tags.length - tags.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {/*
        下端を揃える。カードの高さが揃うと一覧が読みやすい。

        **両端とも縮ませず、入らなければ行を折る。**
        締切（`DeadlineText`）は元から `shrink-0` なので、狭いカードでは
        圧力が全部こちらに来て「19 / 40人」が3行に割れていた
        （3列に並べたときの1枚は約320px しかない）。数字が割れるくらいなら
        締切を次の行へ落としたほうが読める。どちらの情報も落とさない。
      */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border pt-3">
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {item.people.avatars.length > 0 ? (
            <span className="flex -space-x-2">
              {item.people.avatars.map((u) => (
                <UserAvatar key={u.id} name={u.displayName} src={u.avatar} size="xs" />
              ))}
            </span>
          ) : (
            <Users className="size-3.5" />
          )}
          {item.people.count}
          {item.people.capacity != null ? ` / ${item.people.capacity}` : ''}
          {item.people.unit}
        </span>

        <DeadlineText
          deadline={item.deadline}
          remaining={remaining}
          capacity={item.people.capacity}
          className="text-xs"
        />
      </div>
    </div>
  )
}
