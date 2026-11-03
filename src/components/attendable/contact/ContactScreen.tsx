'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, ExternalLink, Send, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleField } from '@/components/ui/toggle-switch'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FormSection, fieldAria } from '@/components/form/Field'
import { ChoiceCards, type Choice } from '@/components/form/ChoiceCards'
import { UnsavedChangesGuard } from '@/components/form/UnsavedChangesGuard'
import { Notice } from '@/components/common/Notice'
import { ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { isValidServerHost, normalizeServerHost } from '@/screens/auth/sign-in-platforms'

import {
  buildExternalUrl,
  destinationName,
  planPosts,
  postDestinations,
  type DestinationPlan,
} from './destinations'
import { buildDefaultBody, reachableUsers, type ContactUser } from './mentions'
import { TargetList } from './TargetList'
import {
  defaultPostMethod,
  isFediversePlatform,
  postMethodOptions,
  type ContactViewer,
  type PostMethod,
} from './post-method'
import { isWritePermissionError } from './post-errors'
import { normalizeVisibility, visibilityOptions } from './post-limits'
import { composeScheduledAt, scheduleSuggestions, validateScheduledAt } from './schedule'

/** 宛先の束。イベントは参加状態ごと、日程調整は「回答者全員」の1つだけ */
export type RecipientGroup = {
  id: string
  label: string
  users: ContactUser[]
}

export type PostInput = {
  /** 分割が要るときは複数入る */
  posts: string[]
  visibility: string
  /** 予約投稿の日時（JST の ISO 文字列）。無ければ即時 */
  scheduledFor?: string
  /** 宛先。API が数を数えるのに使う */
  recipientIds: string[]
}

/** 下書きの寿命。これより古いものは別の用件とみなす */
const DRAFT_TTL_MS = 30 * 60 * 1000

type Draft = {
  id: string
  /** 本文。宛名は入っていない（投稿先ごとに付ける） */
  message: string
  method: PostMethod
  groupIds: string[]
  savedAt: number
}

function readDraft(key: string, id: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    const draft = JSON.parse(raw) as Draft
    if (draft.id !== id) return null
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) return null
    return draft
  } catch {
    // 壊れた下書きのために画面を止めない
    return null
  }
}

const METHOD_LABEL: Record<PostMethod, string> = {
  direct: 'Hosteka から直接投稿',
  external: 'サーバーへ移動して手動で投稿',
}

/** 投稿画面を開くボタンの名前。「どこへ・何件目・何人に」 */
function externalButtonLabel(plan: DestinationPlan, index: number): string {
  const count = plan.posts[index].mentions.length
  const notes = [
    plan.posts.length > 1 ? `${index + 1}/${plan.posts.length}` : null,
    count > 0 ? `${count}人` : null,
  ].filter(Boolean)
  // ホスト名の後ろは空ける。和文の名前（投稿元が決まらないとき）は詰める
  const label = plan.server
    ? `${plan.server} へ移動して投稿`
    : `${destinationName(plan)}へ移動して投稿`
  return notes.length > 0 ? `${label}（${notes.join('・')}）` : label
}

/**
 * 宛先の束を選ぶチップ。
 *
 * **チェックボックスは使わない**（docs/DESIGN_GUIDELINES.md §5）。
 * 選択済みは色だけでなくチェックでも示す。
 */
