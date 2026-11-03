import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api/client'

import AccountSettingsScreen from './AccountSettingsScreen'

/**
 * 設定画面。
 *
 * **本題は SNS の行の作り。** プラットフォームによって画面に出る欄が
 * 違う（X と Discord はサーバー欄を出さない）ので、切り替えたときに
 * 欄と値がずれると「保存できないのに、どこが悪いか画面に出ない」になる。
 */
const profileState: { data?: unknown; isPending: boolean; error?: unknown } = {
  data: undefined,
  isPending: false,
}

vi.mock('@/lib/api/queries/account', () => ({
  useAccountProfile: () => profileState,
  useUpdateAccountProfile: () => ({ mutate: vi.fn(), isPending: false }),
}))
// UnsavedChangesGuard が useRouter を呼ぶ。app router はテストに無い
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({
    viewer: {
      id: 'user_1',
      name: 'テスト太郎',
      username: 'taro',
      server: 'example.social',
      platform: 'mastodon',
    },
    status: 'authed',
  }),
}))

const PROFILE = {
  bio: '',
  email: null,
  socialAccounts: [] as { platform: string; username: string; server: string }[],
  homepageUrls: [] as string[],
}

beforeEach(() => {
  profileState.data = PROFILE
  profileState.isPending = false
  profileState.error = undefined
})

const addSocial = () => screen.queryByRole('button', { name: 'SNSを追加' })
const addHomepage = () => screen.queryByRole('button', { name: 'ホームページを追加' })
const platformTrigger = (n: number) =>
  screen.getByRole('combobox', { name: `${n}件目のプラットフォーム` })

