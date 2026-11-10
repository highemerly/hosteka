import { promotionFixedValues, type PromotionSource } from '@/lib/pre-event-promotion'
import type { EventFormValues } from '@/schemas/event'
import type { PreEventDateOptionDto, PreEventDetailDto } from '@/server/serializers/pre-event'

import { EMPTY_EVENT_FORM } from './event-form-values'

/**
 * 日程調整を、イベントの作成画面の入力欄へ写す。**画面の中に書かない。**
 *
 * どの項目をどう扱うかは下の `PRE_EVENT_TO_EVENT` が型で強制している。
 * 日程調整に項目が増えると typecheck が落ち、「写す」か「写さない（理由付き）」かを
 * 決めるまで通らない。決めないまま足すと、日程調整では設定したのにイベントに
 * なると消える項目ができる。
 */

/** 日程調整の、イベントにするときに変えられない値（`lib/pre-event-promotion.ts`） */
export function promotionSourceOf(preEvent: PreEventDetailDto): PromotionSource {
  return {
    terms: preEvent.terms,
    organizationId: preEvent.organization?.id ?? null,
    isAllowedForFediverse: preEvent.isAllowedForFediverse,
    isAllowedForDiscord: preEvent.isAllowedForDiscord,
    isAllowedForTwitter: preEvent.isAllowedForTwitter,
    allowedServers: preEvent.allowedServers.map((s) => s.server),
  }
}

export function toEventFormValuesFromPreEvent(
  preEvent: PreEventDetailDto,
  option: Pick<PreEventDateOptionDto, 'startDate' | 'endDate'>
): EventFormValues {
  return {
    ...EMPTY_EVENT_FORM,
    title: preEvent.title,
    description: preEvent.description ?? '',
    hashtags: preEvent.hashtags,
    location: preEvent.location ?? '',
    fee: preEvent.fee ?? '',
    relatedUrl: preEvent.relatedUrl ?? '',
    isPublic: preEvent.isPublic,
    isHighlighted: preEvent.isHighlighted,
    // 日時・規約・参加できる人・主催の名義。サーバーが同じ関数で突き合わせる
    ...promotionFixedValues(promotionSourceOf(preEvent), option),
  }
}

type Mapping =
  /** イベントの入力欄へ写す */
  | { carried: true }
  /** 写さない。**理由を書くこと** */
  | { carried: false; why: string }

/**
 * 日程調整の DTO の全項目の行き先。`toEventFormValuesFromPreEvent` と対で読む
 * （`pre-event-to-event-form.test.ts` が、写すとした項目が本当に写っているかを見る）。
 */
export const PRE_EVENT_TO_EVENT: Record<keyof PreEventDetailDto, Mapping> = {
  title: { carried: true },
  description: { carried: true },
  hashtags: { carried: true },
  location: { carried: true },
  fee: { carried: true },
  relatedUrl: { carried: true },
  terms: { carried: true },
  isPublic: { carried: true },
  isHighlighted: { carried: true },
  isAllowedForFediverse: { carried: true },
  isAllowedForDiscord: { carried: true },
  isAllowedForTwitter: { carried: true },
  allowedServers: { carried: true },
  organization: { carried: true },
  dateOptions: { carried: true },

  registrationDeadline: {
    carried: false,
    why: '回答の締切で、参加登録の締切とは意味が違う。もう過ぎていることも多い',
  },
  allowAutoRegistration: {
    carried: false,
    why: 'イベントにするときに使い終わる設定。イベントに同じ項目は無い',
  },
  id: { carried: false, why: 'イベントは新しく作る' },
  creator: { carried: false, why: '作成者はサーバーが日程調整の作成者にする' },
  respondents: { carried: false, why: '回答者。自動登録はサーバーが回答から決める' },
  respondentCount: { carried: false, why: '集計結果' },
  promotion: { carried: false, why: 'イベントにした記録。イベントにした日程調整からは作れない' },
  viewer: { carried: false, why: '閲覧者ごとの状態' },
  createdAt: { carried: false, why: 'サーバーが決める' },
  updatedAt: { carried: false, why: 'サーバーが決める' },
}
