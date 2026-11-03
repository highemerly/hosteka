'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { toast } from 'sonner'
import { z } from 'zod'

import { HomepageUrlsEditor } from '@/components/account/fields/HomepageUrlsEditor'
import { SocialAccountsEditor } from '@/components/account/fields/SocialAccountsEditor'
import { Notice } from '@/components/common/Notice'
import { Field, FormSection, fieldAria } from '@/components/form/Field'
import { MarkdownEditor } from '@/components/form/MarkdownEditor'
import { MarkdownHint } from '@/components/form/MarkdownHint'
import { UnsavedChangesGuard } from '@/components/form/UnsavedChangesGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleField } from '@/components/ui/toggle-switch'
import { useViewer } from '@/hooks/useViewer'
import { ApiClientError } from '@/lib/api/client'
import { useAccountProfile, useUpdateAccountProfile } from '@/lib/api/queries/account'
import { formatUserHandle, userProfilePath } from '@/lib/user-handle'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import { updateProfileBody } from '@/schemas/user'
import {
  EMPTY_ACCOUNT_PROFILE_FORM,
  toAccountProfileFormValues,
  toUpdateProfileBody,
  type AccountProfileFormValues,
} from '@/screens/account/account-profile-form-values'
import {
  flattenHomepageUrlErrors,
  flattenSocialAccountErrors,
} from '@/screens/account/profile-field-errors'

const PATH = '/account'

/**
 * フォームの検証。
 *
 * **保存の本文と同じ規則を使う**（`updateProfileBody`）。フォーム側の値は
 * 空欄を `''` で持つので、送る形（`null`）に寄せてから通す。
 * 書き分けると「画面は通るのに 400」ができる。
 */
const profileFormSchema = z
  .custom<AccountProfileFormValues>()
  .superRefine((values, ctx) => {
    const result = updateProfileBody.safeParse(toUpdateProfileBody(values))
    if (result.success) return
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
    }
  })

/**
 * 設定。
 *
 * **表示テーマはここに置かない。** 一度置いたが、保存ボタンの対象に
 * ならない項目がフォームの中に1つだけ混ざる形になり（選んだ瞬間に効く）、
 * 同じ画面の中で保存の意味が2通りになっていた。切り替えはヘッダーにある。
 */
export default function AccountSettingsScreen() {
  const { viewer } = useViewer()
  const { data: profile, isPending, error } = useAccountProfile()
  const handle = viewer ? formatUserHandle(viewer) : null
  const update = useUpdateAccountProfile(handle)
  const [saved, setSaved] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')

  const form = useForm<AccountProfileFormValues>({
    resolver: standardSchemaResolver(profileFormSchema),
    defaultValues: EMPTY_ACCOUNT_PROFILE_FORM,
    // **打っている途中は叱らず、離れたら知らせる**
    mode: 'onTouched',
    reValidateMode: 'onChange',
  })
  const { control, handleSubmit, register, reset, formState } = form
  const errors = formState.errors

  // 初期値は後から来るので reset で流し込む。写し取りは純関数に置いてある
  React.useEffect(() => {
    if (!profile) return
    reset(toAccountProfileFormValues(profile))
  }, [profile, reset])

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'
  const bio = useWatch({ control, name: 'bio' })

  const submit = handleSubmit((values) => {
    setSaveError('')
    update.mutate(toUpdateProfileBody(values), {
      onSuccess: (next) => {
        setSaved(true)
        // 保存後の値で原本を差し替える。そうしないと未保存の印が残る
        reset(toAccountProfileFormValues(next))
        toast.success('プロフィールを保存しました')
      },
      onError: (e) => {
        setSaveError(
          e instanceof ApiClientError
            ? (e.details?.[0]?.message ?? e.message)
            : 'プロフィールを保存できませんでした'
        )
      },
    })
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <UnsavedChangesGuard when={formState.isDirty && !saved} />

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        マイページ
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        プロフィール設定
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">プロフィール設定を開くにはログインが必要です。</p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : isPending ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-8">
          <FormSection title="プロフィール">
            <Field
              label="自己紹介"
              htmlFor="bio"
              aside={<MarkdownHint />}
              error={errors.bio?.message}
              hint={`${bio.length} / ${VALIDATION_LIMITS.USER_BIO}`}
            >
              <Controller
                control={control}
                name="bio"
                render={({ field }) => (
                  <MarkdownEditor
                    id="bio"
                    value={field.value}
                    onChange={field.onChange}
                    rows={6}
                    invalid={Boolean(errors.bio)}
                  />
                )}
              />
            </Field>
          </FormSection>

          <FormSection title="連絡先">
            {/*
              **公開されることは示す。** 連絡先を書く欄が、本人にしか
              見えないものなのか誰でも見られるのかは、画面を見ても分からない。
              知らずに書くと取り返しがつかない類のもの。

              公開・非公開は将来選べるようにする。今は常に公開なので、
              トグルを ON のまま触れなくしておく（値はフォームに持たせない）。
            */}
            <Field label="メールアドレス" htmlFor="email" error={errors.email?.message}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                {...register('email')}
                {...fieldAria('email', errors.email?.message)}
                placeholder="you@example.com"
              />
              <ToggleField label="ログインユーザー全員に公開する" checked disabled />
            </Field>

            <Field
              label="ホームページ"
              htmlFor="homepageUrls"
              error={flattenHomepageUrlErrors(errors).message}
            >
              <Controller
                control={control}
                name="homepageUrls"
                render={({ field }) => (
                  <HomepageUrlsEditor
                    value={field.value}
                    onChange={field.onChange}
                    errors={flattenHomepageUrlErrors(errors)}
                  />
                )}
              />
            </Field>

            <Field
              label="SNSアカウント"
              htmlFor="socialAccounts"
              error={flattenSocialAccountErrors(errors).message}
            >
              <Controller
                control={control}
                name="socialAccounts"
                render={({ field }) => (
                  <SocialAccountsEditor
                    value={field.value}
                    onChange={field.onChange}
                    errors={flattenSocialAccountErrors(errors)}
                    login={viewer}
                  />
                )}
              />
            </Field>
          </FormSection>

          {saveError ? <Notice tone="danger" title={saveError} /> : null}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
            {/* **どこに出るのかをリンクで示す。** 説明文では解かない */}
            {handle ? (
              <Button variant="default" className="sm:mr-auto" asChild>
                <Link href={userProfilePath(viewer!)}>あなたのページを見る</Link>
              </Button>
            ) : null}
            <Button type="submit" variant="primary" className="sm:min-w-48" disabled={update.isPending}>
              {update.isPending ? '保存しています…' : '保存する'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
