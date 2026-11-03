'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { deleteCookie } from 'cookies-next'
import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { Notice } from '@/components/common/Notice'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { COOKIE_SECURE, COOKIE_VIEWER } from '@/lib/cookie-names'
import { ApiClientError } from '@/lib/api/client'
import { useAccountData, useDeleteAccount } from '@/lib/api/queries/account'
import { setFlash } from '@/lib/flash'
import { formatJstDate } from '@/lib/jst'
import { forgetRememberedServers } from '@/lib/remembered-server'
import type { AccountDataDto } from '@/app/api/v1/account/data/route'

const PATH = '/account/delete'

/** 確認のために打ってもらう語。**取り消せない操作なので指を止める** */
const CONFIRM_PHRASE = 'データを削除'

/** 参加状態の呼び名。参加者一覧と同じ語を使う */
const STATUS_LABELS: Record<string, string> = {
  attending: '参加',
  maybe: '未定',
  participation_request: '参加リクエスト',
}

function BlockerList({ title, items }: { title: string; items: AccountDataDto['blockers'] }) {
  if (items.length === 0) return null

  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-1 rule-y">
        {items.map((blocker) => (
          <li
            key={blocker.eventId}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="min-w-0 text-foreground">
              {blocker.eventTitle}
              <span className="ml-2 text-muted-foreground">
                {formatJstDate(blocker.startDate)}
                {blocker.participantStatus
                  ? ` ・ ${STATUS_LABELS[blocker.participantStatus] ?? blocker.participantStatus}`
                  : ''}
              </span>
            </span>
            <Link
              href={`/events/${blocker.eventId}`}
              className="shrink-0 text-sm text-primary underline underline-offset-4"
            >
              開く
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 消えるものの数え上げ。0件の行は出さない（無いものを並べても読む意味がない） */
function DeletedCounts({ data }: { data: AccountDataDto }) {
  const rows: [label: string, count: number][] = [
    ['主催したイベント', data.eventsCreated],
    ['参加したイベント', data.eventsParticipated],
    ['参加の記録', data.deletePreview.participationsToDelete],
    ['主催した日程調整', data.deletePreview.preEventsToDelete],
    ['日程調整の回答', data.deletePreview.preEventResponsesToDelete],
    ['作成者がいなくなるグループ', data.deletePreview.organizationsToOrphan],
    ['グループの管理権限', data.deletePreview.organizationMembershipsToDelete],
  ]
  const shown = rows.filter(([, count]) => count > 0)

  return (
    <ul className="mt-3 rule-y">
      {shown.map(([label, count]) => (
        <li key={label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold text-foreground">{count}件</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * アカウントの完全削除。
 *
 * **消えるものを読ませてから、1つのボタンで実行する。**
 * 旧画面は「理解しました」のチェックと語の入力とボタンの3段構えだったが、
 * 同じ確認を3回取っているだけで、指が止まるのは最後の1回だけだった。
 * いまは確認のダイアログ（`confirmationPhrase`）に寄せてある。
 */
export default function DeleteAccountScreen() {
  const confirm = useConfirm()
  const { data, isPending, error, refetch } = useAccountData()
  const remove = useDeleteAccount()

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'

  const requestDelete = async () => {
    const ok = await confirm({
      title: 'アカウントを削除しますか？',
      description: '消したデータは戻せません。同じアカウントで再ログインしても別人として扱われます。',
      confirmLabel: '完全に削除する',
      destructive: true,
      confirmationPhrase: CONFIRM_PHRASE,
    })
    if (!ok) return

    remove.mutate(undefined, {
      onSuccess: async () => {
        /*
          **ブラウザに残るものは自分で消す。** セッション行はユーザーの削除に
          巻き込まれて消えるが、viewer Cookie とログイン先の記憶は
          誰も消さない（残ると、消したはずの名前がヘッダーに出る）。
        */
        try {
          // Secure と Path が無いと、本番の `__Host-` 付きの名前は消えない
          deleteCookie(COOKIE_VIEWER, { path: '/', secure: COOKIE_SECURE })
        } catch {
          // 消せなくても遷移は続ける。ここで止めると画面が固まる
        }
        forgetRememberedServers()
        try {
          await fetch('/api/v1/auth/logout', { method: 'POST' })
        } catch {
          // 同上
        }
        // 読み直しを越えて知らせを出す（lib/flash.ts）。
        // 以前は `/?deleted=true` を付けていたが、読む側がいなかった
        setFlash({ type: 'success', message: 'アカウントを削除しました' })
        // 消えたアカウントの姿がクライアントのキャッシュに残らないよう読み直す
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/'
      },
      onError: async (e) => {
        // 判定と実行の間に状態が変わった。阻害要因は取り直して出し直す
        if (e instanceof ApiClientError && e.code === 'CONFLICT') {
          await refetch()
          toast.error('削除できない状態に変わりました。画面を更新しました。')
          return
        }
        toast.error(e instanceof ApiClientError ? e.message : '削除できませんでした')
      },
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        マイページ
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        アカウントを削除する
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">この操作にはログインが必要です。</p>
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
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <Notice tone="danger" title="削除したデータは元に戻せません" className="mt-6">
            <p>
              未開催のイベントを主催している場合は、削除する前に参加者へ連絡してください。
            </p>
            <p className="mt-1">
              同じアカウントで再ログインしても、新しい利用者として扱われます。
            </p>
          </Notice>

          {!data.canDelete ? (
            <section className="mt-6 rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-bold text-foreground">いまは削除できません</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                これから開かれるイベントが残っています。中止するか、参加を取り消すか、
                開催日を過ぎるまで待ってください。
              </p>
              <BlockerList
                title="主催しているイベント"
                items={data.blockers.filter((b) => b.type === 'hosted_event')}
              />
              <BlockerList
                title="参加するイベント"
                items={data.blockers.filter((b) => b.type === 'participated_event')}
              />
            </section>
          ) : null}

          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-bold text-foreground">消えるもの</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              @{data.username}@{data.server}（{data.platform}）のアカウントと、次の記録。
            </p>
            <DeletedCounts data={data} />
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              disabled={!data.canDelete || remove.isPending}
              onClick={() => void requestDelete()}
            >
              {remove.isPending ? '削除しています…' : 'アカウントを削除する'}
            </Button>
            <Button variant="default" asChild>
              <Link href="/dashboard">やめる</Link>
            </Button>
          </div>

          {/*
            開発中だけ出す。同意の記録を消して、ログイン時の同意の取り方を
            試し直すためのもの（利用者には関係がない）。
          */}
          {process.env.NODE_ENV === 'development' ? (
            <div className="mt-10 rule-t pt-4">
              <Button
                variant="default"
                size="sm"
                onClick={async () => {
                  await fetch('/api/v1/auth/reset-consent', { method: 'POST' })
                  toast.success('同意の記録を消しました。次のログインで取り直します。')
                }}
              >
                同意の記録を消す（開発用）
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
