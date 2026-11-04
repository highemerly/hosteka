# CLAUDE.md

## 概要

Fediverse の利用者向けのイベント管理（Next.js 16 / App Router）。中心は**イベント**（`/events`）と
**日程調整**（`/pre-events`）。ログインは Mastodon / Misskey / Pleroma / Discord / X の OAuth だけで、
Mastodon・Misskey・Pleroma はサーバーごとにその場でアプリを登録する。画面の文言はすべて日本語。

## ブランチ（必ず守ること）

- **main へ直接コミットしない。** 作業を始めるときにブランチを切り、PR で取り込む
  （ruleset が main への push を拒否する。手順と理由は `docs/development.md`）

## コマンド

- `npm run dev` - 開発サーバー
- `npm run build` - 本番ビルド
- `npm test` - ユニットテスト（vitest, 1回実行）
- `npm run lint` - ESLint
- `npm run typecheck` - `next typegen && tsc --noEmit`
- `npm run openapi` - `openapi.json`（APIの契約書）を作り直す

> **変更後は `npm test` / `npm run lint` / `npm run typecheck` の3つを必ず通すこと。** これが CI のゲートと同一。

## データベース

PostgreSQL（全 DateTime 列は `TIMESTAMPTZ`）。開発環境では `docker-compose.override.yml` の `postgres` サービスを使う。
スキーマを変えたら `npx prisma migrate dev` でマイグレーションを作る。

**Prisma 7（重要・必ず守ること）**

- **生成物は `src/generated/prisma`**（node_modules ではない）。**中身は TypeScript のソース**で、
  バンドルの対象になる。`.gitignore` 済み。`npx prisma generate` で作る
- **import は `@/generated/prisma/client`。** `@prisma/client` から型やモデルを取らない
- **クライアントから読める場所で、生成クライアントを値として import しない。**
  ブラウザのチャンクに入ると `node:module` を解決できず、**本番ビルドだけが落ちる**
  （テストも lint も typecheck も通る）。`Prisma.PrismaClientKnownRequestError` のような
  値が要る判定は `src/server/` に置く。走査は `src/lib/prisma-client-import.guard.test.ts`
- **接続先はスキーマに書けない。** アプリは `src/lib/prisma.ts` のドライバアダプタ
  （`@prisma/adapter-pg`）、CLI（migrate / studio）は `prisma.config.ts` が持つ
- **CLI は `.env` を読まない**（Next は読む）。seed と `scripts/` は `prisma/client.ts` を
  import する。あれが `prisma/env.ts` で Next と同じ順に読み込む

## 構成

- `src/app/` - ページと API ルート（App Router）
- `src/screens/` - 画面の本体（`page.tsx` から描く）
- `src/components/` - 画面をまたいで使う部品
- `src/server/` - サーバーだけで動くもの（認証・ルートの土台・シリアライザ・サービス）
- `src/schemas/` - Zod スキーマ（サーバーと画面で共有）
- `src/lib/` - 共有のユーティリティ
- `prisma/` - スキーマとマイグレーション

参加状態の遷移と、参加ボタンの出し分けは `docs/participation-button-behavior.md`。

**規則を画面とサーバーに書き分けない。** 「選べるのに送ると失敗する選択肢」ができる。
遷移は `src/lib/status-transition.ts`、入力規則は `src/schemas/` のように、両方が同じものから作る。

### API

- **Base path**: `/api/v1/`
- 全ルートが `defineRoute`（`src/server/http/define-route.ts`）に載っている。
  認証・入力検証（Zod）・エラー整形・レスポンス形の統一をここが引き受ける。
  **ルート内で認証チェックを手書きしない**（抜けが目視できなくなる）
- 認証モードは `auth: 'none' | 'optional' | 'required' | 'admin' | 'cron'`。
  リソースID依存の権限判定（主催者かどうか等）は `guard` で合成する
- **レスポンスは統一エンベロープ**:
  - 単体 `{ data }` / 一覧 `{ data, meta: { total, page, perPage, totalPages } }`
  - エラー `{ error: { code, message, requestId, details? } }`
  - **`message` は日本語のユーザー向け文言、`code` が機械可読の契約。**
    クライアントは `message` を文字列マッチしてはならない
- クライアントからは `src/lib/api/client.ts` の `api.get/post/put/patch/delete` を使う。
  エンベロープの剥がしと 401 時の復帰処理を引き受ける。生の `fetch` を書かない
