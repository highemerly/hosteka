'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import { buildListQuery, readListParams, type ListSpec, type ListState } from './admin-list-params'

/**
 * 一覧の絞り込みを URL から読み、変えるときは URL を書き換える。
 * 「終了した◯◯の2ページ目」をそのまま貼れて、戻るで元の位置に帰れる。
 */
export function useListState<F extends Record<string, string>>(spec: ListSpec<F>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const state = readListParams(new URLSearchParams(searchParams.toString()), spec)

  const navigate = (next: Partial<ListState<F>>) => {
    router.push(`${pathname}${buildListQuery(spec, state, next)}`, { scroll: false })
  }

  return [state, navigate] as const
}
