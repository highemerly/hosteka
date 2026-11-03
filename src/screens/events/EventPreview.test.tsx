import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { eventFormSchema, type EventFormValues } from '@/schemas/event'

import { EventPreview } from './EventPreview'
import { buildPreviewEvent } from './preview-event'

/**
 * 作成前プレビューが「本番と同じものを、押せない形で」描けているか。
 *
 * 見た目そのものはテストで守れないが、**押すと下書きが消える経路が
 * 残っていないこと**と、**参加者の目線で描いていること**は守れる。
 * そこを外すと、プレビューを開いた人が入力を失う。
 */

/*
  **時計を止める。** プレビューは「終了したか」を実時計で決めるので
  （`EventPreview.tsx`）、固定値の開催日（2026-09-12）を現実の日付が
  追い越した日に、参加登録のボタンが消えて5件が落ちた。
  **日付が変わっただけで落ちるテストは、変更と無関係な日に赤くなる。**

  `toFake` を Date だけに絞る。タイマーまで差し替えると、モーダルの
  開閉（Radix）が進まなくなる。オフセットまで書くのは CLAUDE.md の決まり
  （テストは UTC で回るため、付けないと実行環境のローカル時刻になる）。
*/
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-07-01T09:00:00+09:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

// jsdom には matchMedia が無い。ParticipantList が表示件数の判定に使う
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  )
})

