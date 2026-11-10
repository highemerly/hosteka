'use client'

import { ChoiceCards } from '@/components/form/ChoiceCards'
import { Field } from '@/components/form/Field'
import SafeMarkdown from '@/components/SafeMarkdown'
import { resolvePlatformRestriction } from '@/components/event/allowed-platforms'
import { AllowedAccountTree } from '@/components/event/PlatformCondition'
import { formatOptionRange } from '@/components/pre-event/date-option-label'
import { bestOptionId, hasTiedBest, VOTE_MARK } from '@/components/pre-event/vote'
import { formatJstDate } from '@/lib/jst'
import type { PreEventDetailDto } from '@/server/serializers/pre-event'

/**
 * 日程調整からイベントを作るときだけの欄。
 *
 * **日程調整のまま変えられない項目は、入力欄ではなく読むだけの姿で出す**
 * （`lib/pre-event-promotion.ts`）。入力欄に見せると、書き換えたうえで
 * 送って断られる。
 */

/** 最初に選んでおく候補日。いちばん集まっている日、並んでいれば先頭 */
export function initialPromotionOptionId(preEvent: PreEventDetailDto): string | null {
  const options = preEvent.dateOptions
  if (options.length === 0) return null
  return (!hasTiedBest(options) && bestOptionId(options)) || options[0].id
}

/**
 * 開催日。**候補日から1つを選ぶ。** 日付や時刻を直接は書かせない —
 * 回答した人は候補日に○△×を付けていて、自動登録は「○を付けた日に
 * 決まったら」の約束なので、違う日時にはできない。
 */
export function PromotionDateField({
  preEvent,
  value,
  onChange,
  error,
}: {
  preEvent: PreEventDetailDto
  value: string | null
  onChange: (dateOptionId: string) => void
  error?: string
}) {
  const best = hasTiedBest(preEvent.dateOptions) ? null : bestOptionId(preEvent.dateOptions)

  return (
    <Field label="開催日" htmlFor="startDate" required error={error}>
      <ChoiceCards
        label="候補日"
        value={value}
        onChange={onChange}
        choices={preEvent.dateOptions.map((option) => {
          const day = formatJstDate(option.startDate, {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })
          const range = formatOptionRange(option.startDate, option.endDate)
          return {
            value: option.id,
            label: range ? `${day} ${range}` : day,
            badge: option.id === best ? 'いちばん集まっています' : undefined,
            description: `${VOTE_MARK.available}${option.counts.available}　${VOTE_MARK.maybe}${option.counts.maybe}　${VOTE_MARK.unavailable}${option.counts.unavailable}`,
            note:
              option.autoRegisterCount > 0
                ? `${option.autoRegisterCount}人が自動で参加登録されます`
                : undefined,
          }
        })}
      />
    </Field>
  )
}

/**
 * 参加規約。**日程調整の規約のまま。** 回答した人はこの規約に同意していて、
 * 自動登録はその同意をイベントへ引き継ぐ。無い規約を足すこともできない。
 */
export function PromotionTermsField({ terms }: { terms: string | null }) {
  if (!terms) {
    return (
      <Field label="参加規約" htmlFor="terms">
        <p id="terms" className="text-sm text-muted-foreground">
          日程調整に規約が設定されていなかったため、設定できません
        </p>
      </Field>
    )
  }
  return (
    <Field label="参加規約" htmlFor="terms">
      <div
        id="terms"
        className="rounded-lg border border-border bg-[var(--surface-subtle)] px-3.5 py-3"
      >
        <SafeMarkdown>{terms}</SafeMarkdown>
      </div>
    </Field>
  )
}

/**
 * 参加登録に利用できるプラットフォーム。**日程調整のまま。**
 * 回答した人はこの条件で答えている。広げたければ作ったあとに編集する。
 */
export function PromotionPlatformsField({ preEvent }: { preEvent: PreEventDetailDto }) {
  return (
    <div className="space-y-2" id="platforms">
      <span className="block text-base font-medium text-foreground">
        参加登録に利用できるプラットフォーム
      </span>
      <div className="rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
        <AllowedAccountTree r={resolvePlatformRestriction(preEvent)} />
      </div>
    </div>
  )
}
