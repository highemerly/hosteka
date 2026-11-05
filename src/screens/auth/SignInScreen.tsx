'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, KeyRound, LogIn, ShieldCheck } from 'lucide-react'

import { Notice } from '@/components/common/Notice'
import { ConsentCheckbox } from '@/components/form/ConsentCheckbox'
import { Field, fieldAria } from '@/components/form/Field'
import { ConditionLink } from '@/components/event/ConditionLink'
import { DocumentDialog } from '@/components/legal/DocumentDialog'
import { PRIVACY_TITLE, PrivacyDocument } from '@/components/legal/PrivacyDocument'
import { TERMS_TITLE, TermsDocument } from '@/components/legal/TermsDocument'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useViewer } from '@/hooks/useViewer'
import { api, ApiClientError } from '@/lib/api/client'
import { oauthGrants, type OAuthGrant } from '@/lib/oauth-scopes'
import { readRememberedServer, rememberServer } from '@/lib/remembered-server'
import { cn } from '@/lib/utils'
import {
  PLATFORMS,
  findPlatform,
  isValidServerHost,
  normalizeServerHost,
  type LoginPlatform,
} from '@/screens/auth/sign-in-platforms'
import { signInReason } from '@/screens/auth/sign-in-reason'

const CONSENT_ID = 'terms-consent'

/**
 * 求める権限の説明。モーダルの中身。
 *
 * **並びも文言も `lib/oauth-scopes.ts` の表から出す。** register ルートが
 * 実際に要求する scope と同じ表なので、説明と要求が食い違わない。
 * 権限の名前（`read:accounts` など）も出す — 相手のサーバーの認可画面は
 * この名前で表示することがあり、見比べられる。
 */
function GrantList({ grants }: { grants: readonly OAuthGrant[] }) {
  return (
    <ul className="space-y-3">
      {grants.map((g) => (
        <li key={g.scope} className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">{g.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{g.use}</p>
          <code className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {g.scope}
          </code>
        </li>
      ))}
    </ul>
  )
}

/**
 * 認証の続きは相手のサーバー（や自サイトの別ページ）で起きる。
 *
 * **`router.push` ではなくページごと読み直す。** セッションが付くのは
 * この遷移の先なので、クライアント側のキャッシュを持ち越すと
 * ログイン前の姿が残る。コンポーネントの外に置いてあるのは、
 * 「描画中に location を書き換えない」ことを形で示すため。
 */
function hardNavigate(url: string) {
  window.location.href = url
}

/**
 * 狭い画面か。`sm`（640px）未満。
 *
 * **押した瞬間に一度だけ読む。** 使うのはクリックの時点だけなので、
 * 購読（`useMediaQuery`）して状態として持ち回る必要がない。
 */
function isNarrowViewport() {
  return window.matchMedia('(max-width: 639px)').matches
}

/**
 * プラットフォームを押したあと、次に入れるものまで送る。
 *
 * **狭い画面だけ。** 選択肢が2行を占めるので、次の入力が画面の下端か
 * その外に出る。広い画面では押した物のすぐ下に見えているので、
 * 動かすと押した位置を見失わせるだけになる。
 */
