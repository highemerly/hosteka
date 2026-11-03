import type { Metadata } from 'next'

import PreEventContactScreen from '@/screens/pre-events/PreEventContactScreen'

/**
 * 回答者への連絡。
 *
 * **このページはセッションもデータも取得しない。** 誰が開けるか
 * （主催者と回答者）は API が決める。
 */
export const metadata: Metadata = {
  title: '回答者への連絡 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function PreEventContactPage({ params }: Props) {
  const { id } = await params
  return <PreEventContactScreen preEventId={id} />
}