- Zod スキーマは `src/schemas/`（isomorphic。`prisma` も `server-only` も import しない）。
  サーバーの検証とクライアントのフォーム検証で同じ定義を共有する
- Prisma モデルを画面へ渡すときは必ず `src/server/serializers/` を経由する
- **`openapi.json` は生成物。手で書かない。** 入力（params / query / body）と
  認証モードを `defineRoute` の宣言から組み立てる。ルートを足したり入力スキーマを
  変えたら `npm run openapi` で作り直してコミットする（古いままだとテストが落ちる）。
  **応答の形は載っていない** — あちらは contract テストのスナップショットが持つ

## スタイル

- Tailwind CSS v4（`src/app/globals.css` のトークン層）+ shadcn/ui
- **デザイン方針は `docs/DESIGN_GUIDELINES.md` に従うこと。** 主な制約:
  - ニューモーフィズムと Liquid Glass の併用。ただし適用面を分ける
    （操作要素＝ニューモーフィズム / 浮いている層＝ガラス / 読ませる面＝フラット）
  - 青系基調。色はすべてセマンティックトークン経由。16進やユーティリティ色名を直書きしない
  - 角丸は `rounded-lg` 統一、カードとモーダルのみ `rounded-xl`
  - ボタンは primary / default / destructive の3種のみ。用途ごとに色を増やさない
  - **チェックボックスは使わずスライドトグル**。`<input type="checkbox">` を画面側で直接書かない。
    例外は規約への同意だけ（`ConsentCheckbox`）
  - 立体表現よりコントラストを優先する（本文・ラベルとも 4.5:1 以上）

## 画面の文言（重要・必ず守ること）

**説明文を書きたくなったら、まず書かずに済ませられないかを考えること。**
レビューで毎回削られている。以下は実際に削られたもの:

> 「お使いの SNS アカウントでログインします」「サーバーのホスト名を入力します」
> 「アカウントがあるサーバーへ、ここから認証を頼みます」
> 「どんなグループなのかを書きます。グループのページに出ます」
> 「グループのサイトやSNSがあれば」「ログインすると、続きの画面へ戻ります」

守ること:

- **欄の名前で分かることを説明に書かない。** 「説明」という欄に
  「どんなグループなのかを書きます」は要らない。説明を足したくなったら、
  **まず欄の名前を直せないかを見る**
- **起きて当然のことを書かない。** ログインしたら元の画面に戻るのも、
  入力した内容が表示されるのも、書かなければ伝わらないことではない
- **できないことを先に断るより、できない状態を作らない。** 「一度も
  ログインしたことがない人は追加できません」と書くくらいなら、
  追加のときに存在を確かめてその場で言う
- 書いてよいのは**知らないと間違えること**だけ。「X のサーバーには
  `x.com` と入れる」のように、画面を見ても分からず、間違えると失敗するもの
- 選択肢の説明は**選ぶと何が変わるか**だけを書く。機能の紹介をしない

同じことが見出しにも当てはまる。節の見出しと直後の説明が同じことを
言っているなら、説明のほうを消す。

**例外は、畳んである節（`FormSection` の `collapsible`）の説明。**
中が見えないので「何が入っているか」を言う相手が他にいない
（「参加制限 … 締切・定員と、受け付ける回答の種類」）。
開いている節では、同じ文が下の欄の名前の繰り返しになる。

## セッション（重要・必ず守ること）

`jose` による自前のセッション。ログインの流れは、サーバーのホスト名を受け取る →
そのサーバーにアプリを登録 → OAuth → プロフィールの同期 → セッションの発行。
利用規約への同意はログイン画面のトグルで取り、初回だけ `users.lastTermsAcceptedAt` に記録する。

- **サーバー側のセッション取得は `getSession()`（`src/server/auth/session.ts`）に一本化**
  - `getSessionClaims()` は DB に触れない軽量版（userId / sessionId / isAdmin ヒント）
  - `getSession()` は users を1行引いてユーザー情報まで解決する
- **トークンには表示用の値も認可入力も入れない。**
  `username` / `server` / `platform` は「誰がイベントに参加できるか」を決める
  認可の入力であり、再ログイン時にしか更新されないトークンに載せると無言で陳腐化する
- **管理者判定は必ず DB で確認する**（`defineRoute` の `auth: 'admin'`）。
  トークンの `adm` は UI 出し分けのヒントに過ぎない
