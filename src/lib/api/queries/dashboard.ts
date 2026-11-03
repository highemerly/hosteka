'use client'

import { useQuery } from '@tanstack/react-query'

import type { DashboardDto } from '@/app/api/v1/dashboard/route'
import { api } from '@/lib/api/client'

export const dashboardKeys = {
  all: ['dashboard'] as const,
}

/**
 * マイページの中身。近いイベント・最近の日程調整・アカウント情報を**1リクエストで**取る。
 *
 * 絞り込みの引数を持たない。何を出すかはサーバーが決める。
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => api.get<DashboardDto>('/api/v1/dashboard'),
  })
}
