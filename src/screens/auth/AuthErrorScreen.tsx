'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LogIn } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { authErrorInfo } from '@/screens/auth/auth-error'

/**
 * ログインの失敗を知らせる画面。
 *
 * コールバックはここへリダイレクトしてくるだけなので、**この画面が
 * 出る時点でセッションは無い。** 何も取得せず、URL のコードを訳して出す。
 */
export default function AuthErrorScreen() {
  const searchParams = useSearchParams()
  const info = authErrorInfo(searchParams.get('error'))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {info.title}
        </h1>

        {/*
          説明は Notice にしない。**この画面はまるごと知らせ**なので、
          面で囲っても本文と区別する相手がいない（読ませる面はフラット）。
        */}
        <p className="text-base text-foreground">{info.message}</p>

        <div className="flex flex-col gap-3 sm:flex-row">
          {info.retryable ? (
            <Button variant="primary" asChild>
              <Link href="/auth/signin">
                <LogIn className="size-5" />
                もう一度ログインする
              </Link>
            </Button>
          ) : null}
          <Button variant="default" asChild>
            <Link href="/">ホームへ戻る</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
