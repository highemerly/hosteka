'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Crown, Plus, Users } from 'lucide-react'

import { Pagination } from '@/components/common/Pagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { useMyOrgs } from '@/lib/api/queries/orgs'
import { useViewer } from '@/hooks/useViewer'
import { formatJstDate } from '@/lib/jst'

const PATH = '/dashboard/my-orgs'

/** 1ページの件数。一覧カードと同じく6の倍数にしておく */
const PER_PAGE = 12

/**
 * あなたのグループ。
 *
 * **旧画面は2つあった。** `/dashboard/my-orgs`（マイグループ）と
 * `/dashboard/orgs`（グループを管理）が同じ `GET /api/v1/orgs` を叩いて
 * ほぼ同じものを描いており、違いはページ送りと作成日の有無だけだった。
 * ここへ寄せて、ページ送りは残す。
 *
 * **旧画面は実際に壊れていた。** API 標準化で応答が `serializeOrg` を
 * 通るようになり `_count.events` が `eventCount` に変わったのに、
 * 画面が `org._count.events` を読んだままで、開くと例外で落ちていた。
 */
export default function MyOrgsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { viewer } = useViewer()

  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const { data: orgs, isPending, error } = useMyOrgs()

  const unauthenticated = error instanceof ApiClientError && error.status === 401

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams)
    // 既定値はURLに書かない。「1ページ目」を貼っても素のURLになる
    if (next <= 1) params.delete('page')
    else params.set('page', String(next))
    const query = params.toString()
    router.push(query ? `${PATH}?${query}` : PATH)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          あなたのグループ
        </h1>
        <Button variant="primary" asChild>
          <Link href="/orgs/create">
            <Plus className="size-5" />
            グループを作成
          </Link>
        </Button>
      </div>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            あなたのグループを見るにはログインが必要です。
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : isPending ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : error || !orgs ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          グループを読み込めませんでした。
        </p>
      ) : orgs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">所属しているグループがありません。</p>
          <p className="mt-1 text-sm text-muted-foreground">
            他人のグループに所属または自分でグループを作成すると、イベントや日程調整をグループ名義で開催できるようになります。
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href="/orgs/create">
              <Plus className="size-5" />
              グループを作成
            </Link>
          </Button>
        </div>
      ) : (
        <OrgList orgs={orgs} page={page} viewerId={viewer?.id} onPageChange={goToPage} />
      )}
    </div>
  )
}

function OrgList({
  orgs,
  page,
  viewerId,
  onPageChange,
}: {
  orgs: NonNullable<ReturnType<typeof useMyOrgs>['data']>
  page: number
  viewerId: string | undefined
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(orgs.length / PER_PAGE))
  // 件数が減ってページが消えることがある。その場合は最後のページを見せる
  const current = Math.min(page, totalPages)
  const shown = orgs.slice((current - 1) * PER_PAGE, current * PER_PAGE)

  return (
    <>
      <ul className="mt-6 space-y-3">
        {shown.map((org) => (
          <li key={org.id}>
            {/* 行全体が押せる。名前だけを的にすると狭い画面で狙いづらい */}
            <Link
              href={`/orgs/${org.slug}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="font-medium text-foreground">{org.name}</h2>
                {org.creatorId === viewerId ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                    <Crown className="size-3" aria-hidden />
                    作成者
                  </span>
                ) : null}
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-4" aria-hidden />
                  管理者 {org.admins.length}人
                </span>
                <span>イベント {org.eventCount ?? 0}件</span>
                <span>作成 {formatJstDate(org.createdAt)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <Pagination page={current} totalPages={totalPages} onPageChange={onPageChange} />
    </>
  )
}
