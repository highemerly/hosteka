'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleField } from '@/components/ui/toggle-switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FormSection, fieldAria } from '@/components/form/Field'
import { MarkdownEditor } from '@/components/form/MarkdownEditor'
import { MarkdownHint } from '@/components/form/MarkdownHint'
import { UnsavedChangesGuard } from '@/components/form/UnsavedChangesGuard'
import {
  DiscordIcon,
  MastodonIcon,
  MisskeyIcon,
  PleromaIcon,
  XIcon,
} from '@/components/icons/social'
import SafeMarkdown from '@/components/SafeMarkdown'
import { EventPolicyLink } from '@/components/legal/EventPolicyNotice'
import { Notice } from '@/components/common/Notice'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { DateOptionsField } from '@/components/attendable/fields/DateOptionsField'
import { dateOptionKey } from '@/components/attendable/fields/date-option'
import { ServerRestrictionField } from '@/components/attendable/fields/ServerRestrictionField'
import { useViewer } from '@/hooks/useViewer'
import { ApiClientError } from '@/lib/api/client'
import { canEditPreEventTerms } from '@/lib/event-terms'
import {
  useCreatePreEvent,
  usePreEvent,
  useUpdatePreEvent,
} from '@/lib/api/queries/pre-events'
import { useMyOrgs } from '@/lib/api/queries/orgs'
import { preEventFormSchema, type PreEventFormValues } from '@/schemas/pre-event'
import { HASHTAG_MAX } from '@/schemas/event'
import { COMMON_HASHTAGS, TagsInput } from '@/components/attendable/fields/TagsInput'
import { VALIDATION_LIMITS } from '@/schemas/limits'

import {
  defaultPlatforms,
  isCustomizedPlatforms,
  LOCKED_PLATFORM_NOTE,
  LOCKED_PLATFORM_NOTE_ALONE,
  viewerPlatformField,
  type PlatformDefaults,
} from '../events/default-platforms'
import { flattenDateOptionErrors } from './date-option-errors'
import { EMPTY_PRE_EVENT_FORM, toPreEventFormValues } from './pre-event-form-values'
import { toDateOptionDraft, toPreEventPayload } from './pre-event-payload'
import { LockedOrganizationField } from '@/components/attendable/fields/LockedOrganizationField'

/**
 * エラーのまとめに出す項目名。
 * **スキーマのキーと画面の見出しを結ぶのはここだけ。** 各所で書くと、
 * 見出しを変えたときにエラーだけ古い言い方で残る。
 */
const FIELD_LABELS: { name: string; label: string }[] = [
  { name: 'title', label: 'タイトル' },
  { name: 'dateOptions', label: '候補日' },
  { name: 'location', label: '場所' },
  { name: 'fee', label: '参加費' },
  { name: 'description', label: '詳細説明文' },
  { name: 'hashtags', label: 'ハッシュタグ' },
  { name: 'registrationDeadlineDate', label: '回答締切' },
  { name: 'terms', label: '参加規約' },
  { name: 'isAllowedForFediverse', label: '回答に利用できるプラットフォーム' },
]

/** その欄へ飛ぶ。畳んだ区画の中にあると見つからないので、開いてから探す */
function focusField(name?: string) {
  if (typeof document === 'undefined' || !name) return
  const el = document.getElementById(name)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  ;(el as HTMLElement).focus({ preventScroll: true })
}

/**
 * Markdown 欄のプレースホルダー。書き方の見本にしてある
 * （`EventFormScreen` と同じ考え方）。
 */
const DESCRIPTION_PLACEHOLDER = `### 何をする会か
- 今年の忘年会です
- 2時間ほどを予定

### 決め方
- ○の多い日にします
- 決まったら改めて連絡します`

const TERMS_PLACEHOLDER = `### キャンセルについて
- 3日前まで無料
- 前日以降は参加費の50%`

/**
 * プラットフォームのトグルに付ける、ロゴ付きのラベル。
 * イベント側（`EventFormScreen`）と同じ表し方に揃える。
 */
function PlatformLabel({
  icons,
  children,
}: {
  icons: React.ComponentType<{ className?: string }>[]
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {icons.map((Icon, i) => (
          <Icon key={i} className="size-4" />
        ))}
      </span>
      {children}
    </span>
  )
}



