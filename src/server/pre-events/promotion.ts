import 'server-only'

import { ApiError } from '@/server/http/errors'

/**
 * イベントにした日程調整は閉じる。**回答も編集もできない。**
 *
 * 決まったあとで回答や候補日が動くと、イベントの参加者と日程調整の集計が
 * 食い違う。閉じているかは `promotedAt` で見る（`promotedEventId` は
 * イベントが消えると null に戻るが、日程調整は再開しない）。
 *
 * 画面は閉じた日程調整に回答と編集の操作を出さない
 * （`resolvePreEventActionState` の `promoted`）。
 */
export function assertNotPromoted(preEvent: { promotedAt: Date | null }): void {
  if (preEvent.promotedAt) {
    throw ApiError.conflict('この日程調整はイベントになったため、変更できません')
  }
}
