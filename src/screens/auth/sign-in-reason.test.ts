import { describe, expect, it } from 'vitest'

import { signInReason } from './sign-in-reason'

describe('ログインが要る理由', () => {
  it('弾かれた画面から用件を引く', () => {
    expect(signInReason('/events/create')).toBe('イベントを作成する')
    expect(signInReason('/pre-events/create')).toBe('日程調整を作成する')
    expect(signInReason('/events/abc123/edit')).toBe('イベントを編集する')
    expect(signInReason('/pre-events/abc123/contact')).toBe('参加者へ連絡する')
    expect(signInReason('/dashboard/my-events')).toBe('マイページを開く')
  })

  /** 詳細ページと作成ページは形が似ている。取り違えると説明が食い違う */
  it('作成ページを詳細ページと取り違えない', () => {
    expect(signInReason('/events/create')).not.toBe('イベントに参加登録する')
    expect(signInReason('/events/abc123')).toBe('イベントに参加登録する')
  })

  it('ハッシュタグ一覧では何も言わない', () => {
    expect(signInReason('/events/hashtag/温泉')).toBeNull()
    expect(signInReason('/hashtags/温泉')).toBeNull()
  })

  it('クエリ文字列が付いていても引ける', () => {
    expect(signInReason('/dashboard/my-events?scope=past')).toBe('マイページを開く')
  })

  it('直接ログイン画面へ来た人には用件を決めつけない', () => {
    expect(signInReason(null)).toBeNull()
    expect(signInReason('/')).toBeNull()
    expect(signInReason('/faq')).toBeNull()
  })

  /** 戻り先は外から来る。自サイトの相対パス以外は読まない */
  it('外部サイトの URL からは引かない', () => {
    expect(signInReason('https://evil.example/events/create')).toBeNull()
    expect(signInReason('//evil.example/events/create')).toBeNull()
  })
})