/**
 * 日程調整の作成・編集。
 *
 * **イベントのフォーム（`EventFormScreen`）と同じ組み立て。** 1枚に並べ、
 * 見出しで区切る。必須はタイトルと候補日だけ。
 *
 * イベントと違うのは候補日（あちらは1日、こちらは候補が複数）と、
 * 日程が決まったあとの自動参加登録。**プレビューは無い** — 日程調整で
 * 見せたいのは「候補日がどう並ぶか」で、それは候補日の欄そのものが
 * 見せている。
 */
export default function PreEventFormScreen({ preEventId }: { preEventId?: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const editing = Boolean(preEventId)

  const {
    data: existing,
    isPending: loading,
    error: loadError,
  } = usePreEvent(preEventId ?? '', { enabled: editing })
  // 未ログインなら 401 になるだけなので、認証済みのときだけ引く
  const { viewer } = useViewer()
  const { data: orgs = [], isPending: orgsLoading } = useMyOrgs({ enabled: Boolean(viewer) })
  const create = useCreatePreEvent()
  const update = useUpdatePreEvent(preEventId ?? '')

  const form = useForm<PreEventFormValues>({
    resolver: standardSchemaResolver(preEventFormSchema),
    defaultValues: EMPTY_PRE_EVENT_FORM,
    // 打っている途中は叱らず、離れたら知らせる（EventFormScreen と同じ）
    mode: 'onTouched',
    reValidateMode: 'onChange',
  })
  const { register, control, handleSubmit, reset, setValue, formState } = form
  const errors = formState.errors

  // 編集時は取得できてから流し込む。**写し取りは純関数に置く**
  // （画面の中に書くと、抜けても正常に見えるしテストからも触れない）
  React.useEffect(() => {
    if (!existing) return
    reset(toPreEventFormValues(existing))
  }, [existing, reset])

  /*
    回答できるプラットフォームの既定を、主催者自身のものに合わせる。
    **`EMPTY` に書けない**（閲覧者は最初の描画ではまだ null）し、
    編集時は何もしない — 詳しい理由は `EventFormScreen` の同じ箇所に書いた。
  */
  const platformDefaultApplied = React.useRef(false)
  React.useEffect(() => {
    if (editing || !viewer || platformDefaultApplied.current) return
    platformDefaultApplied.current = true

    const defaults = defaultPlatforms(viewer)
    for (const [name, value] of Object.entries(defaults)) {
      setValue(name as keyof typeof defaults, value)
    }
  }, [editing, viewer, setValue])

  /**
   * 回答が付いている候補（`dateOptionKey` → 回答数）。
   *
   * **日付ではなく候補ごとに数える。** 同じ日に複数の枠を立てられるので、
   * 日付でまとめると、回答の無い枠まで編集できなくなる。
   *
   * **○△×のすべてを数える。** ×も回答なので、消えれば主催者は
   * 「その日は駄目だと答えた人がいた」ことを失う。
   */
  const answeredCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const option of existing?.dateOptions ?? []) {
      const total =
        option.counts.available + option.counts.maybe + option.counts.unavailable
      if (total > 0) counts[dateOptionKey(toDateOptionDraft(option))] = total
    }
    return counts
  }, [existing])

  const dateOptionErrors = flattenDateOptionErrors(errors)

  const fediverse = useWatch({ control, name: 'isAllowedForFediverse' })
  const discord = useWatch({ control, name: 'isAllowedForDiscord' })
  const twitter = useWatch({ control, name: 'isAllowedForTwitter' })
  const title = useWatch({ control, name: 'title' }) ?? ''
  const description = useWatch({ control, name: 'description' }) ?? ''
  const hashtags = useWatch({ control, name: 'hashtags' }) ?? []
  const terms = useWatch({ control, name: 'terms' }) ?? ''

  /*
    参加規約を変えられるか。**回答した人が1人でもいれば変えられない**
    （規則は `canEditPreEventTerms`。サーバーの PUT も同じものを見る）。
    作成中は当然ながら誰もいないので、常に書ける。
    イベント側（`EventFormScreen`）と同じ組み立て。
  */
  const termsLocked = Boolean(existing && !canEditPreEventTerms(existing.respondentCount))

  /*
    参加規約の欄を出しているか。**保存する値ではない。**
    多くの日程調整に規約は無いので、既定ではボタンだけを置く
    （イベント側の `withTerms` と同じ）。
  */
  const [withTerms, setWithTerms] = React.useState(false)
  // 読み込んだら合わせる。**effect にしない**（`byOrg` と同じ形）
  const [shownFor, setShownFor] = React.useState<typeof existing>(undefined)
  if (existing && existing !== shownFor) {
    setShownFor(existing)
    setWithTerms(Boolean(existing.terms))
  }

  /*
    参加規約を消す。**書いたものを捨てるので必ず確かめる。**
    とくに回答した人がいるときは足し直せない（サーバーが拒む）ので、
    取り消せない操作だと先に言う。何も書いていないうちは黙って畳む。
  */
  const removeTerms = async () => {
    if (terms) {
      const ok = await confirm({
        title: '参加規約を削除しますか？',
        description: termsLocked
          ? '回答した人がいるため、削除したあとは設定し直せません。'
          : undefined,
        destructive: true,
      })
      if (!ok) return
    }
    setValue('terms', '', { shouldDirty: true })
    setWithTerms(false)
  }

  /*
    プラットフォームを既定から変えるか。**保存する値ではない。**
    閉じたら既定に戻し、編集で開いたときは既定から外れていれば開けておく
    （イベント側の `customPlatforms` と同じ）。
  */
  const [customPlatforms, setCustomPlatforms] = React.useState(false)
  const [platformsFor, setPlatformsFor] = React.useState<[typeof existing, typeof viewer]>()
  if (existing && (existing !== platformsFor?.[0] || viewer !== platformsFor[1])) {
    setPlatformsFor([existing, viewer])
    setCustomPlatforms(isCustomizedPlatforms(toPreEventFormValues(existing), viewer))
  }

  const toggleCustomPlatforms = (on: boolean) => {
    setCustomPlatforms(on)
    if (on) return
    for (const [name, value] of Object.entries(defaultPlatforms(viewer))) {
      setValue(name as keyof PlatformDefaults, value, { shouldDirty: true })
    }
    setValue('allowedFediverseServers', [], { shouldDirty: true })
  }

  /*
    回答条件から「高度な設定」へ飛ばすための合図。**押した回数を渡す** —
    真偽値だと、一度開いたあと自分で畳み直した人がもう一度押しても
    値が変わらず、開かなくなる（`FormSection` の `openKey`）。
  */
  const [advancedOpenKey, setAdvancedOpenKey] = React.useState(0)
  const goToPlatforms = () => setAdvancedOpenKey((k) => k + 1)

  /*
    **開いたあとに動かす。** 押したその場で測ると、まだ畳んでいる高さで
    位置が決まる。あの節はページの末尾にあるので文書の下端で止まり、
    そのあと中身が開いて背が伸びてもスクロール位置は戻らない。
  */
  React.useEffect(() => {
    if (advancedOpenKey === 0) return
    document.getElementById('advanced')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [advancedOpenKey])

  /*
    自分のプラットフォームは外せない。閉じると自分の日程調整に自分が
    回答できなくなる。イベント側（`EventFormScreen`）と同じ規則。
    **「入れる」のではなく「外せなくする」だけ**にしてある。
  */
  const ownPlatformField = viewerPlatformField(viewer)
  const platformValues = {
    isAllowedForFediverse: fediverse,
    isAllowedForDiscord: discord,
    isAllowedForTwitter: twitter,
  }
  const lockedPlatform =
    ownPlatformField && platformValues[ownPlatformField] ? ownPlatformField : null

  // 締切の消しボタンは、入っているときだけ出す
  const deadlineDate = useWatch({ control, name: 'registrationDeadlineDate' })
  const deadlineTime = useWatch({ control, name: 'registrationDeadlineTime' })

  /** グループ名義を選んでいるか。選んでいれば、その場で注意を出す */
  const organizationId = useWatch({ control, name: 'organizationId' })
  const isPublic = useWatch({ control, name: 'isPublic' })
  const isHighlighted = useWatch({ control, name: 'isHighlighted' })
  const selectedOrg = orgs.find((o) => o.id === organizationId) ?? null

  /*
    グループ名義にするかどうか。**値からは決められない** — 自分名義は
    空文字なので、「まだ選んでいない」と同じ値になる（イベント側と同じ）。
  */
  const [byOrg, setByOrg] = React.useState(Boolean(organizationId))
  const [lastOrgId, setLastOrgId] = React.useState(organizationId)
  if (organizationId !== lastOrgId) {
    setLastOrgId(organizationId)
    if (organizationId) setByOrg(true)
  }
  const pending = create.isPending || update.isPending

  /*
    送信できなかったとき、何が足りないのかをまとめて出す。
    赤い文字が画面のどこかに散っているだけだと、長いフォームでは
    見つけられない。項目名を押すとその欄へ飛ぶ。
  */
  const [invalidFields, setInvalidFields] = React.useState<
    { name: string; label: string; message: string }[]
  >([])

  /*
    **`handleSubmit` が渡してくるエラーを使う。** 描画時に閉じ込めた
    `errors` は、送信で走った検証の結果より1つ前のことがある。
  */
  const onInvalid = (submitErrors: typeof errors) => {
    const found = FIELD_LABELS.flatMap(({ name, label }) => {
      // 候補日は配列なので `.message` を持たないことがある。平坦化した側から取る
      const message =
        name === 'dateOptions'
          ? flattenDateOptionErrors(submitErrors).message
          : (submitErrors as Record<string, { message?: string } | undefined>)[name]?.message
      return message ? [{ name, label, message }] : []
    })
    setInvalidFields(found)
    focusField(found[0]?.name)
  }

  /*
    保存できたら見張りを解く。**解かないと、保存直後の遷移を
    自分で引き止めてしまう** — フォームは dirty のままなので。
  */
  const [saved, setSaved] = React.useState(false)

  const onSubmit = handleSubmit(async (values) => {
    setInvalidFields([])
    const payload = toPreEventPayload(preEventFormSchema.parse(values))
    try {
      if (editing) {
        await update.mutateAsync(payload)
        setSaved(true)
        toast.success('日程調整を更新しました')
        router.push(`/pre-events/${preEventId}`)
      } else {
        const created = await create.mutateAsync(payload)
        setSaved(true)
        toast.success('日程調整を作成しました')
        router.push(`/pre-events/${created.id}`)
      }
    } catch (e) {
      toast.error(
        e instanceof ApiClientError
          ? (e.details?.[0]?.message ?? e.message)
          : '保存に失敗しました'
      )
    }
  }, onInvalid)

  if (editing && loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  if (editing && loadError) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {loadError instanceof ApiClientError && loadError.status === 403
            ? 'この日程調整を編集する権限がありません。'
            : '日程調整を読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const backHref = editing ? `/pre-events/${preEventId}` : '/pre-events'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* 書きかけを持ったまま離れようとしたら引き止める */}
      <UnsavedChangesGuard when={formState.isDirty && !saved} />

      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {editing ? '日程調整に戻る' : '日程調整を探す'}
      </Link>

      {/* 日程を聞く段階でも、最後にはイベントになる。イベント作成と同じ札 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {editing ? '日程調整を編集' : '日程調整を作成'}
        </h1>
        {!editing ? <EventPolicyLink /> : null}
      </div>

      {/*
        **どこまで埋めれば作れるのかを先に言う**（イベント側と同じ）。
        区画が並んでいると、全部に答えないと作れないように見える。
        欄ごとに「任意」と書くのはやめてあるので、言う場所はここになる。

        **編集では出さない。** すでに埋まっているものを前にして
        「どれが必須か」を読む場面ではない。
      */}
      {!editing ? (
        <p className="mt-2 text-sm text-muted-foreground">
          必須はタイトルと候補日だけです。
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-8">
        <FormSection title="基本情報">
          <Field
            label="タイトル"
            htmlFor="title"
            required
            error={errors.title?.message}
            hint={`${title.length} / ${VALIDATION_LIMITS.EVENT_TITLE}`}
          >
            <Input
              {...register('title')}
              {...fieldAria('title', errors.title?.message)}
              placeholder="忘年会の日程を決めます"
            />
          </Field>

          <Field
            label="候補日"
            htmlFor="dateOptions"
            required
            error={dateOptionErrors.message}
          >
            {/* id は「エラーのまとめ」から飛ぶ先。入力欄が複数あるので枠に付ける */}
            <div id="dateOptions" tabIndex={-1}>
              <Controller
                control={control}
                name="dateOptions"
                render={({ field }) => (
                  <DateOptionsField
                    options={field.value}
                    onChange={field.onChange}
                    answeredCounts={answeredCounts}
                    rowErrors={dateOptionErrors.rows}
                  />
                )}
              />
            </div>
          </Field>

          <Field
            label="場所"
            htmlFor="location"
            error={errors.location?.message}
            description="住所を指定するとGoogle Mapへのリンクに、URLを指定するとそのままのリンクになります。"
          >
            <Input
              {...register('location')}
              {...fieldAria('location', errors.location?.message)}
              placeholder="東京都千代田区千代田1-1　または　https://discord.gg/AbCdEfG"
            />
          </Field>

          <Field label="参加費" htmlFor="fee" error={errors.fee?.message}>
            <Input
              {...register('fee')}
              {...fieldAria('fee', errors.fee?.message)}
              placeholder="3,000円（学生 1,500円）"
            />
          </Field>
        </FormSection>

        <FormSection title="説明">
          <Field
            label="詳細説明文"
            htmlFor="description"
            aside={<MarkdownHint />}
            error={errors.description?.message}
            hint={`${description.length} / ${VALIDATION_LIMITS.DESCRIPTION}`}
          >
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <MarkdownEditor
                  id="description"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  invalid={Boolean(errors.description)}
                  placeholder={DESCRIPTION_PLACEHOLDER}
                />
              )}
            />
          </Field>

          <Field
            label="ハッシュタグ"
            htmlFor="hashtags"
            error={errors.hashtags?.message}
            hint={`${hashtags.length} / ${HASHTAG_MAX}`}
          >
            <Controller
              control={control}
              name="hashtags"
              render={({ field }) => (
                <TagsInput
                  id="hashtags"
                  value={field.value}
                  onChange={field.onChange}
                  max={HASHTAG_MAX}
                  suggestions={COMMON_HASHTAGS}
                />
              )}
            />
          </Field>
        </FormSection>

        {/*
          **回答の条件は1つの区画にまとめる。** 締切・自動登録と参加規約は、
          どれも「誰がどう答えるか」を決める同じ話。**畳めるようにしない** —
          締切も規約も無い日程調整が既定の姿に見えてしまう
          （イベント側の「参加条件」と同じ）。
        */}
        <FormSection title="回答条件">
          <Field
            label="回答締切"
            htmlFor="registrationDeadlineDate"
            error={errors.registrationDeadlineDate?.message}
            description="設定すると、期限以降は新たに回答したり変更したりできなくなります。いちばん早い候補日より後には設定できません。"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-auto"
                {...register('registrationDeadlineDate')}
                {...fieldAria(
                  'registrationDeadlineDate',
                  errors.registrationDeadlineDate?.message
                )}
              />
              <Input
                type="time"
                className="w-auto"
                {...register('registrationDeadlineTime')}
                aria-label="締切時刻"
              />
              {/* ブラウザの日付欄は一度入れた値を自力で空にできない
                  （イベント側と同じ。`EventFormScreen` の説明を参照） */}
              {deadlineDate || deadlineTime ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="回答締切を消す"
                  title="回答締切を消す"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setValue('registrationDeadlineDate', '', { shouldDirty: true })
                    setValue('registrationDeadlineTime', '', { shouldDirty: true })
                  }}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </Field>

          <Controller
            control={control}
            name="allowAutoRegistration"
            render={({ field }) => (
              <ToggleField
                label="日程が決まったら自動で参加登録する"
                description="回答する人が選べるようになります。○を付けた日に決まった場合だけ登録されます。"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />

          {/*
            参加規約。**既定では欄を出さない**（イベント側と同じ）。
            多くの日程調整には無いのに、6行のエディタが常に開いていると
            「書かないといけないもの」に見える。

            `htmlFor` はどちらの姿でも `terms` を指す。畳んでいるときは
            ボタンがその id を持つので、エラーのまとめから飛んで来ても
            行き先がある（`focusField`）。
          */}
          <Field
            label="参加規約"
            htmlFor="terms"
            // 書き方の解説は、書ける欄が出ているときだけ
            aside={withTerms && !termsLocked ? <MarkdownHint /> : undefined}
            error={errors.terms?.message}
            hint={
              withTerms && !termsLocked
                ? `${terms.length} / ${VALIDATION_LIMITS.TERMS}`
                : undefined
            }
            description={
              termsLocked
                ? withTerms
                  ? '回答した人がいるので、内容は変更できません。削除はできます。'
                  : '回答した人がいるので設定できません。'
                : '設定すると、回答の前に同意を求めます。回答した人ができたあとは、内容を変更できません。'
            }
          >
            {!withTerms ? (
              /*
                規約なしで回答が始まった日程調整には**後から足せない** —
                同意していない内容に同意したことになる人ができる。
                そのときはボタンを出さず、状態だけを置く。
              */
              termsLocked ? (
                <p className="text-sm text-muted-foreground">設定していません</p>
              ) : (
                <Button
                  type="button"
                  id="terms"
                  variant="default"
                  onClick={() => setWithTerms(true)}
                >
                  <Plus className="size-5" />
                  参加規約を設定する
                </Button>
              )
            ) : (
              <div className="space-y-2">
                {termsLocked ? (
                  /*
                    サーバーが同じ条件で書き込みを拒む（pre-events/[id] の PUT）。
                    編集できるように見せると、書き直したうえで保存に失敗する。
                  */
                  <div
                    id="terms"
                    className="rounded-lg border border-border bg-[var(--surface-subtle)] px-3.5 py-3"
                  >
                    <SafeMarkdown>{existing?.terms ?? ''}</SafeMarkdown>
                  </div>
                ) : (
                  <Controller
                    control={control}
                    name="terms"
                    render={({ field }) => (
                      <MarkdownEditor
                        id="terms"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        rows={6}
                        invalid={Boolean(errors.terms)}
                        placeholder={TERMS_PLACEHOLDER}
                      />
                    )}
                  />
                )}

                {/* **回答した人がいても消せる。** 主催者が自分の求めを
                    取り下げるだけで、不利になる回答者はいない */}
                <Button type="button" variant="destructive" size="sm" onClick={removeTerms}>
                  <X className="size-4" />
                  参加規約を削除する
                </Button>
              </div>
            )}
          </Field>

          {/*
            **行き先だけを置く。** 以前はこの節の隣にあった設定なので、
            探しに来た人が迷わないようにする。今の設定まで写さない —
            触れない値が2箇所に出ると、どちらが効いているのかを読む
            手がかりが無くなる（イベント側と同じ）。
          */}
          <div className="space-y-2">
            <span className="block text-base font-medium text-foreground">
              回答に利用できるプラットフォーム
            </span>
            <p className="text-sm text-muted-foreground">
              <button
                type="button"
                onClick={goToPlatforms}
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                高度な設定
              </button>
              に移動しました
            </p>
          </div>
        </FormSection>

        <FormSection
          id="advanced"
          title="高度な設定"
          collapsible
          openKey={advancedOpenKey}
          hasValue={
            Boolean(organizationId) ||
            !isPublic ||
            !isHighlighted ||
            customPlatforms
          }
        >
          {/*
            **まず「グループ名義にするか」を聞く。** 自分の名前とグループ名が
            1つの Select に並んでいると、グループを持っていない人にも開いて
            確かめさせることになる（イベント側と同じ作り）。
          */}
          {existing && !existing.viewer.canChangeOrganization ? (
            <LockedOrganizationField organization={existing.organization} />
          ) : (
            <Controller
              control={control}
              name="organizationId"
              render={({ field }) => (
                <div className="space-y-3">
                  <ToggleField
                    label="グループ名義で開催する"
                    checked={byOrg}
                    onCheckedChange={(v) => {
                      setByOrg(v)
                      // 開いたら先頭のグループを入れる。空のまま保存すると名義は自分に戻る
                      field.onChange(v ? (orgs[0]?.id ?? '') : '')
                    }}
                  />

                  {/* トグルで開いた中身は面で囲む（プラットフォームと同じ） */}
                  {byOrg && !orgsLoading ? (
                    <div className="space-y-3 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
                      {orgs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          管理しているグループがありません。
                          <Link href="/orgs/create" className="ml-1 text-primary hover:underline">
                            グループを作る
                          </Link>
                        </p>
                      ) : (
                        /* 名前は左、選ぶものは右（イベント側と同じ） */
                        <div className="flex items-center justify-between gap-3">
                          <label
                            htmlFor="organizationId"
                            className="shrink-0 px-1 text-sm font-medium text-foreground"
                          >
                            グループ名
                          </label>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              id="organizationId"
                              className="w-auto min-w-0 flex-1 sm:w-80 sm:flex-none"
                            >
                              {/* 読み込み中に開かれたときだけ、値が空のまま出る */}
                              <SelectValue placeholder="グループを選ぶ" />
                            </SelectTrigger>
                            <SelectContent>
                              {orgs.map((org) => (
                                <SelectItem key={org.id} value={org.id}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* グループ名義にすると編集できる人が増える。選んだその場で言う */}
                      {selectedOrg ? (
                        <Notice
                          title={`主催者があなたではなく「${selectedOrg.name}」に変更されます`}
                        >
                          日程調整ページでの表示や連絡先もグループ名義となります。また、
                          <strong className="font-semibold">
                            グループのメンバーは誰でもこの日程調整を編集できます。
                          </strong>
                        </Notice>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            />
          )}
          {/*
            **既定がオフになる向きで書く。** 「公開する」「一覧に載せる」は
            既定がオンで、この区画では「何も触っていない＝全部オン」が並ぶ。
            名前のほうを裏返して、オンにしたものだけが狭める設定になる。
            **持っている値（`isPublic` / `isHighlighted`）は裏返さない。**
          */}
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <ToggleField
                label="ログインユーザーのみが閲覧できるようにする"
                description="設定すると、ログインしていない人は日程調整のページを開けなくなります。"
                checked={!field.value}
                onCheckedChange={(v) => field.onChange(!v)}
              />
            )}
          />
          <Controller
            control={control}
            name="isHighlighted"
            render={({ field }) => (
              <ToggleField
                label="Hosteka の日程調整一覧に載せない"
                /* 一覧と検索から外れるだけでページは開ける。非公開と
                   取り違えさせない。**誰が開けるかは上のトグル次第** */
                description={
                  isPublic
                    ? '設定すると、日程調整の一覧や検索に表示されなくなり、URLを知っている人だけが閲覧できるようになります。'
                    : '設定すると、日程調整の一覧や検索に表示されなくなります。'
                }
                checked={!field.value}
                onCheckedChange={(v) => field.onChange(!v)}
              />
            )}
          />

          {/*
            以前は独立した区画だった。**普段は触らない設定なので
            高度な設定へ移した**（イベント側と同じ）。

            **`Field` は使えない。** あちらのラベルは `<label htmlFor>` で、
            指す先は `ToggleField` が自前の `<label>` で包んだトグルになる。
            同じスイッチに2枚のラベルが付き、見出しを押すと Fediverse の
            トグルが切り替わる。複数の入力をまとめる見出しなので
            `role="group"` にする。

            **面で囲む。** 高度な設定はトグルが縦に並ぶ区画なので、見出しを
            周りと同じ体裁にすると、下の3つがその見出しに属していることが
            読めない。淡い面で囲って、囲いの中が1つの設定だと示す。
            **文字の大きさは変えない** — 面が分けるので、見出しを大きくして
            もう一度分ける必要はない。

            **説明は付けない。** どのプラットフォームで登録した人が回答
            できるかは、中のトグルがそのまま示している。

            **ほとんどの人は触らないので、トグルの裏に置く**（`customPlatforms`）。
            面の中にあった見出しは外した — トグルの名前と同じことを2回言う。
          */}
          <div className="space-y-3">
            <ToggleField
              label="回答に利用できるプラットフォームをカスタマイズする"
              // 既定の範囲は閉じたままでは見えない（イベント側と同じ）
              description="オフのときは、あなたと同じプラットフォームのアカウントだけが回答できます。"
              checked={customPlatforms}
              onCheckedChange={toggleCustomPlatforms}
            />
            {customPlatforms ? (
              <div
                id="platforms"
                role="group"
                aria-label="回答に利用できるプラットフォーム"
                aria-describedby={
                  errors.isAllowedForFediverse?.message ? 'isAllowedForFediverse-error' : undefined
                }
                className="space-y-2 rounded-lg border border-border bg-[var(--surface-subtle)] p-3"
              >
                {editing ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    回答者がいるプラットフォームとサーバーは、範囲から外せません
                  </p>
                ) : null}

                <div className="space-y-1">
                  <Controller
                    control={control}
                    name="isAllowedForFediverse"
                    render={({ field }) => (
                      <ToggleField
                        id="isAllowedForFediverse"
                        label={
                          <PlatformLabel icons={[MastodonIcon, MisskeyIcon, PleromaIcon]}>
                            Fediverse
                          </PlatformLabel>
                        }
                        description={
                          lockedPlatform === 'isAllowedForFediverse'
                            ? `Mastodon・Misskey・Pleroma${LOCKED_PLATFORM_NOTE}`
                            : 'Mastodon・Misskey・Pleroma'
                        }
                        disabled={lockedPlatform === 'isAllowedForFediverse'}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />

                  {/* サーバー限定は Fediverse にしか掛からない。
                      離して置くと、Discord や X にも掛かるように読める */}
                  {fediverse ? (
                    <div className="border-l-2 border-border pl-3">
                      <Controller
                        control={control}
                        name="allowedFediverseServers"
                        render={({ field }) => (
                          <ServerRestrictionField
                            servers={field.value}
                            onChange={field.onChange}
                            affectsFediverseOnly={!discord && !twitter}
                          />
                        )}
                      />
                    </div>
                  ) : null}

                  <Controller
                    control={control}
                    name="isAllowedForDiscord"
                    render={({ field }) => (
                      <ToggleField
                        label={<PlatformLabel icons={[DiscordIcon]}>Discord</PlatformLabel>}
                        description={
                          lockedPlatform === 'isAllowedForDiscord'
                            ? LOCKED_PLATFORM_NOTE_ALONE
                            : undefined
                        }
                        disabled={lockedPlatform === 'isAllowedForDiscord'}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="isAllowedForTwitter"
                    render={({ field }) => (
                      <ToggleField
                        label={<PlatformLabel icons={[XIcon]}>X</PlatformLabel>}
                        description={
                          lockedPlatform === 'isAllowedForTwitter'
                            ? LOCKED_PLATFORM_NOTE_ALONE
                            : undefined
                        }
                        disabled={lockedPlatform === 'isAllowedForTwitter'}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {/* エラーの置き方と role は `Field` に揃える */}
                {errors.isAllowedForFediverse?.message ? (
                  <p
                    id="isAllowedForFediverse-error"
                    role="alert"
                    className="px-1 text-sm font-medium text-destructive"
                  >
                    {errors.isAllowedForFediverse.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </FormSection>

        {invalidFields.length > 0 ? (
          <div role="alert" className="rounded-xl border border-destructive bg-destructive/10 p-4">
            <p className="text-sm font-bold text-destructive">
              {invalidFields.length}件、入力を直してください
            </p>
            <ul className="mt-2 space-y-1">
              {invalidFields.map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => focusField(f.name)}
                    className="text-left text-sm text-destructive underline underline-offset-2"
                  >
                    {f.label}: {f.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="default" asChild>
            <Link href={backHref}>やめる</Link>
          </Button>
          <Button type="submit" variant="primary" disabled={pending} className="sm:min-w-48">
            {pending ? '保存中…' : editing ? '変更を保存' : '日程調整を作成'}
          </Button>
        </div>
      </form>
    </div>
  )
}
