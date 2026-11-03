import 'server-only'

/**
 * 未読の判定。**`occurredAt` で見る。`createdAt` ではない。**
 *
 * 畳まれた行が更新されるのは鍵が現在の既読位置と一致するとき、つまり
 * 未読のときだけなので、既読になった行の `occurredAt` は二度と動かない。
 * よって `occurredAt > seenAt` と `createdAt > seenAt` は常に一致し、
 * `occurredAt` に寄せると索引が `[userId, occurredAt]` の1本で足りる。
 *
 * **未読数と行の強調で同じ関数を通すこと。** 境界（同じ時刻）の扱いが
 * 食い違うと「未読1件と出ているのに、どの行も光っていない」になる。
 */
export function isUnread(occurredAt: Date, seenAt: Date): boolean {
  return occurredAt.getTime() > seenAt.getTime()
}

/** Prisma の where 片。`isUnread` と同じ境界（同じ時刻は既読） */
export function unreadWhere(seenAt: Date) {
  return { occurredAt: { gt: seenAt } }
}

