import type { Metadata } from 'next'

import DashboardScreen from '@/screens/dashboard/DashboardScreen'

/**
 * マイページ。
 *
 * **セッションもDBのデータも取得しない。** 以前はここで `getSession()` を
 * 呼び、prisma を9本叩いて統計を組み立てていた。それだと出力HTMLが
 * 閲覧者ごとに変わりキャッシュできない。中身は
 * `GET /api/v1/dashboard` をクライアントから1往復で取る。
 */
export const metadata: Metadata = {
  title: 'マイページ - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'あなたのイベント管理ダッシュボード。作成したイベントや参加予定のイベントを一覧できます。',
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  return <DashboardScreen />
}