const VALUES: EventFormValues = {
  title: 'Fediverse 交流会 2026 夏',
  description: '当日の流れ',
  hashtags: ['fediverse'],
  startDate: '2026-09-12',
  startTime: '19:00',
  endDate: '',
  endTime: '',
  location: '渋谷区道玄坂1-2-3',
  fee: '3,000円',
  relatedUrl: 'https://example.social/summer',
  terms: '',
  maxParticipants: 20,
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

function setup(overrides: Partial<EventFormValues> = {}, handlers = {}) {
  const onBack = vi.fn()
  const onSubmit = vi.fn()
  const event = buildPreviewEvent({
    values: eventFormSchema.parse({ ...VALUES, ...overrides }),
    viewer: null,
    organization: null,
    now: new Date('2026-07-01T00:00:00Z'),
  })

  const result = render(
    <QueryClientProvider client={new QueryClient()}>
      <EventPreview
        event={event}
        submitLabel="イベントを作成"
        submitting={false}
        onBack={onBack}
        onSubmit={onSubmit}
        {...handlers}
      />
    </QueryClientProvider>
  )

  return { ...result, onBack, onSubmit }
}

describe('EventPreview', () => {
  it('入力した時刻をそのまま出す（19:00 が 09:00 にならない）', () => {
    setup()
    expect(screen.getByText(/2026年9月12日.*19:00/)).toBeTruthy()
  })

  it('参加者の目線で描く（幹事メニューではなく参加登録が出る）', () => {
    setup()
    expect(screen.getAllByRole('button', { name: '参加登録' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /幹事メニュー/ })).toBeNull()
  })

  /*
    参加操作は**説明の上と下の2箇所**に出す。下は説明を読み終えた人が
    そのまま押せるようにするためのもので、片方だけ消えると
    「読み切った先に操作が無い」か「見出しの直下に操作が無い」になる。
  */
  it('参加登録は上と下の2箇所に出る', () => {
    setup()
    expect(screen.getAllByRole('button', { name: '参加登録' })).toHaveLength(2)
  })

  it('プレビューから抜ける道が常にある', () => {
    const { onBack, onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /編集に戻る/ }))
    expect(onBack).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'イベントを作成' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('まだ保存されていないことを画面に書く', () => {
    setup()
    expect(screen.getByText('まだ保存されていません')).toBeTruthy()
  })

  /*
    ここから下が本題。**プレビューから出ていくリンクを作らない。**
    押した先へ遷移すると、入力途中のフォームが失われる。
  */
  it('ハッシュタグをリンクにしない', () => {
    const { container } = setup()
    expect(screen.getByText('#fediverse').tagName).not.toBe('A')
    expect(container.querySelector('a[href*="/events/hashtag/"]')).toBeNull()
  })

  it('カレンダー追加と地図を押せなくする', () => {
    const { container } = setup()

    /* スマホ用に操作列にも同じものを再掲するので、1つとは限らない */
    for (const name of ['カレンダーに追加', '地図']) {
      const buttons = screen.getAllByRole('button', { name })
      expect(buttons.length).toBeGreaterThan(0)
      for (const button of buttons) {
        expect(button.tagName).toBe('BUTTON')
        expect(button.getAttribute('aria-disabled')).toBe('true')
      }
    }
    expect(container.querySelector('a[href*="/calendar"]')).toBeNull()
    expect(container.querySelector('a[href*="google.com/maps"]')).toBeNull()
  })

  it('場所がURLなら地図ボタンを出さない', () => {
    setup({ location: 'https://discord.gg/AbCdEfG' })
    expect(screen.queryByRole('button', { name: '地図' })).toBeNull()
  })

  it('関連URLは画面から消えている（場所の欄が URL も受ける）', () => {
    setup()
    expect(screen.queryByText('https://example.social/summer')).toBeNull()
  })

  it('場所がURLのときも、その文字をリンクにしない', () => {
    const { container } = setup({ location: 'https://discord.gg/AbCdEfG' })
    expect(screen.getByText('https://discord.gg/AbCdEfG').tagName).not.toBe('A')
    expect(container.querySelector('a[href*="/external-link"]')).toBeNull()
  })

  it('シェアと通報を押せなくする', () => {
    for (const name of [/SNSでシェア/, '通報']) {
      const { unmount } = setup()
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true')
      unmount()
    }
  })

  it('保存して初めて決まるイベントIDは出さない', () => {
    setup()
    expect(screen.queryByText('イベントID')).toBeNull()
  })

  it('参加規約は開いて中身を確かめられる（どこへも移動しないので止めない）', () => {
    setup({ terms: 'キャンセルは3日前まで' })
    fireEvent.click(screen.getByRole('button', { name: /参加規約/ }))
    expect(screen.getByText('キャンセルは3日前まで')).toBeTruthy()
  })

  /*
    参加規約は Markdown が使える欄として書かれる。素の文字で出すと
    `###` や `- ` が記号のまま並んで読めない。実際に参加登録モーダルが
    そうなっていた。詳細ページ側と両方を押さえておく。
  */
  it.each([
    ['参加条件バッジのモーダル', () => screen.getByRole('button', { name: /参加規約/ })],
    // 参加登録は上下2箇所にある。どちらも同じモーダルを開くので上を押す
    ['参加登録モーダル', () => screen.getAllByRole('button', { name: '参加登録' })[0]],
  ])('%s の参加規約が Markdown として描かれる', (_name, open) => {
    setup({ terms: '### キャンセル\n- 3日前まで無料' })
    fireEvent.click(open())

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'キャンセル' })).toBeTruthy()
    expect(within(dialog).getByRole('listitem').textContent).toBe('3日前まで無料')
  })

  it('参加登録モーダルも開ける。ただし送信はできない', () => {
    setup({
      optionGroups: [
        {
          title: '懇親会',
          responseType: 'single',
          options: [{ name: '参加する' }, { name: '参加しない' }],
        },
      ],
    })

    fireEvent.click(screen.getAllByRole('button', { name: '参加登録' })[0])
    const dialog = screen.getByRole('dialog')
    // 主催者が確かめたいのはここ。オプションは詳細ページ本体には出ない
    expect(within(dialog).getByText('懇親会')).toBeTruthy()
    expect(within(dialog).getByText('プレビューでは登録できません')).toBeTruthy()
    expect(
      within(dialog).getByRole('button', { name: '参加で回答する' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('締切を過去に置いていれば、参加者に見える姿もそうなる', () => {
    setup({
      startDate: '2026-09-12',
      registrationDeadlineDate: '2020-01-01',
      allowParticipationRequest: false,
    })
    expect(
      screen.getAllByRole('button', { name: /回答締切を過ぎました/ }).length
    ).toBeGreaterThan(0)
  })
})
