'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ApiClientError } from '@/lib/api/client'

/**
 * アプリ全体のプロバイダ。layout.tsx から一度だけ描画する。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient はレンダーごとに作り直さない。作り直すとキャッシュが毎回捨てられる
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // このアプリのデータは実時間で動かない。フォーカスのたびに
            // 取り直す必要はない
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // 4xx は再試行しても結果が変わらない。
              // とくに401/403/404で粘ると、失敗が確定するまで待たせるだけになる
              if (error instanceof ApiClientError && error.status < 500) return false
              return failureCount < 2
            },
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
