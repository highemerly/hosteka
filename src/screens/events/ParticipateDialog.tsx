'use client'

import * as React from 'react'
import { Check, CircleHelp, CircleSlash, Clock, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OptionGroupField } from '@/components/ui/option-group'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { ToggleField } from '@/components/ui/toggle-switch'
import { Notice } from '@/components/common/Notice'
import SafeMarkdown from '@/components/SafeMarkdown'
import { ApiClientError } from '@/lib/api/client'
import { allowedUserTargets, type ParticipantStatus } from '@/lib/status-transition'
import { useParticipate } from '@/lib/api/queries/events'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import type { EventDetailDto } from '@/server/serializers/event'

/**
 * 参加登録・変更モーダル。
 *
 * 新規と変更で構造は同じ。文言と初期値だけが変わる。
 * 別々に作ると片方だけ項目が増えて食い違う。
 */
/**
 * 画面で選べる参加状態。
 *
 * **キャンセルもここに含める。** 以前は確認つきの別モーダルに分けていたが、
 * 「変更しに来た人」と「取りやめに来た人」は同じ入口から来るので、
 * 分けると一度閉じて別のボタンを探させることになっていた。
 *
 * `participation_request` は**自分では選べない**。「参加する」を選んだ結果
 * として満員なら自動でリクエストになる。ただし**今そこに居ることはある**ので、
 * 現在値としては並べる（承認は自分で出せないので選び直せる先が無い）。
 */
type ParticipateChoice =
  | 'attending'
  | 'maybe'
  | 'participation_request'
  | 'not_attending'
  | 'cancelled'

/** セグメントに並べる順。**どの状態から開いても同じ並び**にする */
const CHOICE_ORDER: ParticipateChoice[] = [
  'attending',
  'maybe',
  'participation_request',
  'not_attending',
  'cancelled',
]

const CHOICE_LABEL: Record<ParticipateChoice, string> = {
  attending: '参加',
  maybe: '未定',
  participation_request: '参加リクエスト',
  not_attending: '欠席',
  cancelled: 'キャンセル',
}

/**
 * コメントの手本。
 *
 * **書く中身を並べるのではなく、コメントそのものを見せる。**
 * 「遅れての参加や、途中で抜ける予定など」のような要件の並べ方だと、
 * 幹事への申告欄に見える。ここは参加者一覧に出る一言なので、
 * そこに並んでいておかしくない文をそのまま置く。
 *
 * **回答ごとに変える。** 来る人と来られない人では書くことが違う。
 * 一つにまとめると片方に寄った促しになる。
 */
const COMMENT_PLACEHOLDER: Record<ParticipateChoice, string> = {
  attending: '楽しみです！',
  // リクエストはまだ参加が決まっていないが、書くことは参加と同じ
  participation_request: '楽しみです！',
  maybe: '調整中です！',
  not_attending: '参加される方は楽しんでください！',
  cancelled: '参加される方は楽しんでください！',
}

/**
 * 選択肢に添える記号。
 *
 * **意味の違いは色ではなくこれで示す。** 選択中の塗りは「今どれを
 * 選んでいるか」を表すものなので、選択肢によって色を変えると
 * 「選んでいるのに塗られていない」状態が生まれて読みにくい。
 * ラジオボタンが、どの選択肢を選んでも同じ色で塗られるのと同じ。
 */
const CHOICE_ICON: Record<ParticipateChoice, React.ComponentType<{ className?: string }>> = {
  attending: Check,
  maybe: CircleHelp,
  participation_request: Clock,
  not_attending: X,
  cancelled: CircleSlash,
}

/** 参加としての意思表示。オプションや規約同意が要るのはこの3つだけ */
const ACTIVE_CHOICES: ParticipateChoice[] = ['attending', 'maybe', 'participation_request']

