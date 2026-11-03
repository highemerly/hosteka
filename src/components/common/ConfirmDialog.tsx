'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  /** 実行ボタンのラベル。既定は「OK」（destructive なら「削除する」） */
  confirmLabel?: string
  cancelLabel?: string
  /** 破壊的操作。実行ボタンが destructive 配色になる */
  destructive?: boolean
  /**
   * 前へ進める操作（承認など）。実行ボタンが primary 配色になる。
   * `destructive` と併せて指定したら destructive が勝つ
   */
  primary?: boolean
  /**
   * 指定するとこの文字列を入力するまで実行ボタンが押せない。
   * アカウント削除やBANなど、取り返しのつかない操作に使う。
   */
  confirmationPhrase?: string
}

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void }

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

/**
 * `window.confirm()` の置き換え。
 *
 * ネイティブの confirm はスタイルが当たらず、モバイルで無視されることがあり、
 * スクリーンリーダーの読み上げ順も制御できない。Radix の AlertDialog は
 * フォーカストラップ・ESC・role/aria を備える。
 *
 * Promise を返す形にしてあるので、既存の
 *   `if (!confirm('...')) return`
 * を
 *   `if (!(await confirm({ title: '...' }))) return`
 * と最小差分で置き換えられる。
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [phrase, setPhrase] = useState('')
  const pendingRef = useRef<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve }
      pendingRef.current = next
      setPhrase('')
      setPending(next)
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok)
    pendingRef.current = null
    setPending(null)
    setPhrase('')
  }, [])

  const phraseSatisfied = !pending?.confirmationPhrase || phrase === pending.confirmationPhrase

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        // ESC や外側クリックで閉じた場合も「キャンセル」として解決させる。
        // ここで解決し損ねると await が永久に返らない。
        onOpenChange={(open) => {
          if (!open && pendingRef.current) settle(false)
        }}
      >
        {pending && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.title}</AlertDialogTitle>
              {pending.description ? (
                <AlertDialogDescription asChild>
                  <div>{pending.description}</div>
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>

            {pending.confirmationPhrase && (
              <div className="space-y-2">
                <Label htmlFor="confirm-phrase">
                  続行するには <code className="font-mono font-semibold">{pending.confirmationPhrase}</code> と入力してください
                </Label>
                <Input
                  id="confirm-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'キャンセル'}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!phraseSatisfied}
                onClick={() => settle(true)}
                /*
                  className で destructive のクラスを足すと、Slot が
                  default の分と連結するだけで打ち消してくれず、
                  中立色の面が残って赤が薄まる。variant で渡す。
                */
                variant={
                  pending.destructive ? 'destructive' : pending.primary ? 'primary' : 'default'
                }
              >
                {pending.confirmLabel ?? (pending.destructive ? '削除する' : 'OK')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm は ConfirmDialogProvider の内側で使ってください')
  }
  return confirm
}
