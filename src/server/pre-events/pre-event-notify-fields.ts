import 'server-only'

import type { z } from 'zod'

import type { preEventPayloadSchema } from '@/schemas/pre-event'

type PreEventPayload = z.infer<typeof preEventPayloadSchema>

/**
 * 編集を回答者に知らせるときに出す、項目の名前。
 * **イベント側と同じ考え方**（`src/server/events/event-notify-fields.ts`）。
 *
 * 編集はすべて知らせる。止めるのは「何も変わっていない保存」だけ。
 *
 * `Record<keyof PreEventPayload, …>` なので、フォームに項目が増えると
 * typecheck が落ちて、日本語名を決めるまで通らない。
 */
export const PRE_EVENT_CHANGE_LABELS: Record<keyof PreEventPayload, string> = {
  title: '名前',
  description: '説明',
  dateOptions: '候補日',
  registrationDeadline: '締切',
  location: '場所',
  fee: '会費',
  relatedUrl: '関連URL',
  terms: '参加規約',
  allowAutoRegistration: '自動登録',
  isPublic: '掲載の扱い',
  isHighlighted: '掲載の扱い',
  isAllowedForFediverse: '参加できる人',
  isAllowedForDiscord: '参加できる人',
  isAllowedForTwitter: '参加できる人',
  allowedFediverseServers: '参加できる人',
  organizationId: '主催の名義',
}
