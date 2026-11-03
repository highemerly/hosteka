import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * 既読位置の読み書き。
 *
 * **セッションのトークンに載せない。** 通知を見るたびに動く値なので、
 * 再ログインまで更新されないトークンに入れると無言で陳腐化する
 * （CLAUDE.md の Session Management）。1行引くだけなので毎回読む。
 */

export async function readSeenAt(userId: string): Promise<Date> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsSeenAt: true },
  })
  /*
    セッションを解決した時点で users を1行引いているので、ここで見つからない
    のはその間に退会した場合だけ。通知が1件も無い状態と同じ扱いにする。
  */
  return user?.notificationsSeenAt ?? new Date()
}

/**
 * 既読位置を今へ進める。
 *
 * **前には戻さない。** 複数のポッドで時計がずれていると、古いほうの `now` で
 * 上書きして既読が未読に戻る。`lt` で守る。
 *
 * ここが動くと、以降に起きたことは**畳まれず新しい行になる**
 * （`fold.ts` の鍵が変わるため）。呼ぶのは「利用者が通知を見にいった瞬間」
 * だけにすること — 画面遷移のたびに呼ぶと、連続編集がまとまらなくなる。
 */
export async function markSeen(userId: string, now = new Date()): Promise<Date> {
  await prisma.user.updateMany({
    where: { id: userId, notificationsSeenAt: { lt: now } },
    data: { notificationsSeenAt: now },
  })
  return now
}
