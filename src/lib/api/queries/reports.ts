'use client'

import { useMutation } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { CreateReportBody } from '@/schemas/report'

/**
 * 通報の作成。
 *
 * **キャッシュに何も載せない。** 通報は読み出す画面が（管理画面を除いて）
 * 無いので、無効化する対象も無い。送って終わりのミューテーション。
 */
export function useCreateReport() {
  return useMutation({
    mutationFn: (input: CreateReportBody) =>
      api.post<{ id: string }>('/api/v1/reports', input),
  })
}