- Cookie は2つ。`ht-session`（httpOnly、認証の真実）と `ht-viewer`（**httpOnly でない**、
  ヘッダー表示用）。**viewer cookie はサーバーから一切参照しない**。署名もしない
  （署名は「信頼してよい」という誤ったシグナルになる）。詳しくは `docs/COOKIES.md`
- セッションの失効はプロセス内キャッシュ（`revocation-cache.ts`）で判定する。
  JWT 検証自体は DB に触れない。失効は最大1ポーリング間隔（既定30秒）で伝播する
- 「最終利用」（`sessions.lastUsedAt`）は `getSession()` が `touchSession()`
  （`session-activity.ts`）で進める。**セッションあたり最大1時間に1回**で、応答は待たせない。
  リクエストごとに書かないこと（読むだけのAPIがすべて書き込みを伴うようになる）
- **`sessions` 行の削除は失効ではない。** ユーザー削除など cascade で行が消える経路では、
  削除の**前に** `revokeUserSessions()` を呼ぶこと

### レンダリングとキャッシュ

- **`page.tsx` は `generateMetadata` のみを担う。** セッションもデータも取得しない
- データ取得はすべてクライアントから `/api/v1` 経由。これで全ページが CDN にキャッシュできる
- **サーバーセッションを Provider の初期値として渡さない。** ページがキャッシュされると
  別の人のセッションが表示される
- **RSC のフライトリクエストは公開キャッシュに載せない。** Cloudflare は
  `Accept-Encoding` 以外の `Vary` を無視するので、フライトと HTML が同じキャッシュキーに
  同居し、ログイン中のセッションが匿名へ配られる。止めているのは2箇所:
  `proxy.ts`（`Accept: text/x-component` を private に）と、`next.config.ts` の
  `RSC_MARKERS`（`rsc` ヘッダか `_rsc` クエリがあれば `CDN-Cache-Control: no-store`）。
  **`rsc` ヘッダも `_rsc` も proxy には届かない**ので、後者は proxy では書けない
- `proxy.ts` の Cookie 存在チェックは**認可ではなく UX**（弾かれるページを読み込ませない）
- **リンクカードの画像（OG 画像）は `app/og/events/[id]`。** URL に版（`?v=<updatedAt>`）を付けて CDN に
  長く持たせ、版が違えば作らずに今の版へリダイレクトする（描画は重い）。**編集しなければ変わらない値だけを
  載せる**（参加者の数などを載せると古いまま残る）。非公開・無効化には題名を含まない共通の画像を返す。
  色は `server/og/render.tsx` に sRGB で直書きしている（satori は CSS 変数も oklch も読めない）

## テストと CI（重要・必ず守ること）

- **テストは対象の隣にコロケートする**（`src/lib/foo.ts` → `src/lib/foo.test.ts`）。`tests/` ディレクトリは使わない
- vitest は2プロジェクト構成。**`*.test.ts` は node 環境、`*.test.tsx` は jsdom 環境**（`vitest.config.mts`）
- **テストDB・サービスコンテナは使わない。** 境界は `vi.mock` でモックする（最頻出は `@/lib/prisma`）。
  CI は `npm ci --ignore-scripts` で動くため、**テストが重いネイティブ依存を import すると CI が壊れる**
- API ルートのテストは実 `NextRequest` を組み立てて `route.ts` の export（`GET`/`POST`）を直接呼ぶ。HTTP サーバーは立てない
- `it()` の説明は日本語で書く

**編集画面を作ったら往復テストを書くこと。**
サーバーは受け取った本文で全体を上書きするので、`DTO → フォーム → 本文` のどこか
1箇所で項目が抜けると、**編集して保存するだけでその項目が消える**
（画面は正常に見えるので、気づくのは後日）。見本は
`src/screens/events/edit-round-trip.test.ts` と
`src/screens/pre-events/edit-round-trip.test.ts`。3つで守る:

1. **DTO → フォームの写し取りを純関数に置く**（`*-form-values.ts`）。
   画面の `reset()` の中に書くとテストから触れない
2. **全項目を埋めた DTO を1往復させ、元の値と突き合わせる。**
   `null` は往復しても `null` で通るので、見本は空にしない
3. **`Record<keyof 〜Dto, …>` で分類を型に強制する。** DTO に項目が増えると
   typecheck が落ち、「運ぶ」か「編集の対象外（理由付き）」かを決めるまで通らない