function scrollToNextStep(el: HTMLElement | null) {
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

/**
 * ログイン。
 *
 * **1枚に収める。** 旧画面は「プラットフォームを選ぶ」→「ホスト名を入れる」の
 * 2段で、戻る導線を自前で持っていた（しかも URL から指定されたときだけ
 * 隠す分岐があった）。選択肢は5つしかないので、選んだ下に続きが生えるほうが
 * 全体が一度に見える。
 *
 * この画面はセッションもデータも取得しない。ログイン済みの人がここへ来ても
 * 追い返さない — 別のアカウントで入り直したいことがある。
 */
export default function SignInScreen() {
  const searchParams = useSearchParams()

  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const urlPlatform = findPlatform(searchParams.get('platform'))?.value ?? null
  const urlServer = searchParams.get('server') ?? ''
  /**
   * 投稿の権限だけを取り直しに来た場合（連絡画面から飛ばされる）。
   * **ふつうのログインとは目的が違う**ので、そう書く。
   *
   * **読み取り／投稿を選ばせない。** ふつうのログインは読み取りのみ、
   * 取り直しは投稿の権限を足す、と来た経路で決まる。取り直しに来て
   * 読み取りのみを選ぶ理由は無い。その代わり、投稿権限を付与することは
   * 画面の上で明記する。
   */
  const upgrading = searchParams.get('requestWrite') === 'true'

  // プラットフォームは URL から選んでおく（選び直せる）。**サーバーは URL から入れない** —
  // 入っていれば、そのまま見知らぬサーバーへ送られかねない（下の fixed を参照）
  const [picked, setPlatform] = React.useState<LoginPlatform | null>(urlPlatform)
  const [typed, setServer] = React.useState('')
  const [agreed, setAgreed] = React.useState(false)
  /** 同意しないまま押された。箱の下に吹き出しを出す */
  const [consentMissing, setConsentMissing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  /** ホスト名そのものの誤り。入力欄の下に出す */
  const [serverError, setServerError] = React.useState('')
  /** 送ってみて断られた理由。入力欄の誤りとは別の面に出す */
  const [error, setError] = React.useState('')

  /** 次に入れるもの。ホスト名が要るならその欄、要らないなら規約への同意 */
  const nextStepRef = React.useRef<HTMLDivElement>(null)
  /**
   * ホスト名の欄は選んでから生えるので、**描画し終えるまで送り先が無い。**
   * 押した時点では印だけ付け、描画後の effect で送る。
   * URL から埋まった初期表示では動かさない。
   */
  const pendingScroll = React.useRef(false)
  React.useEffect(() => {
    if (!pendingScroll.current) return
    pendingScroll.current = false
    scrollToNextStep(nextStepRef.current)
  })

  const { viewer } = useViewer()
  /**
   * 投稿権限の取り直しで、アカウントが URL で決まっている。
   *
   * **プラットフォームもサーバーも選ばせない。** 取り直しはログイン中の
   * アカウントに権限を足すためのもので、ここで別のサーバーを入れると
   * 別のアカウントでログインし直すだけになり、権限は元のアカウントに付かない。
   * 利用規約への同意は、取り直しでも聞く（ふつうのログインと同じ）。
   *
   * **URL のアカウントは、ログイン中のアカウントと一致するときだけ使う。**
   * URL は誰でも作れる。一致を見ないと、選ぶ欄を隠したまま、見知らぬ
   * サーバーの認可画面へ連れて行く URL が作れてしまう。一致しなければ
   * （ログインが切れた・別のアカウントになっている・URL に足りないものがある）、
   * URL のアカウントは使わず、ふつうのログインと同じ画面に倒す。
   * viewer cookie はマウント後に読むので、一致が分かるのも1フレーム後になる。
   */
  const urlSpec = findPlatform(urlPlatform)
  const fixed =
    upgrading &&
    urlSpec?.canRequestWrite &&
    viewer &&
    viewer.platform.toLowerCase() === urlSpec.value &&
    (!urlSpec.needsServer || normalizeServerHost(urlServer) === viewer.server)
      ? { spec: urlSpec, server: viewer.server }
      : null
  const fixedAccount = fixed !== null
  const platform = fixed ? fixed.spec.value : picked
  const server = fixed ? fixed.server : typed
  const spec = findPlatform(platform)
  const write = !!spec?.canRequestWrite && upgrading
  const grants = spec ? oauthGrants(spec.value, write) : []
  const reason = signInReason(searchParams.get('callbackUrl'))

  /*
    前回そのサーバーから入ったなら、次も同じところから入ることがほとんど。
    **マウント後に読む** — localStorage はサーバー描画では読めない。
    依存はプラットフォームだけにしてある。入力を依存に入れると、
    利用者が欄を空にした瞬間に書き戻して消せなくなる。
  */
  /*
    **ブラウザにしか無いものの取り込みなので effect に置く。**
    描画から導ける値ではない（localStorage）。1フレーム空欄を見せてから
    埋まるのが正しい姿で、サーバーが描いた HTML とも食い違わない。
  */
  React.useEffect(() => {
    if (!spec?.needsServer) return
    const remembered = readRememberedServer(spec.value)
    if (!remembered) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServer((current) => current || remembered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  const selectPlatform = (next: LoginPlatform) => {
    // 選び直しでなければ何もしない。**入力済みのホスト名を消さない** —
    // 下の setServer('') は effect に読み直させるためのもので、
    // プラットフォームが変わらなければ effect は走らず、空のまま残る。
    // 描画も起きないので、送るならここで送る
    if (next === platform) {
      if (isNarrowViewport()) scrollToNextStep(nextStepRef.current)
      return
    }

    pendingScroll.current = isNarrowViewport()

    setPlatform(next)
    setError('')
    setServerError('')
    // 覚えているサーバーは上の effect が入れる。ここで空にしておかないと、
    // 前に選んでいたプラットフォームのホスト名が残る
    setServer('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!spec || submitting) return
    if (!agreed) {
      setConsentMissing(true)
      document.getElementById(CONSENT_ID)?.focus()
      return
    }

    setSubmitting(true)
    setError('')
    setServerError('')

    let host = ''
    if (spec.needsServer) {
      host = normalizeServerHost(server)
      if (!host) {
        setServerError(`${spec.label}サーバーのホスト名を入力してください`)
        setSubmitting(false)
        return
      }
      if (!isValidServerHost(host)) {
        setServerError('有効なホスト名を入力してください（例: mastodon.social）')
        setSubmitting(false)
        return
      }
    }

    try {
      const { authUrl } = await api.post<{ authUrl: string }>(spec.endpoint, {
        callbackUrl,
        // 同意はここでしか取らない。**サーバーもこれを必須にしている**
        // （`requireTermsAccepted`）ので、画面のチェックだけの約束にしない
        termsAccepted: agreed,
        ...(spec.needsServer ? { server: host } : {}),
        ...(spec.canRequestWrite ? { requestWritePermission: write } : {}),
      })

      /*
        **行き先が無いまま遷移させない。** エンベロープの取り違えで
        `authUrl` が undefined になり、`location.href = undefined` で
        `/undefined` へ飛んでいたことがある（Misskey・Discord・X で発生）。
        ここで落とせば「ネットワークエラー」として画面に出る。
      */
      if (!authUrl) throw new Error('認証URLが返りませんでした')

      if (spec.needsServer && host) rememberServer(spec.value, host)

      hardNavigate(authUrl)
    } catch (e) {
      setSubmitting(false)
      // レート制限などはサーバー側の日本語文言をそのまま出す
      setError(e instanceof ApiClientError ? e.message : 'ネットワークエラーが発生しました')
    }
  }

  /**
   * 押したあと Hosteka を離れることを、**押す物の上で**先に言う。
   * 見慣れない画面へ飛ばされたと思われないように。
   *
   * **短く言う。** 「Mastodonサーバーに移動してログイン」は狭い画面で
   * 折り返した。どこへ行くかは直前に自分で入れたホスト名なので、
   * 「サーバーで」と言えば足りる。プラットフォーム名は上で選んだまま見えている。
   */
  const submitLabel = submitting
    ? '接続しています…'
    : spec?.needsServer
      ? 'サーバーでログイン'
      : `${spec?.label ?? ''}でログイン`

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/*
        本文の左端はヘッダーと揃える（max-w-5xl）。ただし中身は選択肢と
        入力欄が1列に並ぶだけなので、読む幅だけを狭くする。
        中央寄せにしない — 画面を移った瞬間に左端が動く。
      */}
      <div className="max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {upgrading ? '投稿権限を付与' : 'ログイン'}
          </h1>
        </header>

        {/*
          **どこから弾かれて来たのかを最初に言う。** 用件のある人が何の
          説明もなくログイン画面に立たされると、押し間違えたのか機能が
          消えたのかが分からない。直接来た人には出さない（用件を決めつけない）。
        */}
        {!upgrading && reason ? (
          <Notice
            tone="attention"
            title={`${reason}には、SNS アカウントでのログインが必要です`}
          />
        ) : null}

        {/*
          **投稿権限を付与することは、押す前に明記する。** 取り直しでは
          読み取り／投稿も、アカウントも選ばせないので、ここで言わなければ
          知らないまま渡すことになる。どのアカウントかまで言う。
        */}
        {fixed ? (
          <Notice tone="attention" title="再ログインして投稿権限を付与します">
            {fixed.spec.needsServer
              ? `${fixed.server} の ${fixed.spec.label} アカウントに、Hosteka から投稿する権限を付与します。`
              : `${fixed.spec.label} アカウントに、Hosteka から投稿する権限を付与します。`}
          </Notice>
        ) : null}

        {upgrading && spec && !spec.canRequestWrite ? (
          <Notice tone="attention" title={`${spec.label}では Hosteka から直接投稿できません`}>
            ログインはできますが、連絡は本文を写して自分で投稿する形になります。
          </Notice>
        ) : null}

        <form onSubmit={submit} className="space-y-6">
          {fixedAccount ? null : (
            <div className="space-y-2">
              {/* 大きさは同意の文と揃える。ここだけ一段大きいと見出しに読める */}
              <h2 className="text-sm font-medium text-foreground">
                ログインに使うプラットフォームを選択してください
              </h2>
              <PlatformPicker value={platform} onChange={selectPlatform} />
            </div>
          )}

          {!fixedAccount && spec?.needsServer ? (
            <div ref={nextStepRef} className="scroll-mt-20">
              <Field
                label={`${spec.label}サーバーのホスト名`}
                htmlFor="server"
                required
                error={serverError}
              >
                <Input
                  {...fieldAria('server', serverError)}
                  name="server"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder={spec.placeholder}
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}

          {/*
            **選ぶまで何も出さない。** 同意の箱も押せないボタンも、
            選ぶ前には意味が無い。出しておくと、最初の画面で目に入るものが
            増えるだけになる。
          */}
          {spec ? (
            <div className="space-y-3">
              {/*
                **同意は押させる。** 以前は「ログインすると同意したものとして
                扱います」と書くだけだったが、読まずに進めるうえ、同意した
                覚えが本人に残らない。既定はオフ — 最初から入っている同意は
                同意ではない。

                同意を取るのは利用規約だけ。権限とプライバシーポリシーは
                確かめたい人が開く札にする（イベント詳細の参加条件と同じ形）。
                **同意の文中に混ぜない** — 下線の語が並ぶと、どれにも同意した
                ように読める。
              */}
              <div ref={spec.needsServer ? undefined : nextStepRef} className="scroll-mt-20">
                <ConsentCheckbox
                  id={CONSENT_ID}
                  label={
                    <>
                      <DocumentDialog trigger="利用規約" title={TERMS_TITLE}>
                        <TermsDocument />
                      </DocumentDialog>
                      に同意します
                    </>
                  }
                  checked={agreed}
                  onCheckedChange={(checked) => {
                    setAgreed(checked)
                    if (checked) setConsentMissing(false)
                  }}
                  error={consentMissing ? '利用規約への同意が必要です' : undefined}
                />
              </div>

              <div className="flex flex-wrap gap-2 px-1">
                <ConditionLink
                  icon={<KeyRound className="size-3.5" />}
                  label="必要な権限は？"
                  title={`Hosteka が ${spec.label} に求める権限`}
                >
                  <GrantList grants={grants} />
                </ConditionLink>
                <ConditionLink
                  icon={<ShieldCheck className="size-3.5" />}
                  label="個人情報はどう扱われますか？"
                  title={PRIVACY_TITLE}
                >
                  <PrivacyDocument />
                </ConditionLink>
              </div>

              {error ? (
                <Notice tone="danger" title="ログインできませんでした">
                  {error}
                </Notice>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={submitting}
              >
                <LogIn className="size-5" />
                {submitLabel}
              </Button>
            </div>
          ) : null}
        </form>

        <DevLogin />
      </div>
    </div>
  )
}

/**
 * プラットフォームの選択。
 *
 * **説明付きのカード（`ChoiceCards`）にしない。** 選択肢は名前だけで
 * 伝わるのに1行1枚で5段積むと、スマホではホスト名の欄とログインボタンが
 * 最初の画面の外へ押し出される。アイコンと名前のボタンを並べて1〜2行に収める。
 *
 * 狭い画面では3列。Fediverse の3つが1行目、X と Discord が2行目に分かれる。
 *
 * **選択済みを色だけで示さない**（docs/DESIGN_GUIDELINES.md §5）。
 * 枠と塗りに加えて、角にチェックを出す。
 */
function PlatformPicker({
  value,
  onChange,
}: {
  value: LoginPlatform | null
  onChange: (value: LoginPlatform) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="ログインに使うプラットフォーム"
      className="grid grid-cols-3 gap-2 sm:grid-cols-5"
    >
      {PLATFORMS.map((p) => {
        const selected = p.value === value
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.value)}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-medium text-foreground transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              selected
                ? 'raised-subtle border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-accent'
            )}
          >
            {selected ? (
              <span
                aria-hidden
                className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="size-3" />
              </span>
            ) : null}
            <p.icon className="size-6" aria-hidden />
            <span className="max-w-full truncate">{p.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * 開発用のログイン。
 *
 * **本番には出ない。** 相手のサーバーを立てずに画面を確かめるためだけの口で、
 * サーバー側（`dev-login`）も NODE_ENV と NEXTAUTH_URL の両方を見て拒む。
 */
function DevLogin() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  if (process.env.NODE_ENV !== 'development') return null

  const login = async (userId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.post('/api/v1/auth/dev-login', { userId })
      hardNavigate('/?login=success')
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : '開発用ログインに失敗しました')
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">開発用ログイン</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        実際の SNS 認証なしで入れます。開発環境にだけ出ます。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { id: 'user1', label: 'Alice（主催者）' },
          { id: 'user2', label: 'Bob（参加者）' },
          { id: 'user3', label: 'Charlie（観察者）' },
        ].map((u) => (
          <Button
            key={u.id}
            type="button"
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => void login(u.id)}
          >
            {u.label}
          </Button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
    </section>
  )
}
