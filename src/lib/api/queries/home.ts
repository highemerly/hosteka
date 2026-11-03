'use client'

import { useQuery } from '@tanstack/react-query'

import type { HomeDto } from '@/app/api/v1/home/route'
import { api } from '@/lib/api/client'

export const homeKeys = {
  all: ['home'] as const,
}

/**
 * トップページの中身。統計と看板のイベントを**1リクエストで**取る。
 *
 * 絞り込みの引数を持たない。応答が全閲覧者で同一であることが、
 * このページをキャッシュ可能に保つ条件そのもの。
 */
export function useHome() {
  return useQuery({
    queryKey: homeKeys.all,
    queryFn: () => api.get<HomeDto>('/api/v1/home'),
  })
}
