import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ParticipantList, type ParticipantView } from './ParticipantList'

/**
 * 参加者一覧の畳み方。
 *
 * **「ほか●人を表示」の上に罫線を引かない。** 畳んだ分も同じ「参加」なので、
 * 線で切ると別の区分に見える。**参加以外の回答との間の線は残す** —
 * あちらは中身が変わる。
 */
beforeAll(() => {
  // jsdom には matchMedia が無い。幅で表示件数を変えるのに使う
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  )
})

const person = (i: number, status: ParticipantView['status']): ParticipantView => ({
  id: `p${i}`,
  name: `参加者${i}`,
  handle: `@u${i}@example.com`,
  avatar: null,
  isHost: false,
  status,
})

/** デスクトップでは12人まで詳細を出す。15人なら3人が畳まれる */
const items = [
  ...Array.from({ length: 15 }, (_, i) => person(i, 'attending')),
  person(99, 'participation_request'),
]

describe('畳んだ行の罫線', () => {
  it('「ほか●人を表示」には引かない', () => {
    render(<ParticipantList items={items} />)

    const more = screen.getByRole('button', { name: '残り3人の参加者を表示' })
    expect(more.className).not.toContain('rule-t')
  })

  it('参加以外の回答との間には引く', () => {
    render(<ParticipantList items={items} />)

    const others = screen.getByRole('button', { name: '参加以外の回答1件を表示' })
    expect(others.className).toContain('rule-t')
  })
})

/**
 * 畳む操作は、畳まれる範囲の終わりに置く。
 *
 * 「未定1を表示」を押すと、以前は開いた中身の**上**に「閉じる」が残った。
 * 読み終えた人が閉じるために開いた分だけ戻ることになる。
 */
