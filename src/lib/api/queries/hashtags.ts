'use client'

import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { HashtagSummaryDto } from '@/app/api/v1/hashtags/[hashtag]/route'

export const hashtagKeys = {
  summary: (tag: string) => ['hashtags', 'summary', tag] as const,
}

/** ハッシュタグのページの、切り替えごとの件数 */
export function useHashtagSummary(tag: string) {
  return useQuery({
    queryKey: hashtagKeys.summary(tag),
    queryFn: () =>
      api.get<HashtagSummaryDto>(`/api/v1/hashtags/${encodeURIComponent(tag)}`),
  })
}