describe('設定画面', () => {
  it('節の見出しを並べる', () => {
    render(<AccountSettingsScreen />)
    for (const title of ['プロフィール', '連絡先']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
  })

  /** 連絡の取り先は1つの節にまとめる。メール・ホームページ・SNSは同じ役 */
  it('連絡先の節に、メール・ホームページ・SNSを並べる', () => {
    render(<AccountSettingsScreen />)
    expect(screen.queryByRole('heading', { name: 'SNSアカウント' })).toBeNull()
    for (const label of ['メールアドレス', 'ホームページ', 'SNSアカウント']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('題名はプロフィール設定', () => {
    render(<AccountSettingsScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'プロフィール設定' })).toBeTruthy()
  })

  /*
    保存ボタンの対象にならない項目が1つだけ混ざると、同じ画面の中で
    保存の意味が2通りになる。テーマの切り替えはヘッダーにある。
  */
  it('テーマの切り替えは置かない', () => {
    render(<AccountSettingsScreen />)
    expect(screen.queryByRole('heading', { name: '表示' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'システム設定に従う' })).toBeNull()
  })

  /*
    連絡先を書く欄が本人にしか見えないのか誰でも見られるのかは、
    画面を見ても分からない。知らずに書くと取り返しがつかない。
  */
  it('メールアドレスの公開はONのまま切り替えられない', () => {
    render(<AccountSettingsScreen />)
    const toggle = screen.getByRole('switch', { name: 'ログインユーザー全員に公開する' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
  })

  /*
    ユーザーページでは「メイン」として一覧の先頭に並ぶ。設定画面に
    無いと「なぜ出ているのか」「どこで消すのか」が分からない。
    値は OAuth から同期しているものなので、触らせない。
  */
  describe('ログインに使っているアカウント', () => {
    it('最初から入っていて、触れない', () => {
      render(<AccountSettingsScreen />)

      const username = screen.getByLabelText('メインのユーザー名') as HTMLInputElement
      expect(username.value).toBe('@taro')
      expect(username.disabled).toBe(true)

      const server = screen.getByLabelText('メインのサーバー') as HTMLInputElement
      expect(server.value).toBe('example.social')
      expect(server.disabled).toBe(true)
    })

    it('「メイン」の札を出す。ユーザーページと同じ語', () => {
      render(<AccountSettingsScreen />)
      expect(screen.getByText('メイン')).toBeTruthy()
    })

    it('プラットフォームは選び直せない', () => {
      render(<AccountSettingsScreen />)
      expect(screen.queryByRole('combobox', { name: 'メインのプラットフォーム' })).toBeNull()
      expect(screen.getByLabelText('メインのプラットフォーム').textContent).toContain('Mastodon')
    })

    it('削除できない', () => {
      render(<AccountSettingsScreen />)
      expect(screen.queryByRole('button', { name: 'メインを削除' })).toBeNull()
    })

    /** 追加した行とは別枠。保存の本文には入らない */
    it('追加の行とは別に数える', () => {
      render(<AccountSettingsScreen />)
      expect(screen.getByLabelText('メインのユーザー名')).toBeTruthy()
      expect(screen.queryByLabelText('1件目のユーザー名')).toBeNull()
    })
  })

  describe('SNSのアカウント', () => {
    it('保存済みの行を出す。Fediverse にはサーバー欄が付く', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: [{ platform: 'mastodon', username: 'taro', server: 'mastodon.social' }],
      }
      render(<AccountSettingsScreen />)

      expect(screen.getByLabelText('1件目のユーザー名')).toBeTruthy()
      expect(screen.getByLabelText('1件目のサーバー')).toBeTruthy()
    })

    /*
      X と Discord には「サーバー」が無い。欄を消すことで、
      「x.com と入れる」という説明そのものも要らなくなる。
    */
    it('X と Discord にはサーバー欄を出さない', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: [
          { platform: 'twitter', username: 'taro', server: 'x.com' },
          { platform: 'discord', username: 'taro', server: 'discord.com' },
        ],
      }
      render(<AccountSettingsScreen />)

      expect(screen.queryByLabelText('1件目のサーバー')).toBeNull()
      expect(screen.queryByLabelText('2件目のサーバー')).toBeNull()
    })

    it('プラットフォームを選べる', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: [{ platform: 'mastodon', username: 'taro', server: 'mastodon.social' }],
      }
      render(<AccountSettingsScreen />)
      expect(platformTrigger(1)).toBeTruthy()
    })

    it('追加を押すと行が増える', () => {
      render(<AccountSettingsScreen />)
      expect(screen.queryByLabelText('1件目のユーザー名')).toBeNull()

      fireEvent.click(addSocial()!)
      expect(screen.getByLabelText('1件目のユーザー名')).toBeTruthy()
    })

    it('削除を押すと行が減る', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: [{ platform: 'mastodon', username: 'taro', server: 'mastodon.social' }],
      }
      render(<AccountSettingsScreen />)

      fireEvent.click(screen.getByRole('button', { name: '1件目を削除' }))
      expect(screen.queryByLabelText('1件目のユーザー名')).toBeNull()
    })

    /** 「5件までです」と断るより、できない状態を作らない */
    it('上限に達したら追加ボタンを出さない', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: Array.from({ length: 5 }, () => ({
          platform: 'misskey',
          username: 'taro',
          server: 'misskey.io',
        })),
      }
      render(<AccountSettingsScreen />)
      expect(addSocial()).toBeNull()
    })

    it('上限のひとつ前までは追加ボタンを出す', () => {
      profileState.data = {
        ...PROFILE,
        socialAccounts: Array.from({ length: 4 }, () => ({
          platform: 'misskey',
          username: 'taro',
          server: 'misskey.io',
        })),
      }
      render(<AccountSettingsScreen />)
      expect(addSocial()).toBeTruthy()
    })
  })

  describe('ホームページ', () => {
    it('追加を押すと行が増える', () => {
      render(<AccountSettingsScreen />)
      fireEvent.click(addHomepage()!)
      expect(screen.getByLabelText('1件目のホームページ')).toBeTruthy()
    })

    it('2件で追加ボタンを出さない', () => {
      profileState.data = {
        ...PROFILE,
        homepageUrls: ['https://a.test', 'https://b.test'],
      }
      render(<AccountSettingsScreen />)
      expect(addHomepage()).toBeNull()
    })
  })

  it('自分のページへのリンクを出す', () => {
    render(<AccountSettingsScreen />)
    expect(
      screen.getByRole('link', { name: 'あなたのページを見る' }).getAttribute('href')
    ).toBe('/users/taro@example.social')
  })

  it('未ログインならログインへ案内する', () => {
    profileState.data = undefined
    profileState.error = new ApiClientError({
      code: 'UNAUTHENTICATED',
      message: 'ログインが必要です',
      status: 401,
    })
    render(<AccountSettingsScreen />)
    expect(screen.getByText('プロフィール設定を開くにはログインが必要です。')).toBeTruthy()
  })
})
