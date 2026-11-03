/**
 * ページを読み直した先で1回だけ出す知らせ（フラッシュ）。
 *
 * **トーストは画面の読み直しを越えられない。** ログアウトやアカウント削除は
 * `window.location.href` でページ全体を読み直す（クライアント側のキャッシュに
 * ログイン中の姿を残さないため）ので、その場で `toast()` を呼んでも
 * 表示される前に消える。そこで sessionStorage に預け、着いた先の
 * `FlashToast` が1回だけ取り出して出す。
 *
 * **URL に載せない。** `/?loggedOut=1` のようにすると、公開キャッシュの
 * 対象ページに閲覧者ごとの状態が混ざり、貼られたURLで知らせが再生される。
 */

import { STORAGE_FLASH } from '@/lib/storage-keys'

export type Flash = { type: 'success' | 'error'; message: string }

const KEY = STORAGE_FLASH

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    // プライベートブラウズ等で触れないことがある。知らせが出ないだけで済ませる
    return null
  }
}

export function setFlash(flash: Flash, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(flash))
  } catch {
    // 容量超過など。知らせは失っても操作そのものは止めない
  }
}

/** 取り出して消す。**2回目は null** — 戻るで同じ知らせが出直さないように */
export function takeFlash(storage: StorageLike | null = defaultStorage()): Flash | null {
  if (!storage) return null
  let raw: string | null = null
  try {
    raw = storage.getItem(KEY)
    storage.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<Flash>
    if (
      (parsed.type === 'success' || parsed.type === 'error') &&
      typeof parsed.message === 'string' &&
      parsed.message
    ) {
      return { type: parsed.type, message: parsed.message }
    }
  } catch {
    // 壊れた値は捨てる（手で書き換えられる場所）
  }
  return null
}
