'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { ChevronLeft, Eye, Plus, X } from 'lucide-react'
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
import { COMMON_HASHTAGS, TagsInput } from '@/components/attendable/fields/TagsInput'
import { ServerRestrictionField } from '@/components/attendable/fields/ServerRestrictionField'
import { OptionGroupsEditor } from '@/components/attendable/fields/OptionGroupsEditor'
import { useViewer } from '@/hooks/useViewer'
import { ApiClientError } from '@/lib/api/client'
import { canEditEventTerms } from '@/lib/event-terms'
import { useCreateEvent, useEvent, useUpdateEvent } from '@/lib/api/queries/events'
import { usePreEvent, usePromotePreEvent } from '@/lib/api/queries/pre-events'
import { eventDateFieldsFromOption, promotionCapacityError } from '@/lib/pre-event-promotion'
import { useMyOrgs } from '@/lib/api/queries/orgs'
import { eventFormSchema, HASHTAG_MAX, type EventFormValues } from '@/schemas/event'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import type { EventDetailDto } from '@/server/serializers/event'

import {
  defaultPlatforms,
  isCustomizedPlatforms,
  LOCKED_PLATFORM_NOTE,
  LOCKED_PLATFORM_NOTE_ALONE,
  viewerPlatformField,
  type PlatformDefaults,
} from './default-platforms'
import { EMPTY_EVENT_FORM, toEventFormValues } from './event-form-values'
import { EventPreview } from './EventPreview'
import { UndecidedDateDialog } from './UndecidedDateDialog'
import { buildPreviewEvent } from './preview-event'
import { LockedOrganizationField } from '@/components/attendable/fields/LockedOrganizationField'
import { toEventFormValuesFromPreEvent } from './pre-event-to-event-form'
import {
  initialPromotionOptionId,
  PromotionDateField,
  PromotionPlatformsField,
  PromotionTermsField,
} from './PromotionFields'

/**
 * エラーのまとめに出す項目名。
 * **スキーマのキーと画面の見出しを結ぶのはここだけ。** 各所で書くと、
 * 見出しを変えたときにエラーだけ古い言い方で残る。
 */
