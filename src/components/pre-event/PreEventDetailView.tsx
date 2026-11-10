'use client'

import * as React from 'react'
import Link from 'next/link'
import { Coins, FileText, Flag, MapIcon, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import SafeMarkdown from '@/components/SafeMarkdown'
import { useViewer } from '@/hooks/useViewer'
import { userProfilePath } from '@/lib/user-handle'
import { isReportableTarget } from '@/schemas/report'
import type { PreEventDetailDto } from '@/server/serializers/pre-event'

import { CandidatesBadge } from '@/components/event/DateBadge'
import { ConditionLink } from '@/components/event/ConditionLink'
import { EventInfoRow, UserAvatar } from '@/components/event/EventInfoRow'
import { PlatformCondition } from '@/components/event/PlatformCondition'
import { ShareBar } from '@/components/event/ShareBar'
import { Tag } from '@/components/event/Tag'
import { buildAnypostContactUrl } from '@/components/event/share-targets'
import {
  ContactAction,
  DeadlineCondition,
  InfoRowAction,
  LocationRow,
  Space,
} from '@/components/attendable/DetailParts'
import { resolveLocation } from '@/components/event/location'
import { hashtagPath } from '@/lib/hashtags'
import { formatJstDateTime } from '@/lib/jst'

import { DateOptionList } from './DateOptionList'
import { RespondentList } from './RespondentList'
import { PreEventAction, type PreEventActionState } from './PreEventAction'

/**
 * 日程調整の詳細。
 *
 * **イベント詳細と同じ構成・同じ部品で組む**（docs/DESIGN_GUIDELINES.md §7）。
 * 締切バッジ・場所の行・参加条件・シェア・主催者欄はそのまま共有する。
 * 違うのは真ん中だけ — イベントは「参加するかどうか」、こちらは
 * 「どの日なら出られるか」。
 *
 * 取得もミューテーションも持たない。渡された DTO を描くだけ。
 */
/**
 * 作成・更新の日時。**時分まで出す。**
 * 日付だけだと、同じ日に何度か直したイベントで「どれが最新か」が
 * 読めない。秒までは要らない（そこまでの差で見比べる場面がない）。
 */
const STAMP_FORMAT = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
} as const

