import type { NextRequest } from 'next/server'

import { eventCard } from '@/lib/og/event-card'
import { prisma } from '@/lib/prisma'
import { renderEventImage } from '@/server/og/render'
import { genericOgImage, versionedOgImage } from '@/server/og/respond'

/**
 * イベントのリンクカードの画像（OG 画像）。`og:image` は `server/metadata/event.ts` が載せる。
 * 配り方（版・キャッシュ・非公開の扱い）は `server/og/respond.ts`。
 *
 * `/events/*` の下に置かないのは、`next.config.ts` があそこに `private, no-store` を
 * 被せるため（CDN に持たせられない）。`defineRoute` に載せないのは、応答が JSON の
 * エンベロープではなく画像だから。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      title: true,
      startDate: true,
      startTime: true,
      hasStartTime: true,
      endDate: true,
      endTime: true,
      hasEndTime: true,
      location: true,
      status: true,
      isPublic: true,
      isDisabled: true,
      updatedAt: true,
      creator: { select: { displayName: true } },
      organization: { select: { name: true } },
    },
  })

  if (!event || event.isDisabled || !event.isPublic) return genericOgImage()

  return versionedOgImage(request, `/og/events/${encodeURIComponent(id)}`, event.updatedAt, () =>
    renderEventImage(eventCard(event))
  )
}
