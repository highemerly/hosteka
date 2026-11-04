'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CalendarPlus,
  Clock,
  Coins,
  FileText,
  Flag,
  MapIcon,
  Pencil,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import SafeMarkdown from '@/components/SafeMarkdown'
import { Notice } from '@/components/common/Notice'
import { useViewer } from '@/hooks/useViewer'
import { isReportableTarget } from '@/schemas/report'
import type { EventDetailDto } from '@/server/serializers/event'

import {
  ContactAction,
  DeadlineCondition,
  InfoRowAction,
  LocationRow,
  Space,
  type DetailVariant,
} from '@/components/attendable/DetailParts'
import { formatJstDateTime } from '@/lib/jst'
import { formatSchedule } from '@/lib/event-schedule'
import { userProfilePath } from '@/lib/user-handle'

import { resolveLocation } from './location'
import { ConditionLink } from './ConditionLink'
import { Tag } from './Tag'
import { DateBadge } from './DateBadge'
import { EventAction, type EventActionState } from './EventAction'
import { EventInfoRow, UserAvatar } from './EventInfoRow'
import { ParticipantList, type ParticipantView } from './ParticipantList'
import { PlatformCondition } from './PlatformCondition'
import { ShareBar } from './ShareBar'
import { buildAnypostContactUrl, canMention } from './share-targets'

/**
 * イベント詳細の見た目。
 *
 * **画面（EventDetailScreen）から切り離してある。** 作成前プレビューが
 * 同じものを描くため。似せて別に作ると、片方だけ直したときに
 * 「プレビューでは出ていた項目が本番には無い」ことになる。
 * 構成は docs/DESIGN_GUIDELINES.md §7 に従う。
 *
 * 取得もミューテーションも持たない。渡された DTO を描くだけ。
 */

/**
 * 下書きを描いているか。
 *
 * `preview` では**行き先のある要素をリンクにしない**。押すと入力途中の
 * フォームから離れてしまうし、まだ存在しないイベントの URL は作れない。
 * 見た目は変えない — 押せないことより「本番でどう見えるか」が主題なので、
 * 灰色に落とすとプレビューとして役に立たなくなる。
 */
export type EventDetailVariant = DetailVariant

/**
 * 題名の下に並ぶ参加条件。締切・定員・参加できるアカウント・参加規約。
 *
 * **押せるものは全部モーダルで開く**（`ConditionLink`）。ここは
 * 「参加登録」のすぐ下なので、ボタンの姿をした面を並べると操作の列に見える。
 *
 * **プレビューでもそのまま押せる。** どれも中身を読ませるだけで、
 * どこへも移動しない。ここを止めると、主催者が「参加規約がどう見えるか」を
 * プレビューで確かめられなくなる。
 */
function Conditions({ event }: { event: EventDetailDto }) {
  const remaining =
    event.maxParticipants != null ? event.maxParticipants - event.counts.attending : null
  // 残席が2割を切ったら強調する。数字だけだと切迫感が伝わらない
  const scarce =
    remaining != null && event.maxParticipants != null
      ? remaining <= event.maxParticipants * 0.2
      : false

  const any = [
    event.registrationDeadline,
    remaining,
    event.allowedServers.length,
    event.terms,
    // 全プラットフォーム可なら false。条件は出ない
    !(event.isAllowedForFediverse && event.isAllowedForDiscord && event.isAllowedForTwitter),
  ].some(Boolean)
  if (!any) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {event.registrationDeadline ? (
        <DeadlineCondition deadline={event.registrationDeadline} />
      ) : null}

      {remaining != null ? (
        <ConditionLink
          icon={<Users className="size-3.5" />}
          tone={scarce ? 'warning' : 'default'}
          label={`残り${Math.max(remaining, 0)} / ${event.maxParticipants}人`}
          title="定員"
        >
          {/* 畳んだ文字は「残り何人か」だけを言う。内訳はここで出す */}
          <dl className="space-y-1 text-sm text-foreground">
            <div className="flex gap-3">
              <dt className="w-12 text-muted-foreground">定員</dt>
              <dd>{event.maxParticipants}人</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-12 text-muted-foreground">参加</dt>
              <dd>{event.counts.attending}人</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-12 text-muted-foreground">残り</dt>
              <dd>{Math.max(remaining, 0)}人</dd>
            </div>
          </dl>
        </ConditionLink>
      ) : null}

      <PlatformCondition event={event} />

      {event.terms ? (
        <ConditionLink
          icon={<FileText className="size-3.5" />}
          label="参加規約"
          title="参加規約"
        >
          <SafeMarkdown>{event.terms}</SafeMarkdown>
        </ConditionLink>
      ) : null}
    </div>
  )
}

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