export function PreEventDetailView({
  preEvent,
  state,
  selfState,
  onRespond,
  onReport,
  onDelete,
}: {
  preEvent: PreEventDetailDto
  state: PreEventActionState
  /**
   * 主催者自身の回答状態。**画面側で解決して渡す**（`state` から
   * isOrganizer を外したもの）。幹事の隣に並べる回答ボタンに使う。
   */
  selfState?: PreEventActionState
  onRespond?: () => void
  onReport?: () => void
  onDelete?: () => void
}) {
  const { viewer } = useViewer()

  /** 幹事から見ているか。編集の入口の出し分けに使う */
  const isHost = state.kind === 'host'
  /** イベントにしたか。したら編集できない（サーバーが断る） */
  const promoted = preEvent.promotion !== null
  const canPromote = preEvent.viewer.canDelete && !promoted

  const contactUrl = buildAnypostContactUrl({
    url: typeof window === 'undefined' ? '' : window.location.href,
    title: preEvent.title,
    targets: [preEvent.creator],
    viewer,
  })
  /*
    **幹事にも「主催者へ連絡」を出す。** イベント詳細（`EventDetailView`）と
    同じ規則。宛先から自分を外して誰も残らない（＝自分が作成者）ときは
    URL が null になるので、それで押せなくする。
  */
  const showContact = Boolean(contactUrl)
  /*
    通報は**ログイン中の、主催者でない閲覧者にだけ**出す。
    未ログインでは送れない（API が拒否する）ので、押せるように見せない。
    主催者に出すと自分の日程調整を通報できてしまう。
  */
  const showReport =
    preEvent.viewer.isAuthenticated &&
    !preEvent.viewer.isOrganizer &&
    isReportableTarget({ preEventId: preEvent.id })
  /*
    回答者全員への連絡。**主催者に限らない** — 連絡画面のAPIは
    「主催者または回答した人」を通すので、そこに合わせる。
    イベント詳細（`EventDetailView`）と同じ考え方。
  */
  const canContactRespondents =
    preEvent.viewer.isAuthenticated &&
    (preEvent.viewer.isOrganizer || preEvent.viewer.response !== null)

  /* スマホの操作列に再掲する地図。住所のときだけ行き先がある */
  const mapHref =
    preEvent.location && resolveLocation(preEvent.location).kind === 'place'
      ? resolveLocation(preEvent.location).href
      : null

  return (
    <>
      <div className="flex items-center gap-3">
        {/*
          候補が複数あるので日めくり（`DateBadge`）は出せない。
          **代わりに同じ大きさ・同じ面の札を置く** — ここだけ小さいと、
          イベントと日程調整で見出しの高さが揃わない。
        */}
        <CandidatesBadge count={preEvent.dateOptions.length} />
        <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {preEvent.title}
        </h1>

        {/*
          幹事だけに出す編集の入口。**題名の高さに置く**（イベント詳細と同じ）。
          幹事メニューの中にも同じ行き先があるが、開いて選ぶ手数が要る。
          直しに来た人がまず探すのは題名のそばなので、そこに置く。
          **狭い画面では出さない** — 題名の横幅を削る。幹事メニューから行ける。
        */}
        {isHost && !promoted ? (
          <Button
            variant="default"
            size="icon-sm"
            className="shrink-0 max-sm:hidden"
            aria-label="編集"
            title="編集"
            asChild
          >
            <Link href={`/pre-events/${preEvent.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>

      {preEvent.hashtags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {preEvent.hashtags.map((tag) => (
            <Tag key={tag} href={hashtagPath(tag)}>
              #{tag}
            </Tag>
          ))}
        </div>
      ) : null}

      {/* 詳細を読む前に回答を決められる人を待たせない。
          幹事には回答者用の操作と幹事メニューが2つ並ぶ。
          **狭い画面でも1行に並べる**（イベント詳細と同じ。`HOST_ACTION_WIDTH`
          が幅を半分ずつ分け、収まらないラベルを折り返す） */}
      <div className="mt-5 flex items-stretch gap-2 sm:items-center">
        <PreEventAction
          preEventId={preEvent.id}
          state={state}
          selfState={selfState}
          promoted={promoted}
          canPromote={canPromote}
          onRespond={onRespond}
          onDelete={onDelete}
        />
      </div>

      {/* 参加条件。イベント詳細と同じ姿にする（`ConditionLink`）。
          押せるものはどれもモーダルで開く */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {preEvent.registrationDeadline ? (
          <DeadlineCondition deadline={preEvent.registrationDeadline} />
        ) : null}
        <PlatformCondition event={preEvent} />
        {preEvent.terms ? (
          <ConditionLink
            icon={<FileText className="size-3.5" />}
            label="参加規約"
            title="参加規約"
          >
            <SafeMarkdown>{preEvent.terms}</SafeMarkdown>
          </ConditionLink>
        ) : null}
      </div>

      <Space />

      <section>
        <h2 className="mb-3 text-base font-bold text-foreground">候補日</h2>
        <DateOptionList
          options={preEvent.dateOptions}
          chosenId={preEvent.promotion?.dateOptionId ?? null}
        />
      </section>

      <Space />

      {/*
        誰がどう答えたか。**コメントはここにしか出せない** —
        回答ごとに1つ書くものなので、候補日の側に置き場が無い。
      */}
      <section>
        <h2 className="mb-3 text-base font-bold text-foreground">
          回答{preEvent.respondentCount > 0 ? `（${preEvent.respondentCount}人）` : ''}
        </h2>
        <RespondentList
          respondents={preEvent.respondents}
          dateOptions={preEvent.dateOptions}
          viewerId={viewer?.id ?? null}
        />
      </section>

      <Space />

      {/*
        情報の並び。イベント側と同じく上下の縁にも罫線を引く（`rule-y`）。
        **中身が無いときは節ごと出さない。** 空の節に上下の線だけが残ると、
        何も無い隙間を2本の線が囲うことになる。
      */}
      {preEvent.location || preEvent.fee ? (
        <>
          <section className="rule-y">
            {preEvent.location ? (
              <LocationRow location={preEvent.location} preview={false} />
            ) : null}

            {preEvent.fee ? (
              <EventInfoRow icon={<Coins className="size-4" />}>{preEvent.fee}</EventInfoRow>
            ) : null}
          </section>

          <Space />
        </>
      ) : null}

      {/* 説明は本文の幅いっぱいに使う（`EventDetailView` と同じ） */}
      {preEvent.description ? (
        <section>
          <SafeMarkdown>{preEvent.description}</SafeMarkdown>
        </section>
      ) : null}

      {/*
        説明の下の操作列。**イベント詳細とまったく同じ並び・同じ大きさ・
        同じ組分け**（`EventDetailView` の説明を参照）。回答操作をいちばん左に
        再掲し、主催者へ連絡 → シェア → 共有 → 通報 と続ける。
        スマホでは「回答・連絡」と「シェア・共有・通報」の2行に割る。
      */}
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PreEventAction
            preEventId={preEvent.id}
            state={state}
            selfState={selfState}
            size="sm"
            widthClassName="max-w-full max-sm:grow"
            promoted={promoted}
            canPromote={canPromote}
            onRespond={onRespond}
            onDelete={onDelete}
          />

          <ContactAction
            onContactOrganizer={
              showContact
                ? () =>
                    contactUrl &&
                    window.open(contactUrl, '_blank', 'width=600,height=700,noopener,noreferrer')
                : null
            }
            participantsHref={
              canContactRespondents ? `/pre-events/${preEvent.id}/contact` : null
            }
            participantsLabel="回答者全員に連絡"
            className="max-sm:grow"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ShareBar title={preEvent.title} stretch />

          {/* スマホでだけ情報行の操作を再掲する（`EventDetailView` の説明を参照）。
              日程調整は日付が決まっていないので、カレンダーは無く地図だけ */}
          {mapHref ? (
            <div className="flex grow items-center gap-2 sm:hidden">
              <InfoRowAction
                icon={<MapIcon className="size-4" />}
                label="地図"
                href={mapHref}
                external
                className="grow"
                preview={false}
              />
            </div>
          ) : null}

          {showReport ? (
            <Button
              variant="default"
              size="sm"
              className="hover:text-destructive max-sm:w-9 max-sm:grow max-sm:px-0"
              aria-label="通報"
              title="通報"
              onClick={onReport}
            >
              <Flag className="size-4" />
              <span className="max-sm:hidden">通報</span>
            </Button>
          ) : null}
        </div>
      </div>

      <Space />

      <section className="rule-t pt-6">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={preEvent.organization?.name ?? preEvent.creator.displayName}
            src={preEvent.organization ? null : preEvent.creator.avatar}
          />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">主催</div>
            {/* 飛び先は Hosteka の中。理由は `EventDetailView` に書いてある */}
            <Link
              href={
                preEvent.organization
                  ? `/orgs/${preEvent.organization.slug}`
                  : userProfilePath(preEvent.creator)
              }
              className="text-sm font-medium text-foreground hover:underline"
            >
              {preEvent.organization?.name ?? preEvent.creator.displayName}
            </Link>
          </div>
        </div>

        <dl className="mt-5 space-y-1 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt>日程調整ID</dt>
            <dd className="font-mono">{preEvent.id}</dd>
          </div>
          {/* 「作成日」「最終更新日」と書かない。日付だけでなく時刻まで出すので
              「日」が余る。ここは並びの左端で、右に日時があることは見れば分かる */}
          <div className="flex gap-2">
            <dt>作成</dt>
            <dd>{formatJstDateTime(preEvent.createdAt, STAMP_FORMAT)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>更新</dt>
            <dd>{formatJstDateTime(preEvent.updatedAt, STAMP_FORMAT)}</dd>
          </div>
        </dl>
      </section>
    </>
  )
}
