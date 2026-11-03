'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { pageRange } from './pagination-range'

/**
 * ページ送り。
 *
 * PC はページ番号を並べ、モバイルは前後と現在地だけにする。
 * 狭い画面に番号を詰めると、指の幅より小さい的が並ぶ。
 *
 * 1ページに収まるときは何も出さない。押せない矢印は迷わせるだけ。
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  // SSR では false。番号なしの姿から始まり、マウント後に番号が出る
  const isWide = useMediaQuery('(min-width: 640px)')

  if (totalPages <= 1) return null

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="ページ送り">
      <Button
        variant="default"
        size="icon"
        aria-label="前のページ"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>

      {isWide ? (
        pageRange(page, totalPages, 1).map((item, i) =>
          item === 'gap' ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="w-6 text-center text-sm text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'primary' : 'default'}
              size="icon"
              aria-label={`${item}ページ目`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )
      ) : (
        <span className="px-2 text-sm text-muted-foreground" aria-live="polite">
          {page} / {totalPages}
        </span>
      )}

      <Button
        variant="default"
        size="icon"
        aria-label="次のページ"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  )
}
