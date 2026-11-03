import type { Metadata } from 'next'

import PreEventFormScreen from '@/screens/pre-events/PreEventFormScreen'

/**
 * 日程調整の作成。
 *
 * **このページはセッションもデータも取得しない。** 未ログインの扱いは
 * API が決める（保存時に401が返り、クライアントがサインインへ送る）。
 * proxy.ts の Cookie チェックは認可ではなく、弾かれる画面を
 * 読み込ませないための UX。
 */
export const metadata: Metadata = {
  title: '日程調整を作成 - Hosteka',
  robots: { index: false },
}

export default function CreatePreEventPage() {
  return (
    <PreEventFormScreen />
  )
}