export function EventDetailView({
  event,
  variant = 'live',
  actionState,
  selfState,
  participants,
  onParticipate,
  onEditParticipation,
  onReport,
}: {
  event: EventDetailDto
  variant?: EventDetailVariant
  /**
   * 参加操作の状態。**画面側で解決して渡す。**
   * ここで `resolveEventActionState` を呼ぶと、プレビューが
   * 「主催者の目線」に倒れて参加登録ボタンが見えなくなる。
   */
  actionState: EventActionState
  selfState?: EventActionState
  participants: ParticipantView[]
  onParticipate?: () => void
  onEditParticipation?: () => void
  /** 通報ダイアログを開く。**ダイアログ自体は画面側が持つ** */
  onReport?: () => void
}) {
  const preview = variant === 'preview'
  /*
    プレビュー中の押せない要素。**見た目は本番のままにする。**
    `disabled` にすると半透明になり、「本番でもこう薄く見える」と
    誤解させる。プレビューの主題は「どう見えるか」なので、
    見た目を変えずに操作だけ止める。
  */
  const inertProps = preview ? ({ 'aria-disabled': true, tabIndex: -1 } as const) : {}
  const inertClass = preview ? 'pointer-events-none' : ''

  const cancelled = event.status === 'cancelled'
  /** 幹事から見ているか。中止の知らせと操作の出し分けに使う */
  const isHost = actionState.kind === 'host'

  const { viewer } = useViewer()

  /*
    主催者への連絡先。作成者と幹事を、この順で宛先にする。
    メンションで届かない相手（Discord）はここで落とすので、
    残りが空なら「主催者へ連絡」を押せなくする。
  */
  const contactTargets = React.useMemo(
    () =>
      [event.creator, ...event.participants.filter((p) => p.isOrganizer).map((p) => p.user)].filter(
        canMention
      ),
    [event.creator, event.participants]
  )
  /*
    **幹事にも出す。** 共同の幹事やグループ管理者が作成者へ連絡することがある。
    宛先から自分を外して（`buildAnypostContactUrl` と同じ規則）誰も残らない
    ときは押せなくする。押しても何も開かないので。
    プレビューは「他の人にどう見えるか」を見せる場なので自分を外さない。
  */
  const showContact = preview
    ? contactTargets.length > 0
    : contactTargets.some((t) => t.id !== viewer?.id)
  /*
    通報は**ログイン中の、幹事でない閲覧者にだけ**出す。
    未ログインでは送れない（API が拒否する）ので、押せるように見せない。
    幹事に出すと自分のイベントを通報できてしまう。

    IDが契約（cuid）に合わない対象でも出さない。シードのモックイベントが
    これに当たる。押させると、理由を書ききったあとで
    「IDの形式が不正です」に行き当たることになる。
  */
  const showReport =
    preview ||
    (event.viewer.isAuthenticated &&
      !event.viewer.isOrganizer &&
      isReportableTarget({ eventId: event.id }))

  /*
    参加者全員への連絡。**幹事に限らない** — 連絡画面のAPIは
    「主催者または参加した人」を通すので、そこに合わせる。
    参加記録さえあれば状態は問わない（キャンセル済みでも行は残る）。
    出せない相手に見せると、開いた先で断られることになる。

    **プレビューでは出ない。** あちらは「まだ参加していない人にどう見えるか」
    を描く場なので、参加者にしか無い入口を足すと姿が食い違う。
  */
  const canContactParticipants =
    event.viewer.isAuthenticated &&
    (event.viewer.isOrganizer || event.viewer.participation !== null)

  /* スマホの操作列に再掲する地図。住所のときだけ行き先がある */
  const mapHref =
    event.location && resolveLocation(event.location).kind === 'place'
      ? resolveLocation(event.location).href
      : null

  const handleContact = () => {
    const url = buildAnypostContactUrl({
      url: window.location.href,
      title: event.title,
      targets: contactTargets,
      viewer: viewer
        ? { id: viewer.id, server: viewer.server, platform: viewer.platform }
        : null,
    })
    if (!url) return
    window.open(url, '_blank', 'width=600,height=700,noopener,noreferrer')
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <DateBadge date={event.startDate} />
        <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {event.title}
        </h1>

        {/*
          幹事だけに出す編集の入口。**題名の高さに置く。**
          幹事メニューの中にも同じ行き先があるが、開いて選ぶ手数が要る。
          直しに来た人がまず探すのは題名のそばなので、そこに置く。

          **狭い画面では出さない。** 題名の横幅を削るうえ、スマホで
          編集しに来ることはまず無い。幹事メニューから行ける。
          中止したイベントは編集できない（サーバーが拒む）ので出さない。
        */}
        {isHost && !cancelled ? (
          <Button
            variant="default"
            size="icon-sm"
            className="shrink-0 max-sm:hidden"
            aria-label="編集"
            title="編集"
            asChild
          >
            <Link href={`/events/${event.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>

      {event.hashtags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.hashtags.map((tag) => (
            <Tag
              key={tag}
              href={preview ? undefined : `/events/hashtag/${encodeURIComponent(tag)}`}
            >
              #{tag}
            </Tag>
          ))}
        </div>
      ) : null}

      {/*
        中止は**題名のすぐ下で言う。** 状態は誰から見ても同じ位置に出す。
        参加する側は操作ボタンが「中止されました」になるので気づけるが、
        幹事にはボタンではなく幹事メニューが出るため、**画面のどこにも
        中止と書かれていなかった。**

        **書く中身は相手で変える。** 参加する側にとって要るのは
        「もう登録できない」ことだけ。連絡や出欠の記録が続けられるのは
        幹事の話で、参加する側には関係がない。
      */}
      {cancelled ? (
        <div className="mt-4">
          {isHost ? (
            <Notice tone="danger" title="このイベントは中止されました">
              新しい参加登録は受け付けません。参加者への連絡・出欠の記録・CSV出力は
              続けられます。
            </Notice>
          ) : (
            <Notice tone="danger" title="主催者によりイベントが中止されました">
              参加登録はできません。詳細は主催者へ問い合わせてください。
            </Notice>
          )}
        </div>
      ) : null}

      {/*
        詳細を読む前に参加を決められる人を待たせない。

        **中止のときは参加する側に出さない。** 「このイベントは中止されました」
        としか書けないボタンで、すぐ上の知らせと同じことを言うことになる。
        幹事にはここが幹事メニューなので、中止後も出す。
      */}
      {!cancelled || isHost ? (
        /* 幹事には参加者用の操作と幹事メニューが2つ並ぶ。
           **狭い画面でも1行に並べる** — 縦に積むと題名の下がボタンだけで
           埋まり、日時も場所も画面の外へ出る。狭いときは幅を半分ずつ
           分け合い、収まらないラベルは折り返す（`HOST_ACTION_WIDTH`）。
           高さが揃わなくなるので items-stretch で伸ばす */
        <div className="mt-5 flex items-stretch gap-2 sm:items-center">
          <EventAction
            eventId={event.id}
            cancelled={cancelled}
            canCancel={event.viewer.canCancel}
            restriction={event}
            state={actionState}
            selfState={selfState}
            onParticipate={onParticipate}
            onEditParticipation={onEditParticipation}
          />
        </div>
      ) : null}

      <Conditions event={event} />

      <Space />

      {/*
        情報の並び。**上下の縁にも罫線を引く**（`rule-y`）。
        間だけに引くと、最初の行がどこから始まり最後の行がどこで終わるのかが
        本文の余白に溶けて、並びとして囲われていることが伝わらない。
      */}
      <section className="rule-y">
        <EventInfoRow
          icon={<Clock className="size-4" />}
          action={
            /* プレビューでは押せない。まだ URL の無いイベントの
               .ics は作れないし、押した先で下書きが消える */
            <InfoRowAction
              icon={<CalendarPlus className="size-4" />}
              label="カレンダーに追加"
              href={`/api/v1/events/${event.id}/calendar`}
              preview={preview}
            />
          }
        >
          {formatSchedule(event)}
        </EventInfoRow>

        {/* 未設定の項目は行ごと出さない */}
        {event.location ? (
          <LocationRow location={event.location} preview={preview} />
        ) : null}

        {event.fee ? (
          <EventInfoRow icon={<Coins className="size-4" />}>{event.fee}</EventInfoRow>
        ) : null}

        {/* 誰が参加しているかはイベント情報の一部なので、同じ罫線でつなぐ */}
        <ParticipantList items={participants} optionGroups={event.optionGroups} />
      </section>

      <Space />

      {/*
        説明は**本文の幅いっぱいに使う。** 以前は読む列を `max-w-2xl` に
        絞っていたが、上の情報の並びも下の操作列も右端まで届くので、
        PCでは説明だけが途中で折り返しているように見えた
        （読み物ページの `ContentPage` と同じ判断）。
      */}
      {event.description ? (
        <section>
          <SafeMarkdown>{event.description}</SafeMarkdown>
        </section>
      ) : null}

      {/*
        説明の下の操作列。

        **参加操作をもう一度、いちばん左に置く。** 上にもあるが、説明を
        読み終えて「参加しよう」と決まるのはここ。読み切った人を頭まで
        戻らせない。同じ操作の再掲なので「primary は1画面に1つ」には
        抵触しない（docs/DESIGN_GUIDELINES.md §7）。

        並びは近いものから外側へ:
          自分の参加 → 主催者へ連絡 → シェア → 共有 → 通報
        通報だけは向きが違う（相手を止める操作）ので右端に置く。

        **大きさと文字の濃さは全部そろえる。** ここで差を付けると、
        重要度の差ではなく作りの粗さとして読まれる。色の違い（参加操作の
        primary / state）だけで主従は十分に伝わる。

        揃える先は `size="sm"` — 情報行の「カレンダーに追加」と同じ高さ。
        押させたい操作でも、この列に置くものは全部この大きさにする
        （本文の頭に単独で置く参加ボタンだけは既定の h-12 のまま）。

        **列は本文の幅いっぱいに使う。** 画面が広いときは2つの組を両端へ寄せ、
        スマホでは**どのボタンも伸ばして幅を分け合う**（`grow`）。
        左に寄せて余白を右へ流すと、画面の下半分だけ本文より内側で
        終わっているように見えた。

        伸ばすのはボタン自身で、**間隔は広げない**（`justify-between` にしない）。
        アイコンだけのボタンは幅が変わらないので、間隔で散らすと
        ボタンとボタンの間にだけ余白が空いて、並びが途切れて見える。

        **スマホでは2つの組に分けて改行する**（自然な折り返しに任せない）。
          1行目: 自分の参加 → 連絡（このイベントに関わる行動）
          2行目: シェア → 共有 → カレンダー → 地図 → 通報
                （ページを外へ出す・外のアプリへ渡す操作。いずれもアイコンのみ）
        折り返しに任せると、参加状態のラベルの長さ（「参加登録」と
        「満員のため受付を終了しました」）で境目が動き、同じ画面が
        イベントごとに違う形に崩れる。
      */}
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <EventAction
            eventId={event.id}
            cancelled={cancelled}
            canCancel={event.viewer.canCancel}
            restriction={event}
            state={actionState}
            selfState={selfState}
            size="sm"
            widthClassName="max-w-full max-sm:grow"
            onParticipate={onParticipate}
            onEditParticipation={onEditParticipation}
          />

          <ContactAction
            onContactOrganizer={showContact ? handleContact : null}
            participantsHref={canContactParticipants ? `/events/${event.id}/contact` : null}
            participantsLabel="参加者全員に連絡"
            className="max-sm:grow"
            preview={preview}
          />
        </div>

        {/* 2行目。狭い端末（320px）で溢れるくらいなら折り返させる */}
        <div className="flex flex-wrap items-center gap-2">
          <ShareBar title={event.title} disabled={preview} stretch />

          {/*
            **スマホでだけ、情報行の操作をここへ再掲する。**
            情報行の右端は本文（日時・場所）の向こう側にあって、
            狭い画面では折り返した本文の下に埋もれる。操作を探す人は
            まずこの列を見るので、そこに同じ行き先を置く。
            画面が広いときは情報行のボタンが見えているので出さない
            （同じ行き先への入口を2つ並べない）。
          */}
          <div
            className={`flex items-center gap-2 sm:hidden ${mapHref ? 'grow-[2]' : 'grow'}`}
          >
            <InfoRowAction
              icon={<CalendarPlus className="size-4" />}
              label="カレンダーに追加"
              href={`/api/v1/events/${event.id}/calendar`}
              className="grow"
              preview={preview}
            />
            {mapHref ? (
              <InfoRowAction
                icon={<MapIcon className="size-4" />}
                label="地図"
                href={mapHref}
                external
                className="grow"
                preview={preview}
              />
            ) : null}
          </div>

          {showReport ? (
            /* 文字は他と同じ濃さにする。薄くすると「押せないもの」に見え、
               hover で初めて赤くなるまで操作だと気づかれない */
            <Button
              variant="default"
              size="sm"
              className={`hover:text-destructive max-sm:w-9 max-sm:grow max-sm:px-0 ${inertClass}`}
              aria-label="通報"
              title="通報"
              onClick={onReport}
              {...inertProps}
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
            name={event.organization?.name ?? event.creator.displayName}
            src={event.organization ? null : event.creator.avatar}
          />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">主催</div>
            {preview ? (
              <span className="text-sm font-medium text-foreground">
                {event.organization?.name ?? event.creator.displayName}
              </span>
            ) : (
              /*
                **飛び先は Hosteka の中。** 以前は主催者だけ
                `https://<server>/@<username>` を直に組んでいて、X と
                Discord の主催者では開けない URL になっていた
                （`https://x.com/@alice` は Fediverse の書き方、
                `https://discord.com/@bob` はページが無い）。
                相手のSNSを開く入口は、そのプロフィールの側にある。
              */
              <Link
                href={
                  event.organization
                    ? `/orgs/${event.organization.slug}`
                    : userProfilePath(event.creator)
                }
                className="text-sm font-medium text-foreground hover:underline"
              >
                {event.organization?.name ?? event.creator.displayName}
              </Link>
            )}
          </div>
        </div>

        <dl className="mt-5 space-y-1 text-xs text-muted-foreground">
          {/* イベントIDは保存して初めて決まる。プレビューでは行ごと出さない —
              「—」を置くと、そういう値のイベントがあるように読める */}
          {preview ? null : (
            <div className="flex gap-2">
              <dt>イベントID</dt>
              <dd className="font-mono">{event.id}</dd>
            </div>
          )}
          {/* 「作成日」「最終更新日」と書かない。日付だけでなく時刻まで出すので
              「日」が余る。ここは並びの左端で、右に日時があることは見れば分かる */}
          <div className="flex gap-2">
            <dt>作成</dt>
            <dd>{formatJstDateTime(event.createdAt, STAMP_FORMAT)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>更新</dt>
            <dd>{formatJstDateTime(event.updatedAt, STAMP_FORMAT)}</dd>
          </div>
        </dl>
      </section>
    </>
  )
}

/** DTO の参加者を一覧の表示形に落とす。詳細とプレビューで同じ規則を使う */
export function toParticipantViews(
  event: EventDetailDto,
  { preview = false }: { preview?: boolean } = {}
): ParticipantView[] {
  /*
    参加者一覧には主催者も含める（王冠で示す）。
    **未定・欠席・キャンセルもそのまま渡す。** どう畳むかは一覧側の仕事で、
    ここで捨てると「欠席と答えたのに誰にも見えない」状態になる。
  */
  return event.participants.map((p) => ({
    id: p.id,
    name: p.user.displayName || p.user.username,
    handle: `@${p.user.username}@${p.user.server}`,
    // プレビューでは外す。押すと入力途中のフォームから離れてしまう
    profileHref: preview ? undefined : userProfilePath(p.user),
    avatar: p.user.avatar,
    isHost: p.isOrganizer || p.user.id === event.creator.id,
    status: p.status as ParticipantView['status'],
    comment: p.comment ?? undefined,
    options: p.options,
  }))
}