export function ParticipateDialog({
  event,
  open,
  onOpenChange,
  mode,
  preview = false,
}: {
  event: EventDetailDto
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  /**
   * 作成前プレビュー。**中身は本番とまったく同じものを描く。**
   * オプションの並びや参加規約の見え方は、主催者が作る前に
   * 確かめたいものの中でもとくに間違えやすい。
   * 送信だけを止める（保存先のイベントがまだ無い）。
   */
  preview?: boolean
}) {
  const editing = mode === 'edit'
  const participate = useParticipate(event.id)

  const mine = event.viewer.participation
  /*
    **記録があるかどうかと、表示上の状態は別。**
    一度キャンセルすると status は cancelled になるが行は残る。
    ここで「未登録＝新規作成」と決めつけて POST すると、サーバーが
    「既に参加登録されています」を返して再登録できなくなる。
    HTTP メソッドは記録の有無で決める。
  */
  const isUpdate = mine !== null

  /** 今の回答。記録が無ければ null（キャンセル済みも「今の回答」である） */
  const current = (mine?.status ?? null) as ParticipantStatus | null

  /*
    選べる回答。

    **遷移の規則は lib/status-transition.ts が持つ。** ここに書き写すと、
    片方だけ直したときに「選べるのに送ると失敗する選択肢」が生まれる。
    実際にそれをやって、画面からは欠席を選べるのにサーバーが弾く状態に
    なっていた。
  */
  const offered: ParticipateChoice[] = [
    'attending',
    ...(event.allowMaybe ? (['maybe'] as const) : []),
    'not_attending',
  ]
  const allowed: string[] = current ? allowedUserTargets(current) : offered
  /** 回答として選び直せる先。キャンセルは別に足す */
  const answerChoices = offered.filter((c) => allowed.includes(c))
  /*
    **今の状態が選び直せる先に無いときは、その状態自身を並べる。**
    参加リクエスト中の人がこれに当たる（承認は自分で出せない）。
    並べないと、どこも選ばれていないセグメントを見ることになる。
  */
  const keepCurrent =
    current !== null &&
    current !== 'cancelled' &&
    !answerChoices.includes(current as ParticipateChoice)
  /*
    取りやめ。**回答と同じ列に並べる。**
    以前は確認つきの別モーダルに分けていたので、変更しに来た人は
    一度閉じて別のボタンを探すことになっていた。
  */
  const canCancel =
    current !== null && current !== 'cancelled' && allowed.includes('cancelled')

  const offeredSet = new Set<ParticipateChoice>(answerChoices)
  if (keepCurrent) offeredSet.add(current as ParticipateChoice)
  if (canCancel) offeredSet.add('cancelled')
  const choices = CHOICE_ORDER.filter((c) => offeredSet.has(c))

  /** 回答として選べる先（キャンセルを除く）。初期値と「内容のみ」の判定に使う */
  const answerable: ParticipateChoice[] = choices.filter((c) => c !== 'cancelled')

  /*
    回答を選び直せない。**選べる先が「今の状態」しかない**ということ
    （参加中の人は、この画面からは内容しか直せない）。

    件数だけで見てはいけない。選べる先が1つでも、それが今の状態と違うなら
    再登録なので、**送れなければならない**（キャンセルしたあと、「未定」を
    受け付けないイベントでは「参加」1つになる）。
  */
  const contentOnly = answerable.length === 1 && answerable[0] === current

  /** 開いたときに選ばれている回答。**キャンセルは初期値にしない** */
  const initialStatus: ParticipateChoice =
    current && answerable.includes(current as ParticipateChoice)
      ? (current as ParticipateChoice)
      : (answerable[0] ?? 'attending')

  /*
    画面で選ぶ状態。`participation_request` は満員時に送信側で読み替える。

    **初期値は「今の回答」にする。** 開いた状態でマウントされることが
    あるので（プレビューやテスト）、下の戻し処理だけに任せると
    選ばれていない選択肢が出る。
  */
  const [status, setStatus] = React.useState<ParticipateChoice>(initialStatus)
  const [comment, setComment] = React.useState(editing ? (mine?.comment ?? '') : '')
  /*
    オプションの初期値。**変更のときは今の回答を引き継ぐ** — 空で開くと、
    開いて閉じただけで選択が消える。

    **下の戻し処理だけに任せない。** 開いた状態でマウントされることがあり
    （プレビューやテスト）、そのときは戻し処理が走らないので、
    選んであるはずの選択肢がどこにも塗られていない画面になる。
  */
  const initialSelections = (): Record<string, string[]> =>
    editing
      ? Object.fromEntries(
          event.optionGroups.map((g) => [
            g.id,
            g.options.filter((o) => mine?.selectedOptionIds.includes(o.id)).map((o) => o.id),
          ])
        )
      : {}

  const initialTexts = (): Record<string, string> =>
    editing ? (mine?.optionTextAnswers ?? {}) : {}

  const [selections, setSelections] = React.useState<Record<string, string[]>>(initialSelections)
  /** 自由入力の回答。`{ グループID: 本文 }` */
  const [texts, setTexts] = React.useState<Record<string, string>>(initialTexts)
  const [agreed, setAgreed] = React.useState(false)

  /*
    モーダルを開くたびに現在の値へ戻す。閉じて開き直したときに
    前回の入力が残っていると、意図しない内容で送信される。

    **描画中に戻す** — effect で戻すと、前回の入力を一度描いてから
    差し替わる（`react-hooks/set-state-in-effect`）。
  */
  const [lastOpened, setLastOpened] = React.useState<typeof mine | false>(open ? mine : false)
  if (open ? lastOpened !== mine : lastOpened !== false) {
    setLastOpened(open ? mine : false)
    if (open) {
      setStatus(initialStatus)
      setComment(editing ? (mine?.comment ?? '') : '')
      setSelections(initialSelections())
      setTexts(initialTexts())
      // 規約は登録のたびに同意させる。前回の同意を引き継がない
      setAgreed(editing && (mine?.termsAccepted ?? false))
    }
  }

  /** 取りやめを選んでいる。オプションも規約も要らない（コメントは書ける） */
  const cancelling = status === 'cancelled'
  /*
    欠席のときはオプションも規約同意も要らない。
    参加しない人に規約への同意を求めるのは筋が通らないし、
    サーバー側も欠席には同意を要求しない。
  */
  const isActive = ACTIVE_CHOICES.includes(status)

  const hasTerms = Boolean(event.terms) && isActive
  /*
    単一選択のグループは必ず1つ選ぶ必要がある。

    **自由入力は求めない。** 書くことが無い人に書かせる欄になるし、
    サーバーも空欄を「答えなかった」として扱う。
  */
  const missingRequired =
    isActive &&
    event.optionGroups
      .filter((g) => g.responseType === 'single')
      .some((g) => !selections[g.id]?.length)
  const tooLong = comment.length > VALIDATION_LIMITS.PARTICIPANT_COMMENT
  // 自由入力の上限。送ってもサーバーが弾くので、押す前に止める
  const answerTooLong =
    isActive &&
    Object.values(texts).some((t) => t.length > VALIDATION_LIMITS.OPTION_TEXT_ANSWER)
  const canSubmit =
    !preview && (!hasTerms || agreed) && !missingRequired && !tooLong && !answerTooLong

  const blockedReason = preview
    ? 'プレビューでは登録できません'
    : missingRequired
    ? '選択が必要な項目があります'
    : hasTerms && !agreed
      ? '参加規約への同意が必要です'
      : tooLong
        ? `コメントは${VALIDATION_LIMITS.PARTICIPANT_COMMENT}文字以内で入力してください`
        : answerTooLong
          ? `回答は${VALIDATION_LIMITS.OPTION_TEXT_ANSWER}文字以内で入力してください`
          : null

  /*
    参加リクエストになる場面か。

    **満員だけではない。締切後もリクエストになる。**（`resolveActionState`
    と同じ規則。サーバーの participate ルートはリクエストだけを
    締切チェックから外している。）満員しか見ていなかったので、
    締切後に「参加をリクエスト」から開くと `attending` を送ってしまい、
    サーバーに弾かれていた。

    **まだ回答していない人だけが対象。** 既に参加・未定で答えている人は
    普通の変更として扱う（変更のたびにリクエストへ落ちてしまう）。
    取り消した人（cancelled）は未回答と同じ。
  */
  const isFull =
    event.maxParticipants != null && event.counts.attending >= event.maxParticipants
  const isClosed = Boolean(
    event.registrationDeadline && new Date(event.registrationDeadline) < new Date()
  )
  const unanswered = !mine || mine.status === 'cancelled'
  const requestOnly = event.allowParticipationRequest && unanswered && (isFull || isClosed)

  /*
    ボタンに、何で回答することになるのかを書く。
    「登録する」だけだと、上のセグメントを見直さないと確かめられない。
  */
  /*
    送る状態。**内容の手直しでは今の状態を変えない。**
    参加リクエスト中の人はここが `attending` に落ちていて、内容を直そうと
    すると承認を自分で出すことになり、サーバーに弾かれていた。
  */
  const submitStatus: ParticipantStatus = cancelling
    ? 'cancelled'
    : requestOnly
      ? 'participation_request'
      : contentOnly && current
        ? current
        : status

  const submitLabel = cancelling
    ? '参加をキャンセルする'
    : requestOnly
      ? '参加をリクエストする'
      : contentOnly
        ? '内容を保存する'
        : `${CHOICE_LABEL[status]}で回答する`

  const submit = () => {
    participate.mutate(
      {
        input: {
          status: submitStatus,
          comment: comment.trim() || undefined,
          selectedGroupOptions: selections,
          groupTextAnswers: texts,
          // 規約があるイベントはサーバーが同意を要求する。
          // 送り忘れると常に「参加規約への同意が必要です」で弾かれる
          ...(hasTerms ? { termsAccepted: agreed } : {}),
        },
        isUpdate,
      },
      {
        onSuccess: () => {
          toast.success(
            cancelling
              ? '参加をキャンセルしました'
              : editing
                ? '参加内容を変更しました'
                : '参加登録しました'
          )
          onOpenChange(false)
        },
        onError: (e) => {
          // フィールド単位の日本語文言がサーバーから返る
          toast.error(
            e instanceof ApiClientError
              ? (e.details?.[0]?.message ?? e.message)
              : cancelling
                ? 'キャンセルに失敗しました'
                : '登録に失敗しました'
          )
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 項目が縦に積まれるので、PCでは幅を取る。
          狭いと規約の枠が細長くなって読めない */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          {/* 「参加登録」と書くと、押せば参加できると読める */}
          <DialogTitle>
            {editing ? '参加内容の変更' : requestOnly ? '参加リクエスト' : '参加登録'}
          </DialogTitle>
          <DialogDescription>{event.title}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {/*
            **回答の前に読ませる。** 送ったあとに「実は確定ではなかった」と
            分かるのでは遅い。押す前に目に入る位置に置く。
          */}
          {requestOnly ? (
            <Notice title="この登録では参加は確定しません">
              <p>
                主催者が承認すると参加が確定します。承認されるまでは参加者一覧に
                「参加リクエスト」として載ります。
              </p>
            </Notice>
          ) : null}

          <div>
            <span className="mb-2 block text-sm font-medium">出欠回答</span>
            {requestOnly ? (
              /*
                **選択肢を並べない。** 満員・締切後は「参加」で送っても
                サーバーが弾く。選べるのに送ると失敗する選択肢を出さない。
              */
              <p className="text-sm text-foreground">
                参加リクエスト
                <span className="text-muted-foreground">
                  {' '}
                  {isFull
                    ? 'として送ります（定員に達しているため）'
                    : 'として送ります（回答締切を過ぎているため）'}
                </span>
              </p>
            ) : (
              <SegmentedControl
                aria-label="出欠回答"
                value={status}
                onValueChange={setStatus}
                options={choices.map((value) => {
                  const Icon = CHOICE_ICON[value]
                  return {
                    value,
                    label: (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <Icon className="size-4" />
                        {CHOICE_LABEL[value]}
                      </span>
                    ),
                    // どの選択肢でも塗りは同じ。塗りは「選択中」の印であって
                    // 「良い選択肢」の印ではない
                    tone: 'primary' as const,
                  }
                })}
                className="h-13 w-full"
              />
            )}
          </div>

          {/*
            取りやめると何が起きるか。**選んだその場で読ませる。**
            確認の別モーダルに送ると、読む前に「はい」を押す人が出る。

            **本文は規約があるときだけ。** 以前は「回答が削除されます」を
            並べていたが、キャンセルを選んだ人にとって回答が消えるのは
            そうしようとしていること自体で、知らせることが無い。
            規約のほうは、押したあとに主催者とのやり取りが残りうる
            という、画面を見ても分からない話なので残す。
          */}
          {cancelling ? (
            <Notice tone="danger" title="参加をキャンセルします">
              {event.terms ? '規約に従った対応が必要となる場合があります' : null}
            </Notice>
          ) : null}

          {/*
            **キャンセルでも書かせる。** 以前は隠していたが、キャンセルは
            記録の削除ではない（行は `cancelled` として残り、参加者一覧にも
            CSV にも出る）。隠していたせいで、参加のときに書いた
            「楽しみにしています」がそのまま送られ、キャンセルの札の下に
            残っていた。ここを出せば、書き直すことも消すこともできる。

            **公開されることは欄の名前で言う。** 画面を見ても分からず、
            間違えると困る（幹事への私信のつもりで書く）ので、
            書いておくべきことに当たる。ただし注意書きにはしない —
            キャンセルのときだけ注意すると、他の回答なら公開されないと
            読める。公開なのは回答によらず同じなので、欄の名前が言う。

            手本は回答ごとに変える（`COMMENT_PLACEHOLDER`）。
          */}
          <div>
            <label htmlFor="participate-comment" className="mb-2 block text-sm font-medium">
              コメント（任意・参加者一覧に公開）
            </label>
            <Textarea
              id="participate-comment"
              rows={3}
              placeholder={COMMENT_PLACEHOLDER[status]}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {comment.length} / {VALIDATION_LIMITS.PARTICIPANT_COMMENT}
            </p>
          </div>

          {/* オプションはグループごとに単一選択／複数選択が変わる。
              チェックボックスとラジオは使わず、セグメントと選択チップで表す */}
          {isActive && event.optionGroups.length > 0 ? (
            <div>
              {/* 主催者が設定する側（EventFormScreen）と同じ呼び方にする。
                  片方だけ「オプション」だと、同じものを指していると分からない */}
              {/*
                **公開されることは欄の名前で言う。** コメントと同じで、
                ここに書いた答えは参加者一覧に出る。注意書きにはしない
                （選択式でも同じなので、自由入力のときだけ断ると
                選択式なら公開されないと読める）。
              */}
              <span className="mb-2 block text-sm font-medium">
                オプション・アンケート（参加者一覧に公開）
              </span>
              <div className="space-y-4 rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-3">
                {event.optionGroups.map((g) => (
                  <OptionGroupField
                    key={g.id}
                    group={g}
                    value={selections[g.id] ?? []}
                    onChange={(next) =>
                      setSelections((prev) => ({ ...prev, [g.id]: next }))
                    }
                    text={texts[g.id] ?? ''}
                    onTextChange={(next) => setTexts((prev) => ({ ...prev, [g.id]: next }))}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* 参加規約は全文を出す。「同意する」トグルだけ見せて中身を読ませないのは
              同意として成立しない。長いことがあるので枠の中でスクロールさせる。

              **Markdown として描く。** 主催者は Markdown が使える欄として
              書いているので、素の文字で出すと `##` や `- ` が記号のまま並び、
              見出しも箇条書きも潰れて読めない。詳細ページの規約モーダル
              （EventDetailView）と同じ `SafeMarkdown` を通す。 */}
          {isActive && event.terms ? (
            <div className="space-y-2">
              <span className="block text-sm font-medium">参加規約</span>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2">
                <SafeMarkdown>{event.terms}</SafeMarkdown>
              </div>
              <ToggleField
                label="参加規約に同意する"
                description="同意しないと登録できません"
                checked={agreed}
                onCheckedChange={setAgreed}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {/* 押せない理由が分かるようにしておく。無効なボタンだけ出すと
              なぜ押せないのか探させることになる */}
          {blockedReason ? (
            <span className="text-xs text-muted-foreground sm:mr-auto sm:self-center">
              {blockedReason}
            </span>
          ) : null}
          {/* 主要動線のボタンと同じ大きさにする。モーダルの中だけ小さいと
              押しにくいうえ、決定の操作に見えない */}
          <Button
            variant="default"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
          {/* 取りやめは戻せない操作なので色でも分ける
              （docs/DESIGN_GUIDELINES.md の destructive） */}
          <Button
            variant={cancelling ? 'destructive' : 'primary'}
            className="w-full sm:w-auto sm:min-w-40"
            disabled={!canSubmit || participate.isPending}
            onClick={submit}
          >
            {participate.isPending ? '送信中…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
