'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Notice } from '@/components/common/Notice'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { Field, FormSection, fieldAria } from '@/components/form/Field'
import { MarkdownEditor } from '@/components/form/MarkdownEditor'
import { MarkdownHint } from '@/components/form/MarkdownHint'
import { UnsavedChangesGuard } from '@/components/form/UnsavedChangesGuard'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiClientError } from '@/lib/api/client'
import { useOrg } from '@/lib/api/queries/orgs'
import { useViewer } from '@/hooks/useViewer'
import { validateOrgSlug } from '@/lib/org-id'
import type { Viewer } from '@/lib/viewer'
import {
  EMPTY_ORG_FORM,
  toCreateOrgBody,
  toOrgFormValues,
  toUpdateOrgBody,
  type NewOrgAdminValue,
  type OrgFormValues,
} from '@/screens/orgs/org-form-values'

const ROLE_OPTIONS = [
  { value: 'admin' as const, label: '管理責任者' },
  { value: 'staff' as const, label: 'スタッフ' },
]

/** グループIDの空き確認を送るまでの待ち時間。打っている最中に毎回叩かない */
const SLUG_CHECK_DELAY = 600

type SlugState = { checking: boolean; available: boolean | null }

/**
 * グループの作成・編集。
 *
 * **作成と編集で同じ画面を使う。** 旧 `OrgForm`(482) も兼ねていたが、
 * 管理者の編集を `OrgAdminManager`(321) に分けていたため、
 * 「追加は即時、削除は保存時」のように保存の単位が混ざっていた。
 * ここでは**すべて保存ボタンまで確定しない。**
 */
