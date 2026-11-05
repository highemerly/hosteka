import type { NextRequest } from 'next/server'

import { preEventCard } from '@/lib/og/pre-event-card'
import { prisma } from '@/lib/prisma'
import { renderPreEventImage } from '@/server/og/render'
import { genericOgImage, versionedOgImage } from '@/server/og/respond'

/**
 * 日程調整のリンクカードの画像（OG 画像）。`og:image` は `server/metadata/pre-event.ts` が載せる。
 * 配り方（版・キャッシュ・非公開の扱い）は `server/og/respond.ts`。
 *
 * `/pre-events/*` の下に置かないのは、`next.config.ts` があそこに `private, no-store` を
 * 被せるため（CDN に持たせられない）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const preEvent = await prisma.preEvent.findUnique({
    where: { id },
    select: {
      title: true,
      location: true,
      registrationDeadline: true,
      isPublic: true,
      isDisabled: true,
      updatedAt: true,
      dateOptions: {
        orderBy: { displayOrder: 'asc' },
        select: { startDate: true, endDate: true },
      },
      creator: { select: { displayName: true } },
      organization: { select: { name: true } },
    },
  })

  if (!preEvent || preEvent.isDisabled || !preEvent.isPublic) return genericOgImage()

  return versionedOgImage(request, `/og/pre-events/${encodeURIComponent(id)}`, preEvent.updatedAt, () =>
    renderPreEventImage(preEventCard(preEvent))
  )
}