CI ワークフロー:
- `.github/workflows/checks.yml` — **ゲートの単一の定義元**（vitest → eslint → tsc）。`workflow_call` 専用。ここ以外にゲートを書かない
- `.github/workflows/e2e.yml` — 本番と同じイメージを Postgres と偽 Fediverse サーバー（`e2e/fakeverse/`）と起動して Playwright を回す（`e2e/`。画面の操作はしない。ログインと投稿は Mastodon / Misskey だけ）
- `.github/workflows/ci.yml` — main 以外のブランチへの push で、差分が影響しうるジョブだけを実行（判定は `.github/scripts/ci-targets.sh`）。結果は `ci-result` に集まり、main の必須チェックはこれだけ
- `.github/workflows/docker-build.yml` — `v*` タグ push で `checks` とビルドを並列に回し、push したイメージで `e2e` も回す。**全部緑のときだけ** GitHub Release（自動生成のノート）と k8sg1 への PR を作る

## 保存期間（重要）

プライバシーポリシーは「IPアドレスや User-Agent を含むセッション履歴・
アクセスログは90日で完全に消去する」と約束している。**守るのは
`src/server/services/purge-old-records.ts`**。k8s の CronJob が
`POST /api/v1/admin/purge-old-records` を毎日叩く。手元からは `npm run purge:old-records`。

- `users.ipAddresses` は日時を持たないので、**残ったセッションから作り直す**。
  消すだけでは、同じIPから入り続けている人の行に何年も前のIPが残る
- 認証は `auth: 'cron'`（`CRON_SECRET` を Bearer で確かめる）。cron は
  人のログインを持てないが、無認証で開けない
- **通知（`notifications`）も同じ処理が90日で消す。** こちらはポリシーの
  約束ではない（参加記録と同じサービス機能のデータ）が、放っておくと
  単調に増える。**新しい cron を増やさない**

## お知らせ（重要・必ず守ること）

運営から全員への掲示（`announcements` テーブル）。管理者が
`/admin/announcements` から作る。**通知（`notifications`）とは別物**で、
一人ひとりに宛てた出来事の記録と混ぜない。

- **「いつ出すか」の規則は `src/lib/announcements.ts` に集める。** 公開
  （`publishedAt <= now`）とバナーの掲載期間（`pinnedUntil`。未指定は公開から
  `DEFAULT_BANNER_DAYS` 日）を、サーバーと画面が同じ関数で判定する
- **時刻の判定はサーバーの `now` でやる。** 端末の時計に任せると、ずれている
  人にだけ出たり消えたりする。画面が見るのは「閉じたかどうか」だけ
- **`"low"` はバナーに出さない。** 全員の画面の上に居座らせる価値が
  あるかどうかを、重要度で決めている
- **本文が空なら詳細ページを作らない。** 一覧は題名だけを出し、リンクにしない
  （押しても同じ題名がもう一度出るだけのページへ連れて行かない）
- 閉じたバナーは Cookie（`ht-ann`）で覚える。**中身は「そのとき掲載中の id
  だけ」に入れ替える** — 足し続けると全リクエストに載ったまま太る。
  **サーバーはこの Cookie を一切参照しない**
- 公開側の一覧は `auth: 'none'` + `publicCache`。**`next.config.ts` の
  `PUBLICLY_CACHEABLE_API` と対で初めて効く**（片方だけでは何も起きない。
  `src/server/http/public-cache.guard.test.ts` が一致を見ている）

## 通知（重要・必ず守ること）

アプリ内の通知（`src/server/notifications/`）。運営から全員への告知
（上の「お知らせ」）とは**別物**で、混ぜない。

- **文言をDBに焼き込まない。** `notifications` が持つのは `kind` と値の写し
  （`payload`）だけで、日本語は `src/lib/notification-text.ts` が組み立てる。
  焼き込むと、あとから言い回しを直しても過去の行だけが古いまま残る
- **連続編集を1件にまとめるのは `foldKey`。if 文ではなく一意制約が保証する。**
  鍵に「受信者がその時点で持っていた既読位置」を入れてあるので、読む前は
  鍵が同じ＝畳まれ、読んだ後は鍵が変わって新しい行になる。畳まない種別は
  `null`（Postgres は NULL どうしを別物として扱う）。判定を書き足さないこと
- **既読位置（`users.notificationsSeenAt`）を動かすのは、ベルを開いたときと
  一覧画面を開いたときの2つだけ。** 画面遷移のたびに動かすと、畳みが
  ほとんど発火しなくなる（まとまるのは「読む前」だけなので）
