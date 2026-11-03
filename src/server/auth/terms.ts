import 'server-only'

import { prisma } from '@/lib/prisma'
import { ApiError } from '@/server/http/errors'

/**
 * ログインを始める前に、規約への同意を確かめる。
 *
 * **同意はログイン画面で取る。** 以前は OAuth を終えてから
 * `/auth/consent` へ寄り道させていたが、ログイン画面にも同意の
 * トグルが要るようになり、同じ同意を2回取ることになっていた。
 *
 * ここが唯一の関所になる。**コールバックは同意を確かめない** —
 * 相手のサーバーから戻ってきた時点で、この検査はもう通っている。
 * だから5本の register すべてがこれを呼ぶこと。呼び忘れても
 * ログインは成功してしまい、同意していない人の記録だけが残る。
 */
export function requireTermsAccepted(body: Record<string, unknown>): void {
  if (body.termsAccepted !== true) {
    throw ApiError.validation('利用規約への同意が必要です')
  }
}

/**
 * 初めての人の同意を記録する。
 *
 * **2回目以降は呼ばない。** `lastTermsAcceptedAt` は「いつ同意したか」で
 * あって最終ログイン日時ではない（それは `lastLoginAt`）。毎回上書きすると
 * 意味が変わる。
 *
 * **版は持たない。** 以前は `service_terms_acceptances` に版を積んでいたが、
 * どこからも読まれないまま、イベント作成のたびに `'1.0'` 固定の行が
 * 増えていた。規約は「変更後も利用を続けていれば同意したものとみなす」
 * （「利用規約の変更」の節）ので、版ごとの同意記録を前提にしていない。どの版の時代に
 * 同意したかは、この日時と規約の最終更新日で足りる。
 */
export async function recordTermsAcceptance(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastTermsAcceptedAt: new Date() },
  })
}
