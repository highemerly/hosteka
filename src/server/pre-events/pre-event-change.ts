import 'server-only'

import { PRE_EVENT_CHANGE_LABELS } from './pre-event-notify-fields'

/**
 * 日程調整の編集で何が変わったか。**変わった項目の名前**を返す。
 * 空なら通知しない。イベント側（`src/server/events/event-change.ts`）と同じ形。
 */

export type PreEventChangeInput = {
  title: string
  description: string | null
  /** 保存形（JSON）のまま比べる。**並び順も変更のうち**（画面にその順で出る） */
  hashtags: string | null
  location: string | null
  fee: string | null
  relatedUrl: string | null
  terms: string | null
  registrationDeadline: Date | null
  allowAutoRegistration: boolean
  isPublic: boolean
  isHighlighted: boolean
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  /** 許可するサーバー名。**保存形（プラットフォーム情報つきJSON）では比べない** */
  allowedServers: string[]
  organizationId: string | null
  /** 候補日。**並び順まで含めて比べる**（画面にその順で出る） */
  dateOptions: { startDate: Date; endDate: Date | null }[]
}

/** 比べる値が、フォームのどの項目から来たか */
const FIELD_OF: Record<keyof PreEventChangeInput, keyof typeof PRE_EVENT_CHANGE_LABELS> = {
  title: 'title',
  description: 'description',
  hashtags: 'hashtags',
  location: 'location',
  fee: 'fee',
  relatedUrl: 'relatedUrl',
  terms: 'terms',
  registrationDeadline: 'registrationDeadline',
  allowAutoRegistration: 'allowAutoRegistration',
  isPublic: 'isPublic',
  isHighlighted: 'isHighlighted',
  isAllowedForFediverse: 'isAllowedForFediverse',
  isAllowedForDiscord: 'isAllowedForDiscord',
  isAllowedForTwitter: 'isAllowedForTwitter',
  allowedServers: 'allowedFediverseServers',
  organizationId: 'organizationId',
  dateOptions: 'dateOptions',
}

/** 区切り文字を発明せず JSON に任せる */
export function dateOptionsSignature(options: PreEventChangeInput['dateOptions']): string {
  return JSON.stringify(
    options.map((o) => [o.startDate.getTime(), o.endDate ? o.endDate.getTime() : null])
  )
}

/** サーバー名の集合。**並び順は主催者が決めたものではない**ので揃えてから比べる */
function serversSignature(servers: string[]): string {
  return JSON.stringify([...new Set(servers)].sort())
}

/** **`Date` は `getTime()` で比べる**（別インスタンスが常に「変わった」になるのを防ぐ） */
function differs(before: unknown, after: unknown): boolean {
  if (before instanceof Date || after instanceof Date) {
    const b = before instanceof Date ? before.getTime() : null
    const a = after instanceof Date ? after.getTime() : null
    return b !== a
  }
  return before !== after
}

export function notifiablePreEventChanges(
  before: PreEventChangeInput,
  after: PreEventChangeInput
): string[] {
  const labels: string[] = []

  for (const key of Object.keys(FIELD_OF) as (keyof PreEventChangeInput)[]) {
    let changed: boolean
    if (key === 'dateOptions') {
      changed = dateOptionsSignature(before.dateOptions) !== dateOptionsSignature(after.dateOptions)
    } else if (key === 'allowedServers') {
      changed = serversSignature(before.allowedServers) !== serversSignature(after.allowedServers)
    } else {
      changed = differs(before[key], after[key])
    }
    if (changed) labels.push(PRE_EVENT_CHANGE_LABELS[FIELD_OF[key]])
  }

  return [...new Set(labels)]
}
