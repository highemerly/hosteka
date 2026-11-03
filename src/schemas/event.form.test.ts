import { describe, expect, it } from 'vitest'

import { eventFormSchema, type EventFormValues } from './event'

const valid: EventFormValues = {
  title: 'Fediverse 交流会',
  description: '',
  hashtags: [],
  startDate: '2026-09-12',
  startTime: '19:00',
  endDate: '',
  endTime: '',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: '',
  maxParticipants: null,
  registrationDeadlineDate: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  isPublic: true,
  isHighlighted: true,
  allowMaybe: false,
  allowParticipationRequest: true,
  organizationId: '',
  optionGroups: [],
}

const parse = (over: Partial<EventFormValues> = {}) =>
  eventFormSchema.safeParse({ ...valid, ...over })

const firstError = (over: Partial<EventFormValues>) =>
  parse(over).error?.issues[0]

describe('eventFormSchema', () => {
  it('最小構成（名前と開始日）で通る', () => {
    expect(parse().success).toBe(true)
  })

  it('イベント名は必須', () => {
    expect(firstError({ title: '   ' })?.message).toBe('イベント名は必須です')
  })

  it('空文字は未入力として扱う。空文字のまま保存しない', () => {
    const result = parse({ location: '', fee: '' })
    expect(result.success).toBe(true)
    expect(result.data?.location).toBeUndefined()
    expect(result.data?.fee).toBeUndefined()
  })

  it('関連URLはスキーム付きだけ受ける', () => {
    expect(parse({ relatedUrl: 'https://example.social/e/1' }).success).toBe(true)
    expect(firstError({ relatedUrl: 'example.social' })?.message).toContain('https://')
  })

  it('プラットフォームを1つも選ばないと通らない', () => {
    expect(
      firstError({
        isAllowedForFediverse: false,
        isAllowedForDiscord: false,
        isAllowedForTwitter: false,
      })?.message
    ).toBe('参加できるプラットフォームを1つ以上選んでください')
  })

  it('終了日は開始日より前にできない', () => {
    expect(firstError({ endDate: '2026-09-11' })?.message).toBe(
      '終了日は開始日より前にできません'
    )
    expect(parse({ endDate: '2026-09-12' }).success).toBe(true)
  })

  it('締切は開催日より後にできない。終わったイベントに申し込めてしまう', () => {
    expect(firstError({ registrationDeadlineDate: '2026-09-13' })?.message).toBe(
      '回答締切は開催日より後にできません'
    )
    expect(parse({ registrationDeadlineDate: '2026-09-12' }).success).toBe(true)
  })

  it('日付は2000年〜2999年', () => {
    expect(firstError({ startDate: '1999-01-01' })?.message).toContain('2000年')
  })

  it('定員の範囲を見る', () => {
    expect(parse({ maxParticipants: 40 }).success).toBe(true)
    expect(parse({ maxParticipants: null }).success).toBe(true)
    expect(firstError({ maxParticipants: 0 })?.message).toContain('以上')
  })

  it('オプションは見出しと選択肢1つ以上が要る', () => {
    expect(
      firstError({
        optionGroups: [{ title: '懇親会', responseType: 'single', options: [] }],
      })?.message
    ).toBe('選択肢を1つ以上入力してください')

    expect(
      parse({
        optionGroups: [
          {
            title: '懇親会',
            responseType: 'single',
            options: [{ name: '参加する', maxParticipants: 20 }],
          },
        ],
      }).success
    ).toBe(true)
  })

  it('オプションの見出しは重ねられない。2つ目にエラーを付ける', () => {
    const group = (title: string) => ({
      title,
      responseType: 'single' as const,
      options: [{ name: 'はい' }],
    })
    const result = parse({ optionGroups: [group('未成年ですか？'), group(' 未成年ですか？ ')] })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['optionGroups.1.title', '同じ見出しのオプションがあります'],
    ])

    expect(parse({ optionGroups: [group('未成年ですか？'), group('懇親会')] }).success).toBe(true)
  })

  it('同じ見出しの中で選択肢の名前は重ねられない', () => {
    expect(
      firstError({
        optionGroups: [
          { title: '懇親会', responseType: 'single', options: [{ name: '参加' }, { name: '参加' }] },
        ],
      })
    ).toMatchObject({ path: ['optionGroups', 0, 'options'], message: '同じ名前の選択肢があります' })

    // 見出しが違えば同じ名前でよい（「はい」「いいえ」はどの質問にも出る）
    expect(
      parse({
        optionGroups: [
          { title: '未成年ですか？', responseType: 'single', options: [{ name: 'はい' }] },
          { title: '初参加ですか？', responseType: 'single', options: [{ name: 'はい' }] },
        ],
      }).success
    ).toBe(true)
  })

  /*
    自由入力は主催者が選択肢を作らない。編集画面は選び方を切り替えても
    入力済みの選択肢を捨てない（書き直させないため）ので、**保存の形は
    ここで揃える。** 落とさないと、選択肢を持った自由入力が保存できる。
  */
  it('自由入力は選択肢を要求せず、送られてきた選択肢は落とす', () => {
    const result = parse({
      optionGroups: [{ title: 'どこで知りましたか', responseType: 'text', options: [] }],
    })
    expect(result.success).toBe(true)

    const withLeftovers = parse({
      optionGroups: [
        { title: 'どこで知りましたか', responseType: 'text', options: [{ name: '消える' }] },
      ],
    })
    expect(withLeftovers.data?.optionGroups[0].options).toEqual([])
  })

  it('文字数の上限は lib/validation と同じ値を使う', () => {
    expect(firstError({ title: 'あ'.repeat(101) })?.message).toContain('100文字以内')
    expect(firstError({ location: 'あ'.repeat(201) })?.message).toContain('200文字以内')
  })
})