- **未読は `occurredAt` で判定する。`createdAt` ではない**（`unread.ts`）。
  未読数と行の強調は必ず同じ関数を通す。境界が食い違うと
  「未読1件と出ているのに、どの行も光っていない」になる
- **編集はすべて知らせる。** 止めるのは「何も変わっていない保存」だけ
  （`src/server/events/event-change.ts`）。編集画面は開いて保存すると全項目を
  送り返してくるので、これが無いと開くたびに全参加者へ飛ぶ。
  逆に、**知らせる価値があるかをこちらで選り分けない**（名前を変えただけの編集も届ける）
- **項目の名前は `EVENT_CHANGE_LABELS`。`EVENT_FORM_FIELDS` と同じキー集合**
  なので、フォームに項目が増えると typecheck が落ちる。
  `eventColumnsFromForm` が作らない項目（規約・参加できる人・主催の名義）は
  `EXTRA_FIELD` 側で比べる。**ここから漏れると、変えても誰にも届かない**
- **日時は `getTime()` で比べる。** `!==` だと同じ日時の別インスタンスが毎回
  「変わった」になり、開いて保存しただけで全参加者に通知が飛ぶ
- ルートからの呼び出しは `notifyAfter`（`after()` で応答の後ろに回す）。
  トランザクションの外で、失敗しても本体に影響させない。**例外は
  `after()` が握り潰すので必ずログに残す**。日程調整の削除だけは例外で、
  消す前に待って送る（回答の行が消えたあとでは宛先が引けない）
- **ルートのテストでは `notifyAfter` を差し替えること。** `after()` は
  リクエストスコープの外で投げるので、handler を直接呼ぶテストからは通せない

## セキュリティ（重要・必ず守ること）

- **ユーザー情報を Client Component へ渡すときは必ず `USER_PUBLIC_SELECT`（`src/lib/select-presets.ts`）を使う。**
  Prisma の `include: { creator: true }` / `select: { user: true }` は User の全スカラーカラムを取得するため、
  `accessToken`（暗号化済みOAuthトークン）・`ipAddresses`・`isAdmin`・`lastLoginAt` が RSC ペイロード経由で
  HTML に埋め込まれる。`src/lib/select-presets.test.ts` が `src/**` を走査して違反を検出する
- **`NEXTAUTH_SECRET`（= `AUTH_SECRET`）の値を変更しないこと。** セッションの署名鍵であると同時に、
  `src/lib/crypto.ts` が `User.accessToken` を暗号化する AES-256-GCM 鍵の導出元でもある。
  ローテートすると全ユーザーの保存済みアクセストークンが復号不能になり、
  Mastodon/Misskey への投稿機能が回復不可能に壊れる（`src/server/auth/secret.ts`）

## 日時（重要・必ず守ること）

表示はすべて JST。ただし**動く場所は JST とは限らない** — 本番サーバーは UTC、
利用者の端末はその土地の時刻帯。`Date` は時刻帯を持たないので、
書き忘れると開発機（JST）でだけ正しく見え、**本番で9時間ずれる**。

- **日時の整形は `src/lib/jst.ts` を通す。** `formatJstDate` / `formatJstDateTime` /
  `formatJstTime` / `toJstDateInput` / `toJstTimeInput` / `jstParts`。
  画面やAPIで素の `toLocaleString('ja-JP')` を書かない
  （`src/lib/jst.guard.test.ts` が走査して落とす）
- **`new Date(x.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))` を書かない。**
  この形の `new Date(文字列)` は解釈が実装依存（ECMA-262）で、ミリ秒も落ちる。
  部品が欲しいなら `jstParts`
- **「JSTの壁掛け時計 Date」と本物の瞬間を混ぜない。**
  `toJST()`（`event-date-utils`）が返すのは**瞬間としては嘘**の Date で、
  ローカル getter で JST の部品を読むための入れ物。壁掛けどうしの比較は
  成り立つが、DB から来た `Date` と引き算すると非JST環境で9時間ずれる。
  **「◯時間経ったか」に時刻帯は要らない。`Date.now()` と本物の瞬間で引く**
- フォーム入力を保存するときは `+09:00` を付けて解釈する（`parseJSTDateTimeToUTC`）
- **テストは UTC で回る**（`vitest.config.mts` が `process.env.TZ` を固定）。
  時刻を固定するテストでは `new Date('2024-06-15T12:00:00+09:00')` のように
  **オフセットまで書くこと**。付けないと「実行環境のローカル12:00」になる

## Memories
- `日本語で回答して。` - Reminder to respond in Japanese when requested
