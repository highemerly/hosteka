import 'server-only'

import { prisma } from '@/lib/prisma'
import { MAX_STORED_IPS } from '@/lib/user-tracking'

/**
 * 保存期間を過ぎたセッション履歴を消す。
 *
 * **プライバシーポリシーの約束を果たすための処理。** ポリシーは
 * 「IPアドレスや User-Agent を含むセッション履歴・アクセスログは
 * 保存期間を90日とし、経過した情報は速やかに完全に消去する」と書いてある。
 * ここが消さないと、その一文が嘘になる。
 *
 * 消すものは3つ:
 *   1. `sessions` の古い行（IP・User-Agent・国と地域を持つ）
 *   2. `users.ipAddresses`（直近のIPの控え）を、残ったセッションから作り直す
 *   3. `notifications` の古い行
 *
 * **2 が要る。** あちらは「直近5件」を持つだけで日時を持たないので、
 * 同じIPから入り続けている人の行には、何年も前に初めて見たIPが残る。
 * セッションから作り直せば、90日より前のIPは自然に落ちる。
 *
 * **3 はポリシーの約束ではない。** 通知はアクセスログではなく、参加記録や
 * イベントと同じサービス機能のデータ。ただし放っておくと単調に増え続け、
 * 90日より前の「イベントが編集されました」を読み返す人もいないので、
 * **新しい cron を増やさずここに相乗りさせる**。
 *
 * cron から定期実行する（`POST /api/v1/admin/purge-old-records`、
 * または `npm run purge:old-records`）。
 */

export const RETENTION_DAYS = 90

export type PurgeResult = {
  /** 消したセッション履歴の行数 */
  deletedSessions: number
  /** IPの控えを作り直したユーザー数 */
  rewrittenUsers: number
  /** 消した通知の行数 */
  deletedNotifications: number
  /** これより前の記録を消した（ISO8601） */
  cutoff: string
}

export async function purgeOldRecords(now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  /*
    **失効ではなく削除だが、ここでは失効の手当てが要らない。** セッションの
    有効期限は14日なので、90日より前に作られた行のトークンはとうに期限切れ。
    念のため期限切れであることも条件に入れる（有効期限を延ばしても、
    生きているセッションを消さない）。
  */
  const { count: deletedSessions } = await prisma.session.deleteMany({
    where: { createdAt: { lt: cutoff }, expiresAt: { lt: now } },
  })

  /*
    通知は保存期間を過ぎたら消す。**`createdAt` で切る。**
    `occurredAt` は畳むたびに後ろへ動くので、あちらで切ると
    「ずっと畳まれ続けている1行」が永久に残る。
  */
  const { count: deletedNotifications } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })

  const users = await prisma.user.findMany({
    where: { NOT: { ipAddresses: null } },
    select: { id: true, ipAddresses: true },
  })

  let rewrittenUsers = 0
  for (const user of users) {
    const rows = await prisma.session.findMany({
      where: { userId: user.id, ipAddress: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { ipAddress: true },
      // 同じIPが並ぶので、5件ぶんの異なるIPを拾うには多めに見る
      take: 100,
    })

    const recent = [...new Set(rows.map((row) => row.ipAddress as string))].slice(0, MAX_STORED_IPS)
    const next = recent.length > 0 ? JSON.stringify(recent) : null
    if (next === user.ipAddresses) continue

    await prisma.user.update({ where: { id: user.id }, data: { ipAddresses: next } })
    rewrittenUsers += 1
  }

  return {
    deletedSessions,
    rewrittenUsers,
    deletedNotifications,
    cutoff: cutoff.toISOString(),
  }
}
