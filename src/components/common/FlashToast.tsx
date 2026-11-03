'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { takeFlash } from '@/lib/flash'

/**
 * 読み直した先で、預けてあった知らせ（`lib/flash.ts`）を1回だけ出す。
 *
 * layout に1つだけ置く。どのページに着いても出るので、
 * 行き先ごとに受け取り口を書かなくてよい。
 * （`<Toaster>` との前後は問わない。sonner は購読前に出たトーストも
 * 購読時に再生する。）
 */
export function FlashToast() {
  React.useEffect(() => {
    const flash = takeFlash()
    if (!flash) return
    if (flash.type === 'success') toast.success(flash.message)
    else toast.error(flash.message)
  }, [])

  return null
}
