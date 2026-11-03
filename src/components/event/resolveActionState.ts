import type { EventActionState } from './EventAction'

/**
 * イベントと閲覧者の状態から、参加操作の状態を導く。
 *
 * 分岐が多く、順序を間違えると「中止されたイベントに参加できる」といった
 * 事故になる。画面から切り離してテストできるようにしてある。
 *
 * 判定の順序には意味がある:
 *   1. 幹事      … 主催者は中止後も管理する必要がある
 *   2. イベントの状態（中止・終了）… 参加以前の問題
 *   3. 回答済み  … 締切後も自分の状態は見える必要がある（欠席を含む）
 *   4. 未ログイン
 *   5. 資格・締切・定員
 */
export function resolveEventActionState(input: {
  status: string
  isEnded: boolean
  registrationDeadline: string | null
  maxParticipants: number | null
  attendingCount: number
  allowParticipationRequest: boolean
  viewer: {
    isAuthenticated: boolean
    isOrganizer: boolean
    participationStatus: string | null
    isEligible: boolean
    ineligibleReason?: 'platform' | 'server' | null
  }
  now?: Date
}): EventActionState {
  const now = input.now ?? new Date()
  const { viewer } = input

  // 主催者は中止後も参加者への連絡などで管理を続ける
  if (viewer.isOrganizer) return { kind: 'host' }

  if (input.status === 'cancelled') return { kind: 'cancelled' }
  if (input.isEnded) return { kind: 'ended' }

  /*
    締切後・満員でも、自分が回答済みならその状態を見せる。
    ここを後ろに置くと「参加しているのに満員と表示される」ことになる。

    **欠席も回答として扱う。** 「参加していない」と「まだ答えていない」を
    同じ姿にすると、欠席と答えた人に再び参加登録を促すことになるし、
    答えを変える入口も消える。
    cancelled は「回答を取り消した」なので未回答に戻す。
  */
  const current = viewer.participationStatus
  if (current && current !== 'cancelled') {
    return {
      kind: 'registered',
      status: current as 'attending' | 'maybe' | 'participation_request' | 'not_attending',
    }
  }

  if (!viewer.isAuthenticated) return { kind: 'anonymous' }

  // プラットフォームやサーバーの条件を満たさない場合は登録できない。
  // closed（締切後）と混ぜない。締切は待てば分かるが、こちらは
  // 何をしても参加できない
  if (!viewer.isEligible) {
    return { kind: 'ineligible', reason: viewer.ineligibleReason ?? null }
  }

  /*
    締切後。**参加リクエストは締切を通り抜ける**（participate の
    ルートが isParticipationRequest を締切チェックから外している）。
    受け付けているのに「回答締切を過ぎました」とだけ出していたので、
    利用者からは締め切られたようにしか見えなかった。
  */
  if (input.registrationDeadline && new Date(input.registrationDeadline) < now) {
    return input.allowParticipationRequest ? { kind: 'requestable' } : { kind: 'closed' }
  }

  const isFull =
    input.maxParticipants != null && input.attendingCount >= input.maxParticipants
  if (isFull) {
    return input.allowParticipationRequest ? { kind: 'requestable' } : { kind: 'full' }
  }

  return { kind: 'open' }
}