export default function OrgFormScreen({ slug }: { slug?: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const { viewer } = useViewer()
  const isEdit = Boolean(slug)

  const { data: org, isPending, error: loadError } = useOrg(slug ?? '')
  const [values, setValues] = React.useState<OrgFormValues>(EMPTY_ORG_FORM)
  /** 開いたときの値。管理者の差分はここと比べて出す */
  const [original, setOriginal] = React.useState<OrgFormValues>(EMPTY_ORG_FORM)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState('')
  const [slugState, setSlugState] = React.useState<SlugState>({
    checking: false,
    available: null,
  })

  /*
    グループIDの例に出す起点。**ドメインを直書きしない** — 変わったときに
    画面の文言だけが古いまま残る。SSR では取れないので、`ShareBar` と同じく
    状態ではなく外部ソースとして読む（effect の setState は二度描きになる）。
  */
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    // サーバーでは出せない。伏せ字で描き、hydration 後に本物へ変わる
    () => ''
  )

  /*
    **初期値はあとから来る。** 編集画面は空のまま描き、保存済みの値を
    流し込む。マウント時の値で表示を決める子を作らないこと。
  */
  const [lastOrg, setLastOrg] = React.useState(org)
  if (isEdit && org && org !== lastOrg) {
    // **描画中に流し込む** — effect だと空のフォームを一度描いてから値が入る
    setLastOrg(org)
    const next = toOrgFormValues(org)
    setValues(next)
    setOriginal(next)
  }

  const set = <K extends keyof OrgFormValues>(key: K, value: OrgFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const dirty = React.useMemo(
    () => JSON.stringify(values) !== JSON.stringify(original),
    [values, original]
  )

  const slugFormatError =
    values.slug && !validateOrgSlug(values.slug)
      ? '4文字以上50文字以内の英数字、ハイフン、アンダースコアで入力してください'
      : ''

  /*
    グループIDの空き確認。**打っている最中に毎回は叩かない。**
    変えていないときも叩かない（自分自身とぶつかって「使用中」と出る）。
  */
  /*
    **「確認中」を押した直後に出したいので、同期的に状態を置く。**
    間を置いてから叩く処理（デバウンス）なので、結果は timer の中で入れる。
  */
  React.useEffect(() => {
    const candidate = values.slug.trim()
    if (!candidate || slugFormatError || candidate === original.slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlugState({ checking: false, available: null })
      return
    }

    setSlugState({ checking: true, available: null })
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug: candidate })
        if (original.slug) params.set('exclude', original.slug)
        const result = await api.get<{ available: boolean }>(
          `/api/v1/orgs/check-slug?${params.toString()}`
        )
        setSlugState({ checking: false, available: result.available })
      } catch {
        // 確認できなくても保存は試させる。サーバーが最終的に弾く
        setSlugState({ checking: false, available: null })
      }
    }, SLUG_CHECK_DELAY)

    return () => clearTimeout(timer)
  }, [values.slug, slugFormatError, original.slug])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    if (!values.name.trim()) {
      setError('グループ名を入力してください')
      return
    }
    if (slugFormatError) {
      setError(slugFormatError)
      return
    }
    if (slugState.available === false) {
      setError('このグループIDは既に使われています')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = isEdit
        ? await api.put<{ slug: string }>(
            `/api/v1/orgs/${encodeURIComponent(slug!)}`,
            toUpdateOrgBody(values, original)
          )
        : await api.post<{ slug: string }>('/api/v1/orgs', toCreateOrgBody(values))

      setSaved(true)
      toast.success(isEdit ? 'グループを更新しました' : 'グループを作成しました')
      router.push(`/orgs/${result.slug ?? values.slug}`)
    } catch (e) {
      // details があれば項目ごとの日本語文言が入っている
      setError(
        e instanceof ApiClientError
          ? (e.details?.[0]?.message ?? e.message)
          : `グループの${isEdit ? '更新' : '作成'}に失敗しました`
      )
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `「${values.name}」を削除しますか？`,
      description:
        'この操作は取り消せません。グループに紐づいたイベントは残りますが、グループ名義ではなくなります。',
      confirmLabel: 'グループを削除する',
      destructive: true,
    })
    if (!ok) return

    try {
      await api.delete(`/api/v1/orgs/${encodeURIComponent(slug!)}`)
      setSaved(true)
      toast.success('グループを削除しました')
      router.push('/dashboard/my-orgs')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'グループの削除に失敗しました')
    }
  }

  if (isEdit && isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (isEdit && (loadError || !org)) {
    const forbidden = loadError instanceof ApiClientError && loadError.status === 403
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {forbidden
            ? 'このグループを編集する権限がありません。'
            : 'グループを読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const backHref = isEdit ? `/orgs/${slug}` : '/dashboard/my-orgs'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <UnsavedChangesGuard when={dirty && !saved} />

      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {isEdit ? 'グループに戻る' : 'あなたのグループ'}
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {isEdit ? 'グループを編集' : 'グループを作成'}
      </h1>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <FormSection title="基本">
          <Field label="グループ名" htmlFor="name" required>
            <Input
              {...fieldAria('name')}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="例: Fediverse 交流会"
            />
          </Field>

          <Field
            label="グループID"
            htmlFor="slug"
            description={
              <>
                グループのページのURLの一部になります（{origin || 'https://…'}
                /orgs/[グループID]）。
                {isEdit ? null : '入力しなければ自動で決まります。'}
              </>
            }
            error={slugFormatError}
            hint={
              slugState.checking
                ? '空きを確認しています…'
                : slugState.available === true
                  ? 'このIDは使えます'
                  : slugState.available === false
                    ? 'このIDは既に使われています'
                    : undefined
            }
          >
            <Input
              {...fieldAria('slug', slugFormatError)}
              value={values.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="fediverse-club"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <Field
            label="説明"
            htmlFor="description"
            aside={<MarkdownHint />}
          >
            <MarkdownEditor
              id="description"
              value={values.description}
              onChange={(next) => set('description', next)}
              placeholder="毎月オフ会をしています。"
            />
          </Field>

          <Field label="関連URL" htmlFor="relatedUrl">
            <Input
              {...fieldAria('relatedUrl')}
              value={values.relatedUrl}
              onChange={(e) => set('relatedUrl', e.target.value)}
              placeholder="https://example.com"
              inputMode="url"
            />
          </Field>
        </FormSection>

        <FormSection
          title="管理者"
          description={
            /*
              **管理責任者はスタッフの上位。** サーバー側の判定もそうで、
              イベントの編集は役割を見ず「そのグループの管理者の行があるか」
              だけを見ている。並列に書くと「イベントはスタッフの担当」と
              読めてしまうので、上位であることを式で示す。
            */
            <ul className="space-y-0.5">
              <li>
                ・<b className="font-medium text-foreground">スタッフ</b>：
                グループ主催のイベントや日程調整の作成・編集権限
              </li>
              <li>
                ・<b className="font-medium text-foreground">管理責任者</b>：
                スタッフが持つ権限＋グループの編集権限
              </li>
            </ul>
          }
        >
          <AdminEditor
            values={values}
            viewerServer={viewer?.server ?? ''}
            /*
              **作成のときは自分の行がどこにも無い。** 保存された管理者を
              描くリストは空で、サーバーが作成者を admin として入れるのは
              保存のあと。空のリストは「自分を足さないと管理者が0人になる」
              と読めるので、確定している自分の行をここで見せる。
            */
            creator={isEdit ? null : viewer}
            onChange={(next) => setValues((current) => ({ ...current, ...next }))}
          />
        </FormSection>

        {error ? (
          <Notice tone="danger" title="保存できませんでした">
            {error}
          </Notice>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          {isEdit ? (
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => void remove()}
            >
              <Trash2 className="size-5" />
              グループを削除
            </Button>
          ) : null}
          <Button variant="default" asChild>
            <Link href={backHref}>やめる</Link>
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="sm:min-w-48"
            disabled={saving || slugState.checking}
          >
            {saving ? '保存しています…' : isEdit ? '変更を保存' : 'グループを作成'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * サーバー欄の「？」。
 *
 * **X と Discord は入れる値が名前と違う。** Fediverse は
 * `@名前@サーバー` の後ろをそのまま書けばよいが、この2つは
 * アカウントに「サーバー」という概念が無いので、何を入れるのか
 * 画面からは分からない（実際に保存されている値は `x.com` と
 * `discord.com`）。
 *
 * ツールチップではなくポップオーバーにする。**触って開ける**必要がある
 * （タッチではホバーが無い）。
 */
function ServerHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="サーバーに何を入れるかの説明"
          className="grid size-5 place-items-center rounded-full border border-border text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm">
        <p className="font-medium text-foreground">
          Fediverse 以外は、次の値を入れてください
        </p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>
            ・X (旧Twitter) … <b className="font-medium text-foreground">x.com</b>
          </li>
          <li>
            ・Discord … <b className="font-medium text-foreground">discord.com</b>
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground">
          空のままにすると、あなたと同じサーバーとして扱います。
        </p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * 保存すると何が起きるかの印。
 *
 * 変わらない行にも同じ幅の場所を空ける。**印のある行だけ字下げが
 * 変わると、並びが左右にずれて読みにくい。**
 */
function PendingMark({ mark }: { mark: 'add' | 'remove' | null }) {
  if (!mark) return <span aria-hidden className="w-5 shrink-0" />

  const isAdd = mark === 'add'
  return (
    <span
      className={`w-5 shrink-0 text-center text-base font-bold ${
        isAdd ? 'text-primary' : 'text-destructive'
      }`}
      title={isAdd ? '保存すると追加されます' : '保存すると外れます'}
    >
      {isAdd ? '＋' : '−'}
      <span className="sr-only">{isAdd ? '保存すると追加' : '保存すると外れる'}</span>
    </span>
  )
}

/**
 * 管理者の編集。
 *
 * **その場では消さない。** 外すのも役割を変えるのも保存ボタンまで
 * 確定しない。旧画面は追加だけ即時で、削除は保存時だったので、
 * どこまでが保存済みなのかが画面から読めなかった。
 */
function AdminEditor({
  values,
  viewerServer,
  creator,
  onChange,
}: {
  values: OrgFormValues
  viewerServer: string
  /** 作成のときだけ渡す。保存前なので外せず、役割も変えられない */
  creator: Viewer | null
  onChange: (next: Partial<OrgFormValues>) => void
}) {
  const [username, setUsername] = React.useState('')
  const [server, setServer] = React.useState('')
  const [checking, setChecking] = React.useState(false)
  const [addError, setAddError] = React.useState('')

  /**
   * 足す前に、その人が実在するか確かめる。
   *
   * **確かめないと黙って消える。** サーバーは知らないユーザーを
   * `continue` で読み飛ばすので、保存は成功したのに管理者は増えない。
   * 押した側は成功したと思ったままになる。
   */
  const add = async () => {
    const name = username.trim().replace(/^@/, '')
    const host = (server.trim() || viewerServer).replace(/^https?:\/\//, '')
    if (!name || !host || checking) return

    setChecking(true)
    setAddError('')
    try {
      const found = await api.get<{
        id: string
        username: string
        displayName: string
        avatar: string | null
        server: string
      }>(`/api/v1/users/check?username=${encodeURIComponent(name)}&server=${encodeURIComponent(host)}`)

      // 作成者はサーバーが admin として入れる。足しても読み飛ばされるので、その場で言う
      if (creator && found.id === creator.id) {
        setAddError('あなたは作成者なので、追加しなくても管理者です')
        return
      }

      const already =
        values.admins.some((a) => a.userId === found.id) ||
        values.newAdmins.some((a) => a.username === found.username && a.server === found.server)
      if (already) {
        setAddError('この人はもう管理者に入っています')
        return
      }

      const entry: NewOrgAdminValue = {
        username: found.username,
        server: found.server,
        role: 'staff',
        displayName: found.displayName,
        avatar: found.avatar,
      }
      onChange({ newAdmins: [...values.newAdmins, entry] })
      setUsername('')
      setServer('')
    } catch (e) {
      // 見つからないときの文言はサーバーが持っている
      // （「一度もログインしていないユーザーは追加できません」）
      setAddError(
        e instanceof ApiClientError ? e.message : 'ユーザーを確認できませんでした'
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      <ul className="rule-y">
        {creator ? (
          <li className="flex flex-wrap items-center gap-3 py-3">
            <PendingMark mark={null} />
            <UserAvatar name={creator.name} src={creator.avatar} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {creator.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{creator.username}@{creator.server}
              </span>
            </span>
            {/* 保存後の編集画面と同じ姿。外せず、役割も変えられない */}
            <span className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground">
              作成者
            </span>
          </li>
        ) : null}

        {values.admins.map((admin) => (
          <li
            key={admin.userId}
            className={`flex flex-wrap items-center gap-3 py-3 ${admin.removed ? 'opacity-50' : ''}`}
          >
            {/*
              保存すると何が起きるかを行頭の記号で示す。**語で書かない** —
              「保存すると追加」のような札は、行の中で名前より長くなって
              何の行なのか読めなくなる。印の幅は揃えて、変わらない行にも
              場所だけ空けておく（並びが左右にずれない）。
            */}
            <PendingMark mark={admin.removed ? 'remove' : null} />
            <UserAvatar name={admin.displayName} src={admin.avatar} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {admin.displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{admin.username}@{admin.server}
              </span>
            </span>

            {admin.isCreator ? (
              /* 作成者は外せないし役割も変えられない。グループが管理不能になる */
              <span className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground">
                作成者
              </span>
            ) : (
              <>
                <SegmentedControl
                  aria-label={`${admin.displayName}の権限`}
                  value={admin.role}
                  onValueChange={(role) =>
                    onChange({
                      admins: values.admins.map((a) =>
                        a.userId === admin.userId ? { ...a, role } : a
                      ),
                    })
                  }
                  options={ROLE_OPTIONS}
                />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() =>
                    onChange({
                      admins: values.admins.map((a) =>
                        a.userId === admin.userId ? { ...a, removed: !a.removed } : a
                      ),
                    })
                  }
                >
                  {admin.removed ? '外すのをやめる' : '外す'}
                </Button>
              </>
            )}
          </li>
        ))}

        {values.newAdmins.map((admin, index) => (
          <li key={`new-${index}`} className="flex flex-wrap items-center gap-3 py-3">
            <PendingMark mark="add" />
            <UserAvatar name={admin.displayName} src={admin.avatar} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {admin.displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{admin.username}@{admin.server}
              </span>
            </span>
            <SegmentedControl
              aria-label={`${admin.username}の権限`}
              value={admin.role}
              onValueChange={(role) =>
                onChange({
                  newAdmins: values.newAdmins.map((a, i) => (i === index ? { ...a, role } : a)),
                })
              }
              options={ROLE_OPTIONS}
            />
            <Button
              type="button"
              variant="default"
              size="icon-sm"
              aria-label="取り消す"
              onClick={() =>
                onChange({ newAdmins: values.newAdmins.filter((_, i) => i !== index) })
              }
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="ユーザー名" htmlFor="admin-username" className="min-w-40 flex-1">
          <Input
            {...fieldAria('admin-username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="taro"
            autoCapitalize="none"
          />
        </Field>
        <Field
          label="サーバー"
          htmlFor="admin-server"
          aside={<ServerHelp />}
          className="min-w-40 flex-1"
        >
          <Input
            {...fieldAria('admin-server')}
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder={viewerServer || 'handon.club'}
            autoCapitalize="none"
          />
        </Field>
        <Button
          type="button"
          variant="default"
          onClick={() => void add()}
          disabled={!username.trim() || checking}
        >
          <Plus className="size-5" />
          {checking ? '確認中…' : '追加'}
        </Button>
      </div>

      {addError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {addError}
        </p>
      ) : null}
    </div>
  )
}