const FIELD_LABELS: { name: string; label: string }[] = [
  { name: 'title', label: 'イベント名' },
  { name: 'startDate', label: '開催日' },
  { name: 'endDate', label: '終了日' },
  { name: 'location', label: '場所' },
  { name: 'fee', label: '参加費' },
  { name: 'description', label: '詳細説明文' },
  { name: 'hashtags', label: 'ハッシュタグ' },
  { name: 'registrationDeadlineDate', label: '回答締切' },
  { name: 'maxParticipants', label: '定員' },
  { name: 'terms', label: '参加規約' },
  { name: 'optionGroups', label: 'オプション・アンケート' },
  { name: 'isAllowedForFediverse', label: '参加登録に利用できるプラットフォーム' },
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
 * Markdown 欄のプレースホルダー。
 *
 * **書き方の見本にしてある。** 「〜など」と例を並べるだけでは、
 * Markdown が使えることも、どう書けば見出しや箇条書きになるのかも
 * 伝わらない。ラベル横の「Markdown対応」を押せば解説へ行けるが、
 * 多くの人は欄の中を見て真似る。
 */
const DESCRIPTION_PLACEHOLDER = `### 当日の流れ
- 19:00 開場
- 19:30 開始

### 持ち物
- 筆記用具`

const TERMS_PLACEHOLDER = `### キャンセルについて
- 3日前まで無料
- 前日以降は参加費の50%

### 写真撮影
当日の写真をSNSへ掲載することがあります`

/**
 * プラットフォームのトグルに付ける、ロゴ付きのラベル。
 *
 * **Fediverse は実装3つのロゴで表す。** 単独のロゴを持っていないので、
 * シェアバーや参加条件バッジと同じ表し方に揃える。ここだけ別の記号に
 * すると「Fediverse＝この3つ」という対応が育たない。
 *
 * ブランド色は付けない（icons/social.tsx の方針）。3社の色がトグルの
 * 並びで出ると、そこが画面で最も強い面になる。
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
 * イベントの作成・編集。
 *
 * **5段のステップをやめて1枚にした。** 段に分けると、行き来しづらいわりに
 * 全体像が見えない。「何を聞かれるのか」が最初に分かるほうが埋めやすい。
 *
 * 必須はイベント名と開催日だけ。それ以外は上から順に「多くの人が書くもの」
 * →「一部の人が使うもの」の順に並べる。
 */
export default function EventFormScreen({
  eventId,
  fromPreEventId,
}: {
  eventId?: string
  /**
   * 日程調整からイベントを作る（`/pre-events/[id]/promote`）。
   * 開催日は候補日から選び、規約・参加できる人・主催の名義は日程調整のまま
   * （`lib/pre-event-promotion.ts`。サーバーが同じ関数で突き合わせる）
   */
  fromPreEventId?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const editing = Boolean(eventId)
  const promoting = Boolean(fromPreEventId)

  const { data: existing, isPending: loading, error: loadError } = useEvent(eventId ?? '', {
    enabled: editing,
  })
  // 未ログインなら 401 になるだけなので、認証済みのときだけ引く
  const { viewer } = useViewer()
  const { data: orgs = [], isPending: orgsLoading } = useMyOrgs({ enabled: Boolean(viewer) })
  const create = useCreateEvent()
  const update = useUpdateEvent(eventId ?? '')

  const {
    data: source,
    isPending: sourceLoading,
    error: sourceError,
  } = usePreEvent(fromPreEventId ?? '', { enabled: promoting })
  const promote = usePromotePreEvent(fromPreEventId ?? '')
  /*
    選んだ候補日。**選ぶまでは、いちばん集まっている日**（`initialPromotionOptionId`）。
    effect で初期値を入れない — 一度描いてから差し替わる
    （`react-hooks/set-state-in-effect`）。
  */
  const [pickedOptionId, setPickedOptionId] = React.useState<string | null>(null)
  const dateOptionId = pickedOptionId ?? (source ? initialPromotionOptionId(source) : null)
  const pickedOption = source?.dateOptions.find((o) => o.id === dateOptionId) ?? null

  const form = useForm<EventFormValues>({
    resolver: standardSchemaResolver(eventFormSchema),
    defaultValues: EMPTY_EVENT_FORM,
    /*
      **打っている途中は叱らず、離れたら知らせる。**
      onChange だと1文字目から赤くなるし、onSubmit だと最後まで
      気づけない。onTouched は「一度触った欄を離れたとき」から見る。
    */
    mode: 'onTouched',
    reValidateMode: 'onChange',
  })
  const { register, control, handleSubmit, reset, setValue, formState } = form
  const errors = formState.errors

  // 編集時は取得できてから流し込む。**写し取りは純関数に置く**
  // （画面の中に書くと、抜けても正常に見えるしテストからも触れない）
  React.useEffect(() => {
    if (!existing) return
    reset(toEventFormValues(existing))
  }, [existing, reset])

  /*
    日程調整から作るときは、取得できたら一度だけ流し込む。
    **取り直しのたびに流し込まない** — 画面に戻ってきただけで取り直しが走り、
    書きかけの定員や説明が日程調整の値に戻る。
  */
  const sourceApplied = React.useRef(false)
  React.useEffect(() => {
    if (!source || sourceApplied.current) return
    const optionId = initialPromotionOptionId(source)
    const option = source.dateOptions.find((o) => o.id === optionId)
    if (!option) return
    sourceApplied.current = true
    reset(toEventFormValuesFromPreEvent(source, option))
  }, [source, reset])

  /** 候補日を選び直す。日時の欄は候補日から作る（画面からは書かせない） */
  const pickOption = (id: string) => {
    const option = source?.dateOptions.find((o) => o.id === id)
    if (!option) return
    setPickedOptionId(id)
    for (const [name, value] of Object.entries(eventDateFieldsFromOption(option))) {
      setValue(name as 'startDate' | 'startTime' | 'endDate' | 'endTime', value, {
        shouldDirty: true,
      })
    }
  }

  /*
    参加できるプラットフォームの既定を、主催者自身のものに合わせる。

    **`EMPTY` に書けない。** 閲覧者は Cookie から読むので最初の描画では
    まだ null（`useViewer` の説明を参照）。`defaultValues` は
    その時点で確定してしまう。

    一度だけ適用する。`useViewer` はマウント直後の effect で解決するので、
    ここが走るのは利用者が触るより前。**それでも編集時は何もしない** —
    あちらは `reset()` が保存済みの値を流し込む側で、後から上書きすると
    主催者が設定した範囲を黙って書き換えることになる。
  */
  const platformDefaultApplied = React.useRef(false)
  React.useEffect(() => {
    // 日程調整から作るときも何もしない。参加できる人は日程調整のまま
    if (editing || promoting || !viewer || platformDefaultApplied.current) return
    platformDefaultApplied.current = true

    const defaults = defaultPlatforms(viewer)
    for (const [name, value] of Object.entries(defaults)) {
      setValue(name as keyof typeof defaults, value)
    }
  }, [editing, promoting, viewer, setValue])

  /*
    どの欄を出すか。**保存する値ではない。**
    既定は日付だけで、時刻と終了日は要る人だけが足す。
    参加規約も同じ — 多くのイベントには無いので、置くのはボタンだけにする。
  */
  const [withTime, setWithTime] = React.useState(false)
  const [withEndDate, setWithEndDate] = React.useState(false)
  const [withTerms, setWithTerms] = React.useState(false)
  // 締切も既定は日付だけ（その日の 23:59 まで）
  const [withDeadlineTime, setWithDeadlineTime] = React.useState(false)
  // 読み込んだら合わせる。**effect にしない**（`byOrg` と同じ形）
  const [shownFor, setShownFor] = React.useState<typeof existing>(undefined)
  if (existing && existing !== shownFor) {
    setShownFor(existing)
    setWithTime(existing.hasStartTime)
    setWithDeadlineTime(
      Boolean(existing.registrationDeadline && existing.hasRegistrationDeadlineTime)
    )
    setWithEndDate(Boolean(existing.endDate))
    setWithTerms(Boolean(existing.terms))
  }

  const fediverse = useWatch({ control, name: 'isAllowedForFediverse' })
  const discord = useWatch({ control, name: 'isAllowedForDiscord' })
  const twitter = useWatch({ control, name: 'isAllowedForTwitter' })
  /*
    参加規約を変えられるか。**登録した人が1人でもいれば変えられない**
    （規則は `canEditEventTerms`。サーバーの PUT も同じものを見る）。
    作成中は当然ながら誰もいないので、常に書ける。

    **止まるのは「足す」と「書き換える」だけで、削除はできる**
    （`isAllowedEventTermsChange`）。下の `removeTerms` を参照。
  */
  const termsLocked = Boolean(
    existing && !canEditEventTerms(existing.participants.map((p) => p.status))
  )
  const title = useWatch({ control, name: 'title' }) ?? ''
  const description = useWatch({ control, name: 'description' }) ?? ''
  const terms = useWatch({ control, name: 'terms' }) ?? ''

  /*
    プラットフォームを既定から変えるか。**保存する値ではない。**
    ほとんどの人は既定（主催者と同じプラットフォーム）のままなので、
    トグルを入れた人にだけ中身を見せる。

    **閉じたら既定に戻す。** 閉じているのに値だけが既定と違うと、
    効いている制限が画面のどこにも見えなくなる。
    編集で開いたときは、既定から外れていれば開けておく。
  */
  const [customPlatforms, setCustomPlatforms] = React.useState(false)
  const [platformsFor, setPlatformsFor] = React.useState<[typeof existing, typeof viewer]>()
  if (existing && (existing !== platformsFor?.[0] || viewer !== platformsFor[1])) {
    setPlatformsFor([existing, viewer])
    setCustomPlatforms(isCustomizedPlatforms(toEventFormValues(existing), viewer))
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
    参加条件から「高度な設定」へ飛ばすための合図。**押した回数を渡す** —
    真偽値だと、一度開いたあと自分で畳み直した人がもう一度押しても
    値が変わらず、開かなくなる（`FormSection` の `openKey`）。
  */
  const [advancedOpenKey, setAdvancedOpenKey] = React.useState(0)
  const goToPlatforms = () => setAdvancedOpenKey((k) => k + 1)

  /*
    **開いたあとに動かす。** 押したその場で `scrollIntoView` すると、
    まだ畳んでいる高さで位置が決まる。あの節はページの末尾にあるので
    文書の下端で止まってしまい、そのあと中身が開いて背が伸びても
    スクロール位置は戻らない。結果、見出しは画面の途中や上に外れた
    ところに残る。

    effect は DOM に反映されたあとに走るので、開いた高さで測れる。
    最初の描画（0）では何もしない。
  */
  React.useEffect(() => {
    if (advancedOpenKey === 0) return
    document.getElementById('advanced')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [advancedOpenKey])

  /*
    回答の受け付け方。**締切と定員の説明文がこの2つに従って変わる。**
    「参加リクエスト」をオフにしたことが、締切後と満員のときにどうなるかを
    決めている。**トグルは「高度な設定」にあり、説明が変わる欄とは離れている** —
    締切や定員を書き換えたときは、あちらの説明文も読み直すこと。
  */
  const allowMaybe = useWatch({ control, name: 'allowMaybe' })
  const allowParticipationRequest = useWatch({ control, name: 'allowParticipationRequest' })

  /*
    回答締切の説明。**2つのトグルの組み合わせで4通りある。**
    とくに参加リクエストがオンのときは、締切後も新しい参加リクエストだけは
    通る（`resolveEventActionState`）。ここを書かないと、締切を入れた主催者は
    「その日で完全に閉じる」と思い込むことになる。
  */
  const deadlineDescription =
    '設定すると、期限以降は新たに参加登録したりキャンセルしたりできなくなります。' +
    (allowMaybe ? '「未定」の回答はキャンセルになります。' : '') +
    (allowParticipationRequest ? 'ただし、締切後も参加リクエストだけは受け付けます。' : '')

  /*
    自分のプラットフォームは外せない。

    閉じると**自分のイベントに自分が参加登録できなくなる**。
    ただし「入れる」のではなく「外せなくする」だけにしてある。開いた瞬間に
    値を書き換えると、別プラットフォームの幹事が編集画面を開いて保存しただけで
    イベントの条件が変わることになる。
  */
  const ownPlatformField = viewerPlatformField(viewer)
  const platformValues = {
    isAllowedForFediverse: fediverse,
    isAllowedForDiscord: discord,
    isAllowedForTwitter: twitter,
  }
  const lockedPlatform =
    ownPlatformField && platformValues[ownPlatformField] ? ownPlatformField : null

  /** グループ名義を選んでいるか。選んでいれば、その場で注意を出す */
  const organizationId = useWatch({ control, name: 'organizationId' })
  const isPublic = useWatch({ control, name: 'isPublic' })
  const isHighlighted = useWatch({ control, name: 'isHighlighted' })
  const hashtags = useWatch({ control, name: 'hashtags' })
  const selectedOrg = orgs.find((o) => o.id === organizationId) ?? null

  /*
    グループ名義にするかどうか。**値からは決められない。**
    自分名義は空文字なので、「まだ選んでいない」と「自分名義にした」が
    同じ値になる。開いているかどうかだけ手元で持つ。

    編集で読み込んだときなど、外から値が入ったら開く。**effect にしない** —
    畳んだ姿を一度描いてから開くことになる（`FormSection` と同じ形）。
  */
  const [byOrg, setByOrg] = React.useState(Boolean(organizationId))
  const [lastOrgId, setLastOrgId] = React.useState(organizationId)
  if (organizationId !== lastOrgId) {
    setLastOrgId(organizationId)
    if (organizationId) setByOrg(true)
  }

  // 締切の消しボタンは、入っているときだけ出す
  const deadlineDate = useWatch({ control, name: 'registrationDeadlineDate' })

  /*
    参加規約を消す。

    **書いたものを捨てるので必ず確かめる。** とくに登録した人がいるときは
    足し直せない（サーバーが拒む）ので、取り消せない操作だと先に言う。
    何も書いていないうちは捨てるものが無いので、黙って欄を畳む。
  */
  const removeTerms = async () => {
    if (terms) {
      const ok = await confirm({
        title: '参加規約を削除しますか？',
        description: termsLocked
          ? '参加登録した人がいるため、削除したあとは設定し直せません。'
          : undefined,
        destructive: true,
      })
      if (!ok) return
    }
    setValue('terms', '', { shouldDirty: true })
    setWithTerms(false)
  }

  const pending = create.isPending || update.isPending || promote.isPending

  /** 選んだ候補日で自動登録される人数。定員はこれより少なくできない */
  const autoRegisterCount = pickedOption?.autoRegisterCount ?? 0

  /*
    送信できなかったとき、何が足りないのかをまとめて出す。
    赤い文字が画面のどこかに散っているだけだと、長いフォームでは
    見つけられない。項目名を押すとその欄へ飛ぶ。
  */
  const [invalidFields, setInvalidFields] = React.useState<
    { name: string; label: string; message: string }[]
  >([])

  const onInvalid = () => {
    const found = FIELD_LABELS.flatMap(({ name, label }) => {
      const message = (errors as Record<string, { message?: string } | undefined>)[name]?.message
      return message ? [{ name, label, message }] : []
    })
    setInvalidFields(found)
    focusField(found[0]?.name)
  }

  /*
    プレビュー。

    **入力が通ってからでないと開かない。** プレビューは「保存したら
    こうなる」を見せるものなので、保存できない状態では見せるものがない
    （開催日が空のままでは日付バッジも組めない）。
    送信と同じ検証に通し、駄目なら送信時と同じエラーのまとめを出す。
  */
  const [previewEvent, setPreviewEvent] = React.useState<EventDetailDto | null>(null)

  const openPreview = handleSubmit((values) => {
    setInvalidFields([])
    const parsed = eventFormSchema.parse(values)
    // 日程調整から作るときの名義は日程調整のもの。自分が管理していないグループのこともある
    const org = promoting
      ? (source?.organization ?? undefined)
      : orgs.find((o) => o.id === parsed.organizationId)

    setPreviewEvent(
      buildPreviewEvent({
        values: parsed,
        viewer,
        organization: org ? { id: org.id, slug: org.slug, name: org.name } : null,
        existing: existing ?? null,
        now: new Date(),
      })
    )
    // プレビューはページの先頭から見せる。フォームの途中の位置のまま
    // 切り替わると、何が起きたのか分からない
    window.scrollTo({ top: 0 })
  }, onInvalid)

  /*
    保存できたら見張りを解く。**解かないと、保存直後の遷移を
    自分で引き止めてしまう** — フォームは dirty のままなので。
  */
  const [saved, setSaved] = React.useState(false)

  const onSubmit = handleSubmit(async (values) => {
    setInvalidFields([])
    const payload = eventFormSchema.parse(values)

    /*
      定員が自動登録の人数に足りない。**サーバーと同じ関数で見る。**
      送ってから断られると、どの欄を直せばいいかがトーストにしか出ない。
    */
    const capacityError = promoting
      ? promotionCapacityError(payload.maxParticipants, autoRegisterCount)
      : null
    if (capacityError) {
      form.setError('maxParticipants', { message: capacityError })
      setInvalidFields([{ name: 'maxParticipants', label: '定員', message: capacityError }])
      focusField('maxParticipants')
      return
    }

    try {
      /*
        **日程調整から作るときは、ほかの作り方へ落とさない。** 候補日が無いまま
        下へ進むと、日程調整と関係の無い普通のイベントができる。
      */
      if (promoting) {
        if (!dateOptionId) return
        const created = await promote.mutateAsync({ dateOptionId, event: payload })
        setSaved(true)
        toast.success('イベントを作成しました')
        router.push(`/events/${created.id}`)
      } else if (editing) {
        await update.mutateAsync(payload)
        setSaved(true)
        toast.success('イベントを更新しました')
        router.push(`/events/${eventId}`)
      } else {
        const created = await create.mutateAsync(payload)
        setSaved(true)
        toast.success('イベントを作成しました')
        router.push(`/events/${created.id}`)
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

  if (promoting && sourceLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  /*
    作れない日程調整。**サーバーも同じ理由で断る**（`promote` の POST）が、
    書き終えてから断られないよう、開いた時点で言う。
  */
  const promoteBlocked = !promoting
    ? null
    : sourceError || !source
      ? '日程調整を読み込めませんでした。'
      : source.promotion
        ? 'この日程調整はもうイベントになっています。'
        : !source.viewer.canDelete
          ? 'この日程調整をイベントにできるのは、作成者とグループの管理者だけです。'
          : source.dateOptions.length === 0
            ? '候補日がありません。'
            : null
  if (promoteBlocked) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {promoteBlocked}
          {source?.promotion?.eventId ? (
            <Link
              href={`/events/${source.promotion.eventId}`}
              className="ml-1 text-primary hover:underline"
            >
              イベントを見る
            </Link>
          ) : null}
        </p>
      </div>
    )
  }

  if (editing && loadError) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {loadError instanceof ApiClientError && loadError.status === 403
            ? 'このイベントを編集する権限がありません。'
            : 'イベントを読み込めませんでした。'}
        </p>
      </div>
    )
  }

  /*
    プレビュー中はフォームを描かない。
    **アンマウントしても入力は消えない** — 値は `useForm` が持っていて、
    この画面自体は立ったままだから。DOM から外れるだけ。
  */
  /*
    書きかけを持ったまま離れようとしたら引き止める。
    **プレビュー中も同じように見張る。** フォームは隠れているだけで
    入力は生きているし、ヘッダーのリンクもブラウザの戻るも効く。
  */
  const guard = <UnsavedChangesGuard when={formState.isDirty && !saved} />

  /** 戻る先。「やめる」も同じ */
  const backHref = editing
    ? `/events/${eventId}`
    : promoting
      ? `/pre-events/${fromPreEventId}`
      : '/events'

  if (previewEvent) {
    return (
      <>
        {guard}
        <EventPreview
          event={previewEvent}
          submitLabel={editing ? '変更を保存' : 'イベントを作成'}
          submitting={pending}
          onBack={() => setPreviewEvent(null)}
          onSubmit={onSubmit}
        />
      </>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {guard}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {editing ? 'イベントに戻る' : promoting ? '日程調整に戻る' : 'イベントを探す'}
      </Link>

      {/*
        **札は題名の横。** 下に置くと最初の区画の見出しと並んで、
        フォームの一部に見える。作る前に読ませたいものなので、
        題名と同じ行に置く（狭い画面では折り返って次の行へ落ちる）。
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {editing ? 'イベントを編集' : 'イベントを作成'}
        </h1>
        {!editing ? <EventPolicyLink /> : null}
      </div>

      {/*
        **どこまで埋めれば作れるのかを先に言う。** 区画が5つ並んでいると、
        全部に答えないと作れないように見える。欄ごとに「任意」と書くのは
        やめてある（`Field` の説明を参照）ので、言う場所はここになる。

        **編集では出さない。** すでに埋まっているものを前にして
        「どれが必須か」を読む場面ではない。
      */}
      {!editing && !promoting ? (
        <p className="mt-2 text-sm text-muted-foreground">
          必須はイベント名と開催日だけです。
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-8">
        <FormSection title="基本情報">
          <Field
            label="イベント名"
            htmlFor="title"
            required
            error={errors.title?.message}
            hint={`${title.length} / ${VALIDATION_LIMITS.EVENT_TITLE}`}
          >
            <Input
              {...register('title')}
              {...fieldAria('title', errors.title?.message)}
              placeholder="Fediverse 交流会 2026 夏"
            />
          </Field>

          {promoting && source ? (
            <PromotionDateField
              preEvent={source}
              value={dateOptionId}
              onChange={pickOption}
              error={errors.startDate?.message ?? errors.endDate?.message}
            />
          ) : (
            <Field
              label="開催日"
              htmlFor="startDate"
              required
              /*
                **開催日が必須なので、決まっていない人はここで詰まる。**
                行き先は日程調整だが、イベントを作りに来た人はその存在を
                知らない。適当な日で作ってしまうと、あとから前へは
                動かせない（`events/[id]` の PUT が拒む）。

                編集では出さない。日付はもう入っている。
              */
              aside={!editing ? <UndecidedDateDialog /> : undefined}
              error={errors.startDate?.message ?? errors.endDate?.message}
            >
              {/*
                **既定は日付だけ。** 時刻も終了日も、要る人だけが足す。
                「空欄でよい」と書くより、欄が無いほうが分かりやすい。

                トグルではなく「＋◯◯を指定」にしてある。ここで決めるのは
                設定のオン・オフではなく「入力欄を出すかどうか」なので、
                状態を持つスイッチより、その場の操作のほうが素直に読める。
              */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* 終了日が出たときだけ「開始」と書く。1行しかないうちは
                      何の日付か迷いようがないので、ラベルは要らない */}
                  {withEndDate ? (
                    <span className="w-8 shrink-0 text-sm text-muted-foreground">開始</span>
                  ) : null}
                  <Input
                    type="date"
                    className="w-auto"
                    {...register('startDate')}
                    {...fieldAria('startDate', errors.startDate?.message)}
                  />
                  {withTime ? (
                    <>
                      <Input
                        type="time"
                        className="w-auto"
                        {...register('startTime')}
                        aria-label="開始時刻"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="時刻の指定をやめる"
                        title="時刻の指定をやめる"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setWithTime(false)
                          setValue('startTime', '')
                          setValue('endTime', '')
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      onClick={() => setWithTime(true)}
                    >
                      <Plus className="size-4" />
                      時刻を指定
                    </Button>
                  )}
                </div>

                {withEndDate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 shrink-0 text-sm text-muted-foreground">終了</span>
                    <Input
                      type="date"
                      id="endDate"
                      className="w-auto"
                      {...register('endDate')}
                      aria-label="終了日"
                    />
                    {withTime ? (
                      <Input
                        type="time"
                        className="w-auto"
                        {...register('endTime')}
                        aria-label="終了時刻"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${withTime ? '終了日時' : '終了日'}の指定をやめる`}
                      title={`${withTime ? '終了日時' : '終了日'}の指定をやめる`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setWithEndDate(false)
                        setValue('endDate', '')
                        setValue('endTime', '')
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => setWithEndDate(true)}
                  >
                    <Plus className="size-4" />
                    {withTime ? '終了日時' : '終了日'}を指定
                  </Button>
                )}

              </div>
            </Field>
          )}

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
          **参加の条件は1つの区画にまとめる。** 締切・定員と参加規約は、
          どれも「参加してよい人」を決める同じ話なのに、見出しが分かれて
          いると両方を開かないと全体が見えない。

          **畳めるようにしない。** 締切も定員も規約も無いイベントが
          既定の姿に見えてしまう。基本情報と同じく、開いたまま並べる。
        */}
        <FormSection title="参加条件">
          <Field
            label="回答締切"
            htmlFor="registrationDeadlineDate"
            error={errors.registrationDeadlineDate?.message}
            description={deadlineDescription}
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
              {withDeadlineTime ? (
                <Input
                  type="time"
                  className="w-auto"
                  {...register('registrationDeadlineTime')}
                  aria-label="締切時刻"
                />
              ) : null}
              {/*
                **消す道を用意する。** ブラウザの日付欄は、一度入れた値を
                キーボードでしか空にできない（Safari は消せない）。
                締切は「あとから外す」ことがある設定なので、入れた人が
                自力で戻せないと、締切のないイベントに戻す手段が無くなる。

                **1つのボタンで、時刻 → 締切の順に外す。** 時刻を出しているときは
                時刻だけを外す（開始日時の × と同じ）。✕ が2つ並ぶと見分けが付かない。
              */}
              {withDeadlineTime || deadlineDate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={withDeadlineTime ? '締切時刻の指定をやめる' : '回答締切を消す'}
                  title={withDeadlineTime ? '締切時刻の指定をやめる' : '回答締切を消す'}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (withDeadlineTime) {
                      setWithDeadlineTime(false)
                      setValue('registrationDeadlineTime', '', { shouldDirty: true })
                      return
                    }
                    setValue('registrationDeadlineDate', '', { shouldDirty: true })
                    setValue('registrationDeadlineTime', '', { shouldDirty: true })
                  }}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
              {withDeadlineTime ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setWithDeadlineTime(true)}
                >
                  <Plus className="size-4" />
                  時刻を指定
                </Button>
              )}
            </div>
          </Field>

          <Field
            label="定員"
            htmlFor="maxParticipants"
            error={errors.maxParticipants?.message}
            /* 空欄の意味は入力欄のプレースホルダーが言う。
               ここは「定員を決めたとき何が起きるか」だけを書く */
            description={
              '設定すると、定員を超えた場合に新たに参加登録できなくなります。' +
              (allowParticipationRequest ? 'ただし、参加リクエストは受け付けます。' : '') +
              // 下回ると作れない（サーバーが断る）。知らないと送ってから直すことになる
              (autoRegisterCount > 0
                ? `自動で参加登録される${autoRegisterCount}人より少なくはできません。`
                : '')
            }
          >
            <Controller
              control={control}
              name="maxParticipants"
              render={({ field }) => (
                <Input
                  id="maxParticipants"
                  type="number"
                  inputMode="numeric"
                  min={Math.max(1, autoRegisterCount)}
                  placeholder="人数制限なし"
                  className="w-40"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                />
              )}
            />
          </Field>

          {/*
            参加規約。**既定では欄を出さない。**
            多くのイベントには無いのに、6行のエディタが常に開いていると
            「書かないといけないもの」に見える。開いた人だけが書く。

            `htmlFor` はどちらの姿でも `terms` を指す。畳んでいるときは
            ボタンがその id を持つので、エラーのまとめから飛んで来ても
            行き先がある（`focusField`）。
          */}
          {promoting ? (
            <PromotionTermsField terms={source?.terms ?? null} />
          ) : (
            <Field
              label="参加規約への同意"
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
                    ? '参加登録した人がいるので、内容は変更できません。削除はできます。'
                    : '参加登録した人がいるので設定できません。'
                  : withTerms
                    ? '参加登録時に同意が必須となります（一人でも同意した後は編集できません）。'
                    : '設定すると、参加登録時に同意が必須となります。'
              }
            >
              {!withTerms ? (
                /*
                  規約なしで登録が始まったイベントには**後から足せない** —
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
                      サーバーが同じ条件で書き込みを拒む（events/[id] の PUT）。
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

                  {/* **登録した人がいても消せる。** 主催者が自分の求めを
                      取り下げるだけで、不利になる参加者はいない */}
                  <Button type="button" variant="destructive" size="sm" onClick={removeTerms}>
                    <X className="size-4" />
                    参加規約を削除する
                  </Button>
                </div>
              )}
            </Field>
          )}

          {/*
            **行き先だけを置く。** 以前はこの節にあった設定なので、
            探しに来た人が迷わないようにする。

            今の設定まで写さない。触れない値が2箇所に出ると、どちらが
            効いているのかを読む手がかりが無くなる。
          */}
          {promoting && source ? (
            <PromotionPlatformsField preEvent={source} />
          ) : (
            <div className="space-y-2">
              <span className="block text-base font-medium text-foreground">
                参加登録に利用できるプラットフォーム
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
          )}
        </FormSection>

        {/*
          **「参加回答設定」という区画は無くした。** 「未定」と「参加リクエスト」を
          高度な設定へ移したあと、残るのはオプションだけになる。項目が1つの
          区画は、見出しと中身が同じことを2回言っているのと変わらない。
          区画そのものをオプションの見出しにする。

          **畳めるようにしない。** 参加条件の直後に置いて、参加登録のときに
          何を聞くかを続けて決められるようにした。畳んでおくと、見出しだけ
          読んで「出欠しか聞けない」と思われる。
        */}
        <FormSection
          title="オプション・アンケート"
          description="設定すると、参加登録時に出欠以外の質問を追加できます。（例： 食事メニュー・2次会参加希望・イベントをどこで知ったか？）"
        >
          <Controller
            control={control}
            name="optionGroups"
            render={({ field }) => (
              <OptionGroupsEditor
                groups={field.value}
                onChange={field.onChange}
                errors={flattenOptionErrors(errors)}
              />
            )}
          />
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
            allowMaybe ||
            !allowParticipationRequest ||
            customPlatforms
          }
        >
          {/*
            **まず「グループ名義にするか」を聞く。** 以前は自分の名前と
            グループ名が1つの Select に並んでいて、グループを持っていない人にも
            開いて確かめさせていた。ほとんどは自分名義なので、既定のままなら
            何も出さない。
          */}
          {promoting ? (
            <LockedOrganizationField
              organization={source?.organization ?? null}
              note={null}
            />
          ) : existing && !existing.viewer.canChangeOrganization ? (
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
                      /*
                        **開いたら先頭のグループを入れる。** 空のまま保存すると
                        名義は自分に戻るので、開いているのに効いていない状態を作らない。
                      */
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
                        /* 名前は左、選ぶものは右。面の中を「項目名：値」の1行で読ませる */
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

                      {/*
                        グループ名義にすると**編集できる人が増える**。
                        主催者の名前が変わるだけに見えるので、選んだその場で言う。
                        あとで「なぜ他の人が編集できるのか」と聞かれる筋のものは、
                        選ぶ前に読ませたほうが早い。
                      */}
                      {selectedOrg ? (
                        <Notice
                          title={`主催者があなたではなく「${selectedOrg.name}」に変更されます`}
                        >
                          イベントページでの表示や連絡先もグループ名義となります。また、
                          <strong className="font-semibold">
                            グループのメンバーは誰でもこのイベントを編集できます。
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
            受け付ける回答の種類。**既定のままで困らないので、ここに置く。**
            ただしこの2つは、参加制限の「回答締切」と「定員」の説明文を
            書き換える（`deadlineDescription` と定員の説明）。
            **変えたら、あちらの説明も読み直すこと。**
          */}
          <Controller
            control={control}
            name="allowMaybe"
            render={({ field }) => (
              /* 説明は付けない。締切を過ぎた「未定」がどうなるかは、
                 参加制限の回答締切の欄が言っている */
              <ToggleField
                label="回答「未定」を有効にする"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="allowParticipationRequest"
            render={({ field }) => (
              <ToggleField
                label="回答「参加リクエスト」を有効にする"
                description="回答期限または定員を超過した場合でも、主催者の許可があれば参加できるようにします。"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          {/*
            **既定がオフになる向きで書く。** 「公開する」「一覧に載せる」は
            既定がオンで、この区画では「何も触っていない＝全部オン」が
            並ぶことになり、どれが自分で入れた設定なのか読めなかった。
            名前のほうを裏返して、オンにしたものだけが狭める設定になる。
            **持っている値（`isPublic` / `isHighlighted`）は裏返さない。**
          */}
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <ToggleField
                label="ログインユーザーのみが閲覧できるようにする"
                description="設定すると、ログインしていない人はイベントのページを開けなくなります。"
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
                label="Hosteka のイベント一覧に載せない"
                /*
                  **何が起きるかを書く。** 一覧と検索から外れるだけで
                  ページは開けるので、隠したつもりで招待リンクを配られると
                  誰でも見られる状態のまま気づけない。ただし「非公開には
                  なりません」と釘を刺しても、結局どうなるのかは分からない。

                  **誰が開けるかは上のトグル次第。** あちらで閲覧を狭めて
                  いるときまで「URLを知っている人だけ」と書くと嘘になる。
                */
                description={
                  isPublic
                    ? '設定すると、イベント一覧や検索に表示されなくなり、URLを知っている人だけが閲覧できるようになります。'
                    : '設定すると、イベント一覧や検索に表示されなくなります。'
                }
                checked={!field.value}
                onCheckedChange={(v) => field.onChange(!v)}
              />
            )}
          />

          {/*
            以前は独立した区画（見出しが「登録に利用できるプラットフォーム」）
            だった。**普段は触らない設定なので高度な設定へ移した。**

            **`Field` は使えない。** あちらのラベルは `<label htmlFor>` で、
            指す先は `ToggleField` が自前の `<label>` で包んだトグルになる。
            同じスイッチに2枚のラベルが付き、見出しを押すと Fediverse の
            トグルが切り替わる。複数の入力をまとめる見出しなので `role="group"` にする。

            **面で囲む。** 見出しの文字だけを周りのトグルに合わせたら、
            今度は下の3つがこの見出しに属していることが読めなくなった
            （高度な設定はトグルが縦に並ぶ区画なので、同じ体裁の行が
            増えただけに見える）。オプションの編集や読み取り専用の規約と
            同じ淡い面で囲って、囲いの中が1つの設定だと示す。
            **文字の大きさは変えない** — 面が分けるので、見出しを大きくして
            もう一度分ける必要はない。

            **説明は付けない。** どのプラットフォームで登録した人が参加
            できるかは、中のトグルがそのまま示している。

            「必須」とも書かない。1つ以上必要なのは確かだが、自分の
            プラットフォームは外せない（`lockedPlatform`）ので、空にできる
            状態にそもそもならない。起きない事故の注意書きは、読む人に
            「何か入力し忘れているのでは」と探させるだけになる。

            **ほとんどの人は触らないので、トグルの裏に置く**（`customPlatforms`）。
            面の中にあった見出しは外した — トグルの名前と同じことを2回言う。
          */}
          {/* 日程調整から作るときは日程調整のまま（参加条件の節に読むだけの姿で出す） */}
          {!promoting ? (
            <div className="space-y-3">
              <ToggleField
                label="参加登録に利用できるプラットフォームをカスタマイズする"
                /* 既定の範囲は閉じたままでは見えない。知らないと、別の
                   プラットフォームの知り合いが参加できないことに後で気づく */
                description="オフのときは、あなたと同じプラットフォームのアカウントだけが参加登録できます。"
                checked={customPlatforms}
                onCheckedChange={toggleCustomPlatforms}
              />
              {customPlatforms ? (
                <div
                  id="platforms"
                  role="group"
                  aria-label="参加登録に利用できるプラットフォーム"
                  aria-describedby={
                    errors.isAllowedForFediverse?.message ? 'isAllowedForFediverse-error' : undefined
                  }
                  className="space-y-2 rounded-lg border border-border bg-[var(--surface-subtle)] p-3"
                >
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
          ) : null}
        </FormSection>

        {invalidFields.length > 0 ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-destructive/10 p-4"
          >
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
          {/* 作成の手前に置く。プレビューを見てから決められる並びにする */}
          <Button type="button" variant="default" onClick={openPreview} disabled={pending}>
            <Eye className="size-5" />
            プレビュー
          </Button>
          <Button type="submit" variant="primary" disabled={pending} className="sm:min-w-48">
            {pending ? '保存中…' : editing ? '変更を保存' : 'イベントを作成'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * オプションのエラーを `optionGroups.0.title` の形に均す。
 * RHF は入れ子のまま持つが、編集側は平らなキーで引くほうが読める。
 */
function flattenOptionErrors(errors: Record<string, unknown>): Record<string, string> {
  const groups = (errors as { optionGroups?: unknown }).optionGroups
  if (!Array.isArray(groups)) return {}

  const flat: Record<string, string> = {}
  groups.forEach((group, i) => {
    if (!group || typeof group !== 'object') return
    const g = group as Record<string, { message?: string }>
    if (g.title?.message) flat[`optionGroups.${i}.title`] = g.title.message
    if (g.options?.message) flat[`optionGroups.${i}.options`] = g.options.message
  })
  return flat
}