function GroupChips({
  groups,
  selected,
  onToggle,
}: {
  groups: RecipientGroup[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div role="group" aria-label="宛先" className="flex flex-wrap gap-2">
      {groups.map((group) => {
        const on = selected.includes(group.id)
        return (
          <button
            key={group.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(group.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              on
                ? 'raised-subtle border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent'
            )}
          >
            <Check className={cn('size-4', on ? 'text-primary' : 'text-transparent')} aria-hidden />
            {group.label}
            <span className="tabular-nums">{group.users.length}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * 参加者・回答者への連絡。
 *
 * **イベントと日程調整で同じ画面を使う。** 連絡の仕組みは共通で、
 * 違うのは宛先の集め方だけ（イベントは参加状態で選ぶ、日程調整は
 * 回答者全員）。**画面の仕事は「投稿方法・宛先・本文」を1枚に収めること** —
 * 旧画面は4段のステップで、投稿方法を変えるたびに宛先が変わることが
 * 見えなかった。
 *
 * **並びは「投稿方法 → 宛先 → 本文 → 送信」。** 投稿方法で届く相手が
 * 変わる（直接投稿は X に届かない）ので、宛先より先に決めてもらう。
 *
 * 投稿方法の選び方・投稿先の割り出し・文字数・予約日時の規則は
 * 同じ階層の純関数に置いてある。
 */
export function ContactScreen({
  id,
  backHref,
  backLabel,
  heading,
  subject,
  targetUrl,
  draftKey,
  viewer,
  groups,
  defaultGroupIds,
  unreachableCount,
  unreachableNote,
  registrationDeadline,
  posting,
  onPost,
}: {
  /** 下書きの持ち主。別のイベントの下書きを拾わないため */
  id: string
  backHref: string
  backLabel: string
  heading: string
  /** 本文の見出しに使う名前（イベント名・日程調整名） */
  subject: string
  /** 本文に入れるURL */
  targetUrl: string
  draftKey: string
  viewer: ContactViewer
  groups: RecipientGroup[]
  defaultGroupIds: string[]
  /** メンションで届かない相手の数（Discord） */
  unreachableCount: number
  unreachableNote: string
  /** 予約投稿の候補を出すのに使う */
  registrationDeadline: string | null
  posting: boolean
  onPost: (input: PostInput) => Promise<{ sent: number }>
}) {
  const [method, setMethod] = React.useState<PostMethod | null>(null)
  const [groupIds, setGroupIds] = React.useState<string[]>(defaultGroupIds)
  /*
    **本文に宛名は入れない。** 宛名は投稿先ごとに形が違うので、送るときに
    付ける（`destinations.ts`）。以前は本文の先頭に書き込んでいて、宛先や
    投稿方法を変えるたびに書きかけの本文を組み直していた。
  */
  const [body, setBody] = React.useState(() =>
    buildDefaultBody({ title: subject, url: targetUrl })
  )
  const [edited, setEdited] = React.useState(false)
  const [abbreviate, setAbbreviate] = React.useState(true)
  const [visibility, setVisibility] = React.useState(() =>
    normalizeVisibility(viewer.platform, 'public')
  )
  /**
   * 投稿画面へ移動するときの投稿元サーバー。
   *
   * **自分のサーバーに決め打ちしない。** 別のサーバーにもアカウントを
   * 持っていて、そちらから連絡したい人がいる。Fediverse で入っていない人には
   * 既定にできる値が無いので、欄ごと出さず投稿画面に選ばせる。
   */
  const asksFromServer = isFediversePlatform(viewer.platform)
  const [fromServer, setFromServer] = React.useState(asksFromServer ? viewer.server : '')
  const [scheduled, setScheduled] = React.useState(false)
  const [scheduledAt, setScheduledAt] = React.useState('')
  const [sent, setSent] = React.useState<{ scheduled: boolean; count: number } | null>(null)
  /**
   * 送ってみて権限で断られた。
   *
   * **事前には分からない。** 付与された scope を保存していないので、
   * 読み取りだけのトークンでも「投稿できる」ように見える。断られたら
   * 入り直しへ案内する（書きかけは持ったまま）。
   */
  const [rejected, setRejected] = React.useState(false)

  /** 選ばれている束の人。同じ人が2つの束に入ることはない（状態は1つ） */
  const selectedUsers = React.useMemo(
    () => groups.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.users),
    [groups, groupIds]
  )

  /*
    投稿方法を決める。下書きが残っていればそちらを優先する
    （権限を上げに行って戻ってきた場合）。

    **ブラウザにしか無いもの（sessionStorage の下書き）の取り込みなので
    effect に置く。** 描画から導ける値ではない。1回だけ走らせたいので、
    `method` が決まったら以降は何もしない。
  */
  React.useEffect(() => {
    if (method !== null) return
    const draft = readDraft(draftKey, id)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMethod(draft?.method ?? defaultPostMethod(viewer))
    if (draft) {
      setBody(draft.message)
      setGroupIds(draft.groupIds)
      setEdited(true)
    }
  }, [viewer, method, draftKey, id])

  const options = postMethodOptions(viewer)
  const needsPermission = options.find((o) => o.method === method)?.needsPermission ?? false

  // URL ごと貼られることが多い。比べる相手（自分のサーバー）は小文字で持っている
  const fromHost = normalizeServerHost(fromServer).toLowerCase()
  const fromServerError =
    fromHost && !isValidServerHost(fromHost) ? '有効なホスト名を入力してください' : undefined

  /** 投稿先ごとの投稿。宛先が Fediverse と X に分かれていれば2つになる */
  const plans = React.useMemo(
    () =>
      method
        ? planPosts(
            postDestinations({ method, viewer, users: selectedUsers, fromServer: fromHost }),
            body,
            abbreviate
          )
        : [],
    [method, viewer, selectedUsers, fromHost, body, abbreviate]
  )

  /** その投稿方法で実際に届く相手。方法を変えると宛先も変わる */
  const targets = plans.flatMap((plan) => plan.users)
  const twitterCount = reachableUsers(selectedUsers, 'twitter').length
  const fediversePlan = plans.find((plan) => plan.network === 'fediverse')

  const suggestions = scheduleSuggestions(registrationDeadline)
  const scheduleError = scheduled ? validateScheduledAt(scheduledAt) : null
  const emptyMessage = !body.trim()

  const requestPermission = () => {
    const draft: Draft = { id, message: body, method: 'direct', groupIds, savedAt: Date.now() }
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      // 保存できなくても権限の取得自体は進める
    }
    const params = new URLSearchParams({
      requestWrite: 'true',
      callbackUrl: window.location.pathname,
      platform: viewer.platform.toLowerCase(),
      server: viewer.server,
    })
    /*
      権限を取り直しに行く。**このあと外部サイト（OAuth）へ出る**ので、
      クライアント遷移では戻ってきたときに下書きの復元が噛み合わない。
    */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/auth/signin?${params.toString()}`
  }

  const openExternal = (plan: DestinationPlan, text: string) => {
    window.open(
      buildExternalUrl({ destination: plan, text }),
      '_blank',
      'width=600,height=700,noopener,noreferrer'
    )
  }

  const submitDirect = async () => {
    // 直接投稿の投稿先は自分のアカウントの1つだけ
    const plan = plans[0]
    if (scheduleError || !plan) return
    try {
      const result = await onPost({
        posts: plan.posts.map((p) => p.fullText),
        visibility,
        scheduledFor: scheduled ? composeScheduledAt(scheduledAt) : undefined,
        recipientIds: plan.users.map((u) => u.id),
      })
      setSent({ scheduled, count: result.sent })
      toast.success(scheduled ? '予約投稿を設定しました' : '投稿しました')
    } catch (e) {
      if (isWritePermissionError(e)) {
        // 文言ではなく details の印で見分ける（`post-errors.ts`）
        setRejected(true)
        toast.error('投稿の権限が足りませんでした')
        return
      }
      toast.error(
        e instanceof ApiClientError ? (e.details?.[0]?.message ?? e.message) : '投稿に失敗しました'
      )
    }
  }

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
        <p className="text-lg font-bold text-foreground">
          {sent.scheduled ? '予約投稿を設定しました' : '投稿しました'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {sent.count > 1 ? `${sent.count}件に分けて送りました。` : null}
          {sent.scheduled
            ? '指定した日時に、あなたのアカウントから投稿されます。'
            : 'あなたのアカウントから投稿されました。'}
        </p>
        <Button variant="primary" className="mt-6" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    )
  }

  const choices: Choice<PostMethod>[] = options.map((option) => ({
    value: option.method,
    label: METHOD_LABEL[option.method],
    /*
      **直接投稿をすすめる。** 画面を移らずに送れて、予約もできる。
      投稿画面へ移動する道は、権限を与えたくない人と、
      直接投稿に対応していないプラットフォームのために残してある。
    */
    badge: option.method === 'direct' ? 'おすすめ' : undefined,
    description:
      option.method === 'direct'
        ? 'あなたのアカウントから、この画面のまま投稿します。予約もできます。'
        : 'あなたのアカウントから、あなたの所属サーバーに移動して投稿します。',
    note: option.needsPermission ? '投稿の権限が必要です（再ログインが必要です）' : undefined,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* 書きかけのまま離れようとしたら引き止める */}
      <UnsavedChangesGuard when={edited && !sent} />

      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {backLabel}
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {heading}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subject}</p>

      <div className="mt-6 space-y-8">
        <FormSection title="投稿方法">
          {method ? (
            <ChoiceCards
              label="投稿方法"
              value={method}
              onChange={setMethod}
              choices={choices}
            />
          ) : null}

          {needsPermission || rejected ? (
            <div
              className={cn(
                'rounded-lg border p-4',
                rejected ? 'border-destructive bg-destructive/10' : 'border-border bg-card'
              )}
            >
              {/*
                **「書きかけは残る」と言うのは断られたときだけ。** 権限が無いと
                分かっているうちは本文の欄を出していないので、残るものが無い。
              */}
              <p className="text-sm text-foreground">
                {rejected
                  ? `${viewer.server} が「その権限では投稿できない」と答えました。投稿権限を付与して再ログインしてください。書きかけの内容は再ログインしても残ります。`
                  : 'Hosteka から直接投稿するには、投稿の権限が必要です。'}
              </p>
              <Button variant="primary" className="mt-3" onClick={requestPermission}>
                投稿権限を付与して再ログイン
              </Button>
            </div>
          ) : null}
        </FormSection>

        <FormSection title="宛先">
          {/*
            **束が1つでも選ばせる。** 出さないと「誰に送るのか」を決める場所が
            画面から消え、参加予定の人しかいないイベントでは宛先が
            勝手に決まったように見える。
          */}
          {groups.length > 0 ? (
            <GroupChips
              groups={groups}
              selected={groupIds}
              onToggle={(gid) =>
                setGroupIds((prev) =>
                  prev.includes(gid) ? prev.filter((v) => v !== gid) : [...prev, gid]
                )
              }
            />
          ) : null}

          <div className="rounded-lg border border-border bg-[var(--surface-subtle)] p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="size-4 text-muted-foreground" />
              {targets.length > 0
                ? `この投稿で届く相手 ${targets.length}人`
                : 'この投稿で届く相手はいません'}
            </p>

            {targets.length > 0 ? <TargetList users={targets} /> : null}
          </div>

          {/*
            **1つの投稿は X と Fediverse の両方には届かない。**
            直接投稿は X の人を取りこぼすので、届く道を言う。投稿画面へ
            移動するときは投稿先ごとにボタンが出るので、押し忘れだけを言う。
          */}
          {method === 'direct' && twitterCount > 0 ? (
            <Notice title={`X の${twitterCount}人には直接投稿では届きません`}>
              「{METHOD_LABEL.external}」を選ぶと、X の人あての投稿も用意します。
            </Notice>
          ) : null}
          {method === 'external' && plans.length > 1 ? (
            <Notice title="Fediverse と X では投稿が分かれます">
              1つの投稿は両方には届きません。投稿先ごとのボタンから、それぞれ投稿してください。
            </Notice>
          ) : null}

          {unreachableCount > 0 ? (
            <Notice title={`Discord の${unreachableCount}人には届きません`}>
              {unreachableNote}
            </Notice>
          ) : null}
        </FormSection>

        {!needsPermission ? (
          <>
            <FormSection title="本文">
              <Field
                label="メッセージ"
                htmlFor="message"
                /*
                  宛名を自分で書くと、同じ相手を2回呼ぶ投稿になる。
                  欄を見ても分からないので、ここだけは言う。
                */
                description={
                  targets.length > 0
                    ? 'メンションは投稿時に自動で先頭に付与されます。'
                    : undefined
                }
                hint={plans.map((plan) => (
                  <span
                    key={plan.network}
                    className={cn('block', plan.length > plan.limit && 'text-destructive')}
                  >
                    {plans.length > 1 ? `${destinationName(plan)}: ` : null}
                    {plan.length} / {plan.limit}
                    {plan.posts.length > 1 ? `（${plan.posts.length}件に分けて送ります）` : null}
                  </span>
                ))}
              >
                <Textarea
                  id="message"
                  rows={8}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value)
                    setEdited(true)
                  }}
                  placeholder="相手へのメッセージ"
                />
              </Field>

              {/*
                縮める基準は投稿元のサーバー。X にはサーバーの概念が無く、
                投稿元が決まっていなければ「同じサーバー」も決まらない。
              */}
              {fediversePlan?.server ? (
                <ToggleField
                  label="同じサーバーの相手は @名前 だけにする"
                  description="メンションが短くなり、分割せずに1件で送れることが多くなります"
                  checked={abbreviate}
                  onCheckedChange={setAbbreviate}
                />
              ) : null}

              {/* 投稿画面へ移動するときは、分けた数だけボタンが出るのでそちらに任せる */}
              {method === 'direct' && plans[0] && plans[0].posts.length > 1 ? (
                <Notice title={`${plans[0].posts.length}件に分けて送ります`}>
                  宛先が多く、1件に収まりません。分けた本文は下の順番どおりに投稿されます。
                  <ol className="mt-2 space-y-1">
                    {plans[0].posts.map((p, i) => (
                      <li key={i} className="text-xs">
                        {i + 1}件目: {p.characterCount} 文字（宛先 {p.mentions.length}人）
                      </li>
                    ))}
                  </ol>
                </Notice>
              ) : null}
            </FormSection>

            <FormSection title="送信">
              {/*
                **選ばせるのは直接投稿のときだけ。** 投稿画面へ移動するときは
                パブリックで渡す — 移動先の投稿画面で変えられるので、
                ここで先に聞いても二度手間になる。
              */}
              {method === 'direct' ? (
                <Field label="公開範囲" htmlFor="visibility">
                  <Select value={visibility} onValueChange={setVisibility}>
                    <SelectTrigger id="visibility" className="w-full sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibilityOptions(viewer.platform).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {method === 'direct' ? (
                <>
                  {/*
                    予約は Mastodon だけ。API が他を通さない。

                    **オン／オフではなく二択で出す。** 「予約」のトグルだと、
                    オフのときに何が起きるか（すぐ投稿される）が書かれていない。
                  */}
                  {viewer.platform.toLowerCase() === 'mastodon' ? (
                    /*
                      **div で行を取る。** セグメントもボタンも inline なので、
                      じかに並べると広い画面で同じ行に続いてしまう。
                    */
                    <div>
                      <SegmentedControl
                        aria-label="投稿するタイミング"
                        value={scheduled ? 'scheduled' : 'now'}
                        onValueChange={(v) => setScheduled(v === 'scheduled')}
                        options={[
                          { value: 'now', label: 'いますぐ投稿' },
                          { value: 'scheduled', label: '予約投稿' },
                        ]}
                        className="w-full sm:w-auto"
                      />
                    </div>
                  ) : null}

                  {scheduled ? (
                    <Field
                      label="送る日時"
                      htmlFor="scheduledAt"
                      error={scheduledAt ? (scheduleError ?? undefined) : undefined}
                    >
                      <div className="space-y-2">
                        <Input
                          id="scheduledAt"
                          type="datetime-local"
                          className="w-auto"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                        />
                        {suggestions.map((s) => (
                          <Button
                            key={s.value}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-primary"
                            onClick={() => setScheduledAt(s.value)}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>
                    </Field>
                  ) : null}

                  <Button
                    variant="primary"
                    className="w-full sm:w-auto sm:min-w-56"
                    disabled={emptyMessage || posting || Boolean(scheduleError)}
                    onClick={submitDirect}
                  >
                    <Send className="size-5" />
                    {posting
                      ? '送信中…'
                      : scheduled
                        ? 'この日時に送る'
                        : plans[0] && plans[0].posts.length > 1
                          ? `${plans[0].posts.length}件を投稿する`
                          : '投稿する'}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {asksFromServer && fediversePlan ? (
                    <Field label="投稿元サーバー" htmlFor="fromServer" error={fromServerError}>
                      <Input
                        {...fieldAria('fromServer', fromServerError)}
                        className="w-full sm:w-80"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={fromServer}
                        onChange={(e) => setFromServer(e.target.value)}
                        placeholder={viewer.server}
                      />
                    </Field>
                  ) : null}

                  <p className="text-sm text-muted-foreground">
                    外部サービスの{' '}
                    <a
                      href="https://anypost.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      anypost.dev
                    </a>{' '}
                    を経由して、指定のサーバーの投稿画面に移動します（自動では投稿されません）。
                  </p>

                  {/*
                    投稿先ごと、分けた投稿ごとに1つずつ。**全部 primary にする** —
                    どれも押さないと届かない相手がいるので、主従が無い。
                  */}
                  <div className="flex flex-col items-stretch gap-2 sm:items-start">
                    {plans.flatMap((plan) =>
                      plan.posts.map((post, i) => (
                        <Button
                          key={`${plan.network}-${i}`}
                          variant="primary"
                          className="h-auto min-h-11 w-full whitespace-normal sm:w-auto sm:min-w-72"
                          disabled={
                            emptyMessage ||
                            (plan.network === 'fediverse' && Boolean(fromServerError))
                          }
                          onClick={() => openExternal(plan, post.fullText)}
                        >
                          <ExternalLink className="size-5" />
                          {externalButtonLabel(plan, i)}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {emptyMessage ? (
                <p className="text-sm text-muted-foreground">本文を入力すると送れます。</p>
              ) : null}
            </FormSection>
          </>
        ) : null}
      </div>
    </div>
  )
}
