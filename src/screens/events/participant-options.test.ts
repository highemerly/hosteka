import { describe, expect, it } from 'vitest'

import type { EventOptionGroupDto } from '@/server/serializers/event'

import { selectedOptionViews } from './participant-options'

describe('selectedOptionViews', () => {
  it('選んだ選択肢を、見出し付きでイベントの表示順に並べる', () => {
    const groups: EventOptionGroupDto[] = [
      {
        id: 'g1',
        title: '食事',
        responseType: 'single',
        options: [
          { id: 'o1', name: '肉', maxParticipants: null, takenCount: 1 },
          { id: 'o2', name: '魚', maxParticipants: null, takenCount: 0 },
        ],
      },
      {
        id: 'g2',
        title: '2次会',
        responseType: 'single',
        options: [{ id: 'x1', name: '出る', maxParticipants: null, takenCount: 1 }],
      },
    ]

    expect(
      selectedOptionViews({ selectedOptionIds: ['x1', 'o2'], optionTextAnswers: {} }, groups)
    ).toEqual([
      { question: '食事', name: '魚' },
      { question: '2次会', name: '出る' },
    ])
  })

  it('自由入力の回答も同じ並びに混ぜる', () => {
    const groups: EventOptionGroupDto[] = [
      {
        id: 'g1',
        title: '食事',
        responseType: 'single',
        options: [{ id: 'o1', name: '肉', maxParticipants: null, takenCount: 1 }],
      },
      { id: 'g2', title: 'どこで知りましたか', responseType: 'text', options: [] },
    ]

    expect(
      selectedOptionViews(
        { selectedOptionIds: ['o1'], optionTextAnswers: { g2: '友人から' } },
        groups
      )
    ).toEqual([
      { question: '食事', name: '肉' },
      { question: 'どこで知りましたか', name: '友人から' },
    ])
  })
})
