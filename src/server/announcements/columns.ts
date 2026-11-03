import 'server-only'

import { parseJSTDateTimeToUTC } from '@/lib/event-date-utils'
import type { AnnouncementBody } from '@/schemas/announcement'

/**
 * 管理画面の入力を列の値にする。**作成と更新で同じものを使う。**
 *
 * 日時は JST の壁掛け時計として届く（`<input type="date">` と
 * `<input type="time">` の値）ので、`+09:00` を付けて解釈する。
 * ここを通さないと本番（UTC）で9時間ずれる（CLAUDE.md「Timezone Handling」）。
 */
export function announcementColumnsFromBody(body: AnnouncementBody) {
  return {
    type: body.type,
    title: body.title,
    body: body.body,
    publishedAt: parseJSTDateTimeToUTC(body.publishedDate, body.publishedTime),
    /*
      **"low" には掲載終了日時を持たせない。** あれはバナーに出さない
      重要度なので、入れても効かない値が行に残るだけになる。
      画面も "low" のときは欄を出さない。
    */
    pinnedUntil:
      body.type === 'low' || !body.pinnedUntilDate
        ? null
        : parseJSTDateTimeToUTC(body.pinnedUntilDate, body.pinnedUntilTime),
  }
}