describe('開いたときの「閉じる」の位置', () => {
  it('参加以外の回答では、中身の下に回る', () => {
    render(<ParticipantList items={items} />)

    fireEvent.click(screen.getByRole('button', { name: '参加以外の回答1件を表示' }))

    const close = screen.getByRole('button', { name: '参加以外の回答を閉じる' })
    const row = screen.getByText('参加者99')

    // DOCUMENT_POSITION_PRECEDING … 中身が「閉じる」より前にある
    expect(close.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('参加者の続きでも、中身の下に回る', () => {
    render(<ParticipantList items={items} />)

    fireEvent.click(screen.getByRole('button', { name: '残り3人の参加者を表示' }))

    const close = screen.getByRole('button', { name: '参加者一覧を閉じる' })
    const last = screen.getByText('参加者14')

    expect(close.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
})

/**
 * 選んだオプション。チップには選択肢の名前しか出さないので、
 * 押すと質問付きで全部出す。1行に収まらず隠れたチップもここで読める。
 */
describe('選んだオプション', () => {
  const withOptions: ParticipantView = {
    ...person(1, 'attending'),
    options: [
      { question: '未成年ですか？', name: 'はい' },
      { question: '懇親会', name: '参加する' },
    ],
  }

  it('チップは1行分の高さで切る', () => {
    render(<ParticipantList items={[withOptions]} />)

    const chips = screen.getByRole('button', { name: '参加者1の回答を表示' })
    expect(chips.className).toContain('h-5')
    expect(chips.className).toContain('overflow-hidden')
  })

  it('押すと質問と回答の組を出す', () => {
    render(<ParticipantList items={[withOptions]} />)

    fireEvent.click(screen.getByRole('button', { name: '参加者1の回答を表示' }))

    expect(screen.getByText('未成年ですか？')).toBeTruthy()
    expect(screen.getByText('懇親会')).toBeTruthy()
  })
})

/**
 * オプションで絞り込む。
 *
 * 「未成年は誰か」を知るのに、行のチップを1つずつ読ませない。
 * 絞り込んでいる間は畳まない（該当者を見たくて絞ったのに、さらに開かせない）。
 */
describe('オプションで絞り込む', () => {
  const minor = { question: '未成年ですか？', name: 'はい' }
  const adult = { question: '未成年ですか？', name: 'いいえ' }
  const groups = [{ title: '未成年ですか？', options: [{ name: 'はい' }, { name: 'いいえ' }] }]

  const many = [
    ...Array.from({ length: 14 }, (_, i) => ({
      ...person(i, 'attending'),
      options: [i < 13 ? minor : adult],
    })),
    { ...person(98, 'maybe'), options: [minor] },
    { ...person(99, 'maybe'), options: [adult] },
  ]

  /** 「14名（うち1名 …）」の行。先頭の数から親をたどる */
  const countRow = () => screen.getAllByText(/^\d+名$/)[0].parentElement!

  const choose = (label: RegExp) => {
    fireEvent.keyDown(screen.getByRole('button', { name: 'オプションで絞り込む' }), {
      key: 'Enter',
    })
    fireEvent.click(screen.getByRole('menuitemradio', { name: label }))
  }

  it('選択肢の無いイベントではボタンを出さない', () => {
    render(<ParticipantList items={items} />)
    expect(screen.queryByRole('button', { name: 'オプションで絞り込む' })).toBeNull()
  })

  /*
    自由入力は答えが人それぞれなので、絞り込みの条件にならない。
    並べると中身の無い見出しだけが残る。
  */
  it('自由入力の見出しはメニューに出さない', () => {
    render(
      <ParticipantList
        items={many}
        optionGroups={[...groups, { title: 'どこで知りましたか', options: [] }]}
      />
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'オプションで絞り込む' }), {
      key: 'Enter',
    })

    expect(screen.queryByText('どこで知りましたか')).toBeNull()
  })

  it('選択肢が自由入力だけならボタンを出さない', () => {
    render(<ParticipantList items={items} optionGroups={[{ title: 'ひとこと', options: [] }]} />)
    expect(screen.queryByRole('button', { name: 'オプションで絞り込む' })).toBeNull()
  })

  it('メニューの人数は参加の人だけを数える', () => {
    render(<ParticipantList items={many} optionGroups={groups} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'オプションで絞り込む' }), {
      key: 'Enter',
    })
    expect(screen.getByRole('menuitemradio', { name: /はい/ }).textContent).toBe('はい13')
  })

  it('該当者だけを畳まずに出す。人数は全体のまま「うち●名」を添える', () => {
    render(<ParticipantList items={many} optionGroups={groups} />)
    choose(/いいえ/)

    expect(countRow().textContent).toBe('14名（うち1名未成年ですか？ いいえ）')
    expect(screen.getByText('参加者13')).toBeTruthy()
    expect(screen.queryByText('参加者0')).toBeNull()
    // 参加以外の回答も同じ条件で絞る
    expect(screen.getByRole('button', { name: '参加以外の回答1件を表示' })).toBeTruthy()

    // デスクトップで12人を超えても畳まない
    fireEvent.click(screen.getByRole('button', { name: '絞り込みを解除' }))
    choose(/はい/)
    expect(countRow().textContent).toBe('14名（うち13名未成年ですか？ はい）')
    expect(screen.getByText('参加者12')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /残り\d+人の参加者を表示/ })).toBeNull()
  })

  it('解除すると元に戻る', () => {
    render(<ParticipantList items={many} optionGroups={groups} />)
    choose(/いいえ/)
    fireEvent.click(screen.getByRole('button', { name: '絞り込みを解除' }))

    expect(countRow().textContent).toBe('14名')
  })

  it('一致したチップを先頭へ回す。1行で切るので、後ろだと隠れる', () => {
    const p = {
      ...person(1, 'attending'),
      options: [{ question: '懇親会', name: '参加する' }, minor],
    }
    render(<ParticipantList items={[p]} optionGroups={groups} />)
    choose(/はい/)

    const chips = screen.getByRole('button', { name: '参加者1の回答を表示' })
    expect(chips.firstElementChild?.textContent).toBe('はい')
  })
})

/**
 * 切れたコメントは末尾の「…」から全文を読める。
 * 収まっているコメントには出さない（押しても同じ文が出るだけ）。
 */
describe('コメントの全文', () => {
  const comment = 'とても長いコメント'.repeat(20)
  const withComment: ParticipantView[] = [{ ...person(1, 'attending'), comment }]

  /** jsdom は幅を持たない。はみ出しと ResizeObserver を差し替える */
  const layout = (overflowing: boolean) => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(overflowing ? 500 : 100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('切れていれば「…」を押して全文を読める', async () => {
    layout(true)
    render(<ParticipantList items={withComment} />)

    fireEvent.click(await screen.findByRole('button', { name: '参加者1のコメントを全文表示' }))
    expect((await screen.findByRole('dialog')).textContent).toContain(comment)
  })

  it('収まっていれば「…」を出さない', () => {
    layout(false)
    render(<ParticipantList items={withComment} />)

    expect(screen.queryByRole('button', { name: '参加者1のコメントを全文表示' })).toBeNull()
  })
})

describe('参加者の名前', () => {
  it('プロフィールがあれば Hosteka の中のページへつなぐ', () => {
    render(
      <ParticipantList
        items={[{ ...person(1, 'attending'), profileHref: '/users/u1@example.com' }]}
      />
    )
    expect(screen.getByRole('link', { name: '参加者1' }).getAttribute('href')).toBe(
      '/users/u1@example.com'
    )
  })

  it('プロフィールが無ければ（プレビュー）リンクにしない', () => {
    render(<ParticipantList items={[person(1, 'attending')]} />)
    expect(screen.queryByRole('link', { name: '参加者1' })).toBeNull()
  })
})
