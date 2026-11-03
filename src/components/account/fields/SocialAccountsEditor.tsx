'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLATFORMS, findPlatform } from '@/screens/auth/sign-in-platforms'
import {
  emptySocialAccount,
  withPlatform,
  type SocialAccountValue,
} from '@/screens/account/account-profile-form-values'
import type { RowErrors } from '@/screens/account/profile-field-errors'
import { SOCIAL_ACCOUNT_MAX, type SocialPlatform } from '@/schemas/user'

/**
 * 他のSNSのアカウントの編集。
 *
 * **選択肢はログイン画面と同じ表から取る**（`PLATFORMS`）。別に持つと、
 * 選べるのにアイコンもリンクの作り方も無い選択肢ができる。
 *
 * **重複を弾かない。** 同じプラットフォームを2つ並べるのも、ログインに
 * 使っているアカウントをもう一度書くのも通す。
 *
 * **サーバー欄は要るときだけ出す**（`PlatformSpec.needsServer`）。X と
 * Discord では欄そのものが無くなるので、「X のサーバーには x.com と入れる」
 * という説明も要らなくなる。欄を消すことで説明も消えるのが正しい形。
 */
export function SocialAccountsEditor({
  value,
  onChange,
  errors,
  login,
}: {
  value: SocialAccountValue[]
  onChange: (next: SocialAccountValue[]) => void
  errors?: RowErrors
  /**
   * ログインに使っているアカウント。
   *
   * **触れない行として先頭に出す。** ユーザーページでは「メイン」として
   * 一覧の先頭に並ぶので、設定画面に無いと「なぜ出ているのか」「どこで
   * 消すのか」が分からない。値は OAuth から同期しているもので、
   * ここで書き換えられるものではない（だからグレーで出す）。
   */
  login?: { platform: string; username: string; server: string } | null
}) {
  const update = (index: number, next: SocialAccountValue) => {
    onChange(value.map((row, i) => (i === index ? next : row)))
  }

  const loginPlatform = login ? findPlatform(login.platform) : undefined

  return (
    <div className="space-y-3">
      {login ? (
        <div className="flex items-center gap-2">
          <div
            aria-label="メインのプラットフォーム"
            className="flex h-12 w-32 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 text-base text-muted-foreground sm:w-40"
          >
            {loginPlatform ? <loginPlatform.icon className="size-4" aria-hidden /> : null}
            <span className="truncate">{loginPlatform?.label ?? login.platform}</span>
          </div>
          <Input
            value={`@${login.username}`}
            readOnly
            disabled
            aria-label="メインのユーザー名"
            className="min-w-0 flex-1"
          />
          {loginPlatform?.needsServer ? (
            <Input
              value={login.server}
              readOnly
              disabled
              aria-label="メインのサーバー"
              className="min-w-0 flex-1"
            />
          ) : null}
          {/*
            削除ボタンの位置に札を置く。**空けない** — 下の行と幅が
            揃わないと、触れない行が別の欄のように見える。
          */}
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            メイン
          </span>
        </div>
      ) : null}

      {value.map((row, i) => {
        const platform = findPlatform(row.platform)
        const rowError = errors?.rows[i]

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <Select
                value={row.platform}
                onValueChange={(next) => update(i, withPlatform(row, next as SocialPlatform))}
              >
                {/*
                  **高さと文字の大きさを Input に揃える。**

                  素の `h-12` では効かない — shadcn の既定が
                  `data-[size=default]:h-8` で、属性の条件が付くぶん
                  こちらより強い。同じ条件で上書きする。
                */}
                <SelectTrigger
                  aria-label={`${i + 1}件目のプラットフォーム`}
                  className="w-32 shrink-0 text-base data-[size=default]:h-12 sm:w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((spec) => (
                    <SelectItem key={spec.value} value={spec.value}>
                      <spec.icon className="size-4" aria-hidden />
                      {spec.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={row.username}
                onChange={(e) => update(i, { ...row, username: e.target.value })}
                placeholder="ユーザー名"
                aria-label={`${i + 1}件目のユーザー名`}
                aria-invalid={Boolean(rowError) || undefined}
                className="min-w-0 flex-1"
              />

              {platform?.needsServer ? (
                <Input
                  value={row.server}
                  onChange={(e) => update(i, { ...row, server: e.target.value })}
                  placeholder={platform.placeholder}
                  aria-label={`${i + 1}件目のサーバー`}
                  aria-invalid={Boolean(rowError) || undefined}
                  className="min-w-0 flex-1"
                />
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${i + 1}件目を削除`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((_, index) => index !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {rowError ? <p className="text-xs text-destructive">{rowError}</p> : null}
          </div>
        )
      })}

      {/*
        **上限に達したら出さない。** 「5件までです」と断るより、
        できない状態を作らないほうがよい。
      */}
      {value.length < SOCIAL_ACCOUNT_MAX ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onChange([...value, emptySocialAccount()])}
        >
          <Plus className="size-4" />
          SNSを追加
        </Button>
      ) : null}
    </div>
  )
}
