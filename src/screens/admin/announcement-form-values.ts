import { toJstDateInput, toJstTimeInput } from '@/lib/jst'
import type { AnnouncementType } from '@/schemas/announcement'
import type { AnnouncementDto } from '@/server/serializers/announcement'

/**
 * お知らせ編集の「DTO → フォーム」の写し取り。**純関数としてここに置く。**
 *
 * 画面の中（`reset()` の引数）に書くとテストから触れず、項目を運び忘れても
 * 気づけない。開いて保存しただけで値が消える事故は、この写し取りか
 * 本文の組み立てのどちらかが欠けて起きる（`announcement-round-trip.test.ts`）。
 */
export type AnnouncementFormValues = {
  type: AnnouncementType
  title: string
  body: string
  publishedDate: string
  publishedTime: string
  pinnedUntilDate: string
  pinnedUntilTime: string
}

export function toAnnouncementFormValues(dto: AnnouncementDto): AnnouncementFormValues {
  return {
    type: dto.type,
    title: dto.title,
    body: dto.body ?? '',
    publishedDate: toJstDateInput(dto.publishedAt),
    publishedTime: toJstTimeInput(dto.publishedAt),
    pinnedUntilDate: dto.pinnedUntil ? toJstDateInput(dto.pinnedUntil) : '',
    pinnedUntilTime: dto.pinnedUntil ? toJstTimeInput(dto.pinnedUntil) : '',
  }
}

/**
 * 新しく作るときの初期値。
 *
 * **公開日時は「いま」を入れておく。** 空欄を「今すぐ公開」の意味にすると、
 * 空欄のままでよいのか入れ忘れたのかが画面から読めない。予約したい人だけが
 * 先の日時に直す。
 */
export function emptyAnnouncementForm(now: Date = new Date()): AnnouncementFormValues {
  return {
    type: 'info',
    title: '',
    body: '',
    publishedDate: toJstDateInput(now),
    publishedTime: toJstTimeInput(now),
    pinnedUntilDate: '',
    pinnedUntilTime: '',
  }
}
