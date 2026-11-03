import 'server-only'

import type { EventFormOutput } from '@/schemas/event'

import type { EventColumns } from './event-write'

/**
 * 編集を参加者に知らせるときに出す、項目の名前。
 *
 * **編集はすべて知らせる。** 以前はここで「知らせる価値のある項目」を選り分けて
 * いたが、名前を変えただけの編集が誰にも届かなかった。何が変わったかは
 * 受け取った人が決めることで、こちらが代わりに決めるものではない。
 *
 * 残っているのは**何も変わっていない保存を止める**役目だけ（編集画面は開いて
 * 保存すると全項目を送り返してくるので、これが無いと開くたびに全参加者へ飛ぶ）。
 *
 * `EVENT_FORM_FIELDS`（`event-write.ts`）と同じキー集合なので、**フォームに
 * 項目が増えると typecheck が落ちて、日本語名を決めるまで通らない。**
 * 複数の項目が同じ名前を持ってよい（「日時」は4項目がまとまる）。
 */
export const EVENT_CHANGE_LABELS: Record<keyof EventFormOutput, string> = {
  title: '名前',
  description: '説明',
  hashtags: 'ハッシュタグ',

  startDate: '日時',
  startTime: '日時',
  endDate: '日時',
  endTime: '日時',

  location: '場所',
  fee: '会費',
  relatedUrl: '関連URL',
  terms: '参加規約',

  maxParticipants: '定員',
  registrationDeadlineDate: '締切',
  registrationDeadlineTime: '締切',

  allowMaybe: '受け付ける回答',
  allowParticipationRequest: '受け付ける回答',
  optionGroups: '選択肢',

  isPublic: '掲載の扱い',
  isHighlighted: '掲載の扱い',

  isAllowedForFediverse: '参加できる人',
  isAllowedForDiscord: '参加できる人',
  isAllowedForTwitter: '参加できる人',
  allowedFediverseServers: '参加できる人',

  organizationId: '主催の名義',
}

/**
 * `events` の列が、フォームのどの項目から来たか。
 * **`eventColumnsFromForm` の写し取りと対になる。**
 *
 * `has*Time` は「時刻を指定したか」で、対応する `*Time` の一部。
 * 片方だけを見ると「時刻を消した」編集が拾えない。
 */
export const COLUMN_FIELD: Record<keyof EventColumns, keyof EventFormOutput> = {
  title: 'title',
  description: 'description',
  hashtags: 'hashtags',
  startDate: 'startDate',
  startTime: 'startTime',
  hasStartTime: 'startTime',
  endDate: 'endDate',
  endTime: 'endTime',
  hasEndTime: 'endTime',
  location: 'location',
  maxParticipants: 'maxParticipants',
  isPublic: 'isPublic',
  isHighlighted: 'isHighlighted',
  registrationDeadlineDate: 'registrationDeadlineDate',
  registrationDeadlineTime: 'registrationDeadlineTime',
  hasRegistrationDeadlineTime: 'registrationDeadlineTime',
  fee: 'fee',
  relatedUrl: 'relatedUrl',
  allowMaybe: 'allowMaybe',
  allowParticipationRequest: 'allowParticipationRequest',
}

/**
 * `eventColumnsFromForm` が作らない項目。
 * **`EVENT_FORM_FIELDS` が `per-route` と分類しているものと同じ顔ぶれ**
 * （ルートが検証してから個別に書く列）。ここに並べないと、規約や
 * 参加できる人を変えても誰にも届かない。
 */
export type EventChangeExtras = {
  terms: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  /**
   * 許可するサーバー名。**保存する形（プラットフォーム情報つきJSON）では
   * 比べない** — あちらは保存のたびに外部へ問い合わせて組み直すので、
   * 中身が同じでも文字列が変わりうる。主催者が触っているのは名前の集合。
   */
  allowedServers: string[]
  organizationId: string | null
}

export const EXTRA_FIELD: Record<keyof EventChangeExtras, keyof EventFormOutput> = {
  terms: 'terms',
  isAllowedForFediverse: 'isAllowedForFediverse',
  isAllowedForDiscord: 'isAllowedForDiscord',
  isAllowedForTwitter: 'isAllowedForTwitter',
  allowedServers: 'allowedFediverseServers',
  organizationId: 'organizationId',
}
