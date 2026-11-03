'use client'

import Link from 'next/link'
import { ChevronLeft, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { Notice } from '@/components/common/Notice'
import { visibilityShortLabel } from '@/components/attendable/contact/post-limits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { useDeleteScheduledPost, useScheduledPosts } from '@/lib/api/queries/account'
import { formatJstDateTime } from '@/lib/jst'
import type { ScheduledPostDto } from '@/app/api/v1/account/scheduled-posts/route'

const PATH = '/dashboard/scheduled_post'

function PostRow({
  post,
  onDelete,
  pending,
}: {
  post: ScheduledPostDto
  onDelete: (id: string) => void
  pending: boolean
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">
            {formatJstDateTime(post.scheduledAt)}
          </span>
          <span className="rounded-lg border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {visibilityShortLabel('mastodon', post.visibility)}
          </span>
        </p>

        {/* 本文は改行のまま見せる。予約投稿は「何を送るか」を確かめる場所 */}
        <p className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm break-words whitespace-pre-wrap text-foreground">
          {post.text}
        </p>

        {post.mediaCount > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" aria-hidden />
            添付 {post.mediaCount}件
          </p>
        ) : null}
      </div>

      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => onDelete(post.id)}
        className="shrink-0 self-start"
      >
        <Trash2 className="size-4" aria-hidden />
        取り消す
      </Button>
    </div>
  )
}

/**
 * 予約投稿。
 *
 * **一覧も取り消しもサーバー経由**（`/api/v1/account/scheduled-posts`）。
 * ブラウザから Mastodon を直接叩くには、アクセストークンを画面へ渡すことになる。
 *
 * **取得ボタンは置かない。** 開いた人がしたいのは一覧を見ることで、
 * 「取得」を押させる理由がない（旧画面は押すまで空だった）。
 */
export default function ScheduledPostsScreen() {
  const confirm = useConfirm()
  const { data, isPending, error } = useScheduledPosts()
  const remove = useDeleteScheduledPost()

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'

  const requestDelete = async (id: string) => {
    const ok = await confirm({
      title: 'この予約投稿を取り消しますか？',
      description: '取り消すと、この投稿は送られません。',
      confirmLabel: '取り消す',
      destructive: true,
    })
    if (!ok) return

    remove.mutate(id, {
      onSuccess: () => toast.success('予約投稿を取り消しました'),
      onError: (e) =>
        toast.error(e instanceof ApiClientError ? e.message : '取り消せませんでした'),
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
        予約投稿
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">予約投稿を見るにはログインが必要です。</p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {error instanceof ApiClientError
            ? error.message
            : '読み込めませんでした。時間をおいて開き直してください。'}
        </p>
      ) : isPending ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : data.status === 'not_mastodon' ? (
        <Notice tone="attention" title="Mastodon のアカウントでのみ使えます" className="mt-6">
          <p>予約投稿の仕組みを持つのが Mastodon だけのためです。</p>
        </Notice>
      ) : data.status === 'no_write_permission' ? (
        <div className="mt-6">
          <Notice tone="attention" title="投稿権限が必要です">
            <p>
              この機能を使うには、Hostekaへのログイン画面で、{data.server}への投稿権限を付与してください。
            </p>
          </Notice>
          <Button variant="primary" className="mt-4" asChild>
            <Link
              // アカウントを URL で渡す。無いとログイン画面がプラットフォームと
              // サーバーを選ばせる形に倒れる。予約投稿は Mastodon だけ
              href={`/auth/signin?${new URLSearchParams({
                requestWrite: 'true',
                platform: 'mastodon',
                server: data.server,
                callbackUrl: PATH,
              })}`}
            >
              再ログインして権限を付与
            </Link>
          </Button>
        </div>
      ) : data.posts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">予約されている投稿はありません。</p>
        </div>
      ) : (
        <>
          {/* 画面を見ても分からないこと。Hosteka が作ったものだけが並ぶと思うと数が合わない */}
          <p className="mt-2 text-sm text-muted-foreground">
            {data.server} に予約されている投稿です。Hosteka 以外で予約したものも並びます。
          </p>

          <div className="mt-4 rounded-xl border border-border bg-card px-5">
            <div className="rule-y">
              {data.posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  onDelete={(id) => void requestDelete(id)}
                  pending={remove.isPending}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
