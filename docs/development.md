# 開発

## セットアップ

Node.js は `.tool-versions` / `.nvmrc` に従う。

```bash
cp .env.example .env       # 値を埋める（NEXTAUTH_SECRET の注意書きを必ず読むこと）
npm ci
npx prisma generate        # 生成先は src/generated/prisma（postinstall では走らない）
docker compose up -d postgres
npx prisma migrate deploy
npm run seed               # 任意: 初期データ
npm run dev                # http://localhost:3000
```

管理者は `npx tsx scripts/make-admin.ts <username> <server>` で作る（画面からは作れない）。

## ブランチと PR

- **main へは直接コミット・push しない。** 変更は必ずブランチを切り、PR → CI 緑 → squash マージで
  取り込む（依存の更新を Renovate の PR で回すので、人の変更も同じ経路に揃える）
- 手元: [.githooks/pre-commit](../.githooks/pre-commit) が main 上のコミットを拒否する。clone ごとに1回有効化する:
  ```bash
  git config core.hooksPath .githooks
  ```
- サーバー側: GitHub の ruleset（定義は [.github/rulesets/main.json](../.github/rulesets/main.json)）が
  main への push を拒否する

### ruleset の中身と理由

| ルール | 設定 | 理由 |
|---|---|---|
| PR 必須 | 承認数 0 | 一人運用で、自分の PR は自分で承認できないため |
| マージ方式 | squash のみ＋linear history | 「1変更＝1コミット」の履歴を保つ |
| 必須チェック | `ci-result`（checks / e2e のうち走ったものの結果をまとめたもの） | ブランチへの push で [ci.yml](../.github/workflows/ci.yml) が付ける。ジョブは差分で間引く（下の「CI」）ので、個別に必須にするとスキップされたジョブに結果が付かずマージできなくなる |
| 最新化の強制 | しない（strict=false） | Renovate の PR が並んだとき、1件マージするたびに全件を rebase・再 CI させないため |
| force push・削除 | 禁止 | |
| バイパス | なし（管理者も対象） | |
| 作者の紐づかないコミットの追加承認 | 求めない | 省略すると true が入り、アカウントに紐づかない作者のコミットがあると自分で承認できずマージできなくなる |

ruleset を変えたら JSON を直して反映する（作成時は POST、以降は `gh api repos/highemerly/hosteka/rulesets` で id を引いて PUT）:
```bash
gh api -X POST repos/highemerly/hosteka/rulesets --input .github/rulesets/main.json
gh api -X PUT repos/highemerly/hosteka/rulesets/<id> --input .github/rulesets/main.json
```

## 依存更新（Renovate）

依存は Renovate（GitHub App）が出す PR で上げる。設定は [.github/renovate.json5](../.github/renovate.json5)（各ルールの理由はコメント）。

- **毎週月曜・木曜の 9時前（JST）** にまとめて PR が来る（lockfile の一括更新は月曜のみ）。自動マージはしない
- **メジャーは承認制。** PR は自動では来ず、Issue「Dependency Dashboard」の Pending Approval に並ぶ
  （見送っている理由: eslint 10 は eslint-config-next が使う eslint-plugin-react が未対応、TypeScript 7 は
  typescript-eslint と next typegen の追従待ち）
- Node のメジャーは Dockerfile・CI（setup-node）・`.nvmrc`・`.tool-versions`・`@types/node` が1つの PR にまとまる。
  `@types/node` だけ先に上げると、本番の Node に無い API が typecheck を通ってしまう。`engines` はそのとき手で直す
- まとめて上げるもの: prisma 一式（CLI と client・adapter は同じ版でないと動かない）、react と型定義、next と eslint-config-next
- `node:24-alpine` は digest で固定する。Alpine や Node のパッチは digest 更新の PR として来る
- 対象外: `docker-compose.yml` / `e2e/compose.yml`（DB は本番の共有 Postgres に合わせて手で上げる）

### PR が来たら

1. CI（`ci-result`）が緑か見る。赤なら ruleset でマージできない。依存の更新では checks と e2e が両方走る
2. lockfile の差分を見て、実際に入る版が変わるかを確かめる。PR 本文の変更履歴（Renovate が載せる）を読む
3. 種類に応じて確認を足す。**CI が見ているのは unit・lint・型と、E2E（本番イメージで主要なページが開けるか、
   Mastodon / Misskey のログインと投稿が偽サーバー相手に通るか）まで。Discord と X のログイン、見た目と操作は見ていない**:

   | 種類 | 例 | マージ前の確認 |
   |---|---|---|
   | 型定義・開発ツール | `@types/*`・eslint・typescript・vitest・testing-library・jsdom・@playwright/test | CI 緑ならマージ |
   | テストが本物を通るもの | jose（JWT）・ics（カレンダー）・zod・react-markdown / rehype-* | CI 緑ならマージ |
   | ビルドと表示 | next・react・tailwindcss・radix-ui・lucide-react・@tanstack/react-query・`node:24-alpine` の digest | E2E 緑で本番ビルド・起動・主要ページまでは確認済み。見た目と操作は手元で |
   | DB | prisma 一式 | ユニットテストはモック。E2E が空の DB に SQL を当てて API が応答するところまで。書き込みは手元で |
   | 0.x のもの | class-variance-authority・@tailwindcss/typography・server-only | 0.x はマイナーでも互換を崩すことが多いのに Renovate はメジャー扱いしない。変更履歴を読む |
   | ログイン・投稿に関わるもの | cookies-next | E2E 緑で Mastodon / Misskey のログインと投稿までは確認済み。Discord・X は手元で |
   | タグ時にしか動かない Actions | docker/login-action・docker/metadata-action・peter-evans/create-pull-request | PR の CI では動かない。次のリリースの docker-build.yml で初めて動く |
4. squash マージする
5. 手元で入れ直す（`npm ci` は生成済みの Prisma クライアントごと node_modules を消すので generate も要る）:
   ```bash
   git switch main && git pull
   npm ci
   npx prisma generate
   ```
   `.tool-versions` の node が上がったときは `asdf install` も行う

### 承認待ち（メジャー）の片付け方

- 着手するときに Dashboard のチェックを入れる → PR が作られる。一度に多く承認せず1つずつ
- CI が落ちたら、その Renovate のブランチ（`renovate/...`）に直接コミットを足して直す。人のコミットが入った
  ブランチは Renovate が以後書き換えない

### その他

- 今は要らない更新: PR を閉じる（その版は作り直されない。次の版が出れば再び PR になる）。恒久的に止めるなら renovate.json5 にルールを足す
- 急ぐ更新（セキュリティ修正など）: Dashboard の Awaiting Schedule でチェックを入れると、スケジュールを待たずに PR が作られる
- 手元で `npm update` はしない（Renovate の PR とぶつかる）。依存の追加はブランチを切って PR で

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm test` | ユニットテスト（vitest, 1回実行） |
| `npm run test:watch` | ユニットテスト（watch） |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run openapi` | `openapi.json` を作り直す |
| `npm run seed` / `seed:dummy` | シード投入 |
| `npm run deploy:migrate` | `prisma migrate deploy` |

**変更後は `npm test` / `npm run lint` / `npm run typecheck` の3つを通すこと。** これが CI のゲートと同一。

## CI

[ci.yml](../.github/workflows/ci.yml) が main 以外のブランチへの push で、**差分が影響しうるジョブだけ**を回す。
判定は [ci-targets.sh](../.github/scripts/ci-targets.sh)（main との merge-base からの差分ファイルで決める。
`.github/scripts/ci-targets.sh <ブランチ名>` で手元でも試せる）。

| 変更 | checks（vitest / eslint / tsc） | e2e |
|---|---|---|
| `src/**`・依存（package.json・lockfile）・Dockerfile・next.config・prisma など、下に無いもの全部 | ✓ | ✓ |
| `e2e/**` | ✓ | ✓ |
| ワークフロー（checks.yml / e2e.yml） | そのワークフローのジョブだけ | 同左 |
| ドキュメント（`*.md`・`docs/**`）・`.claude/**`・`.githooks/**`・ruleset・Renovate 設定・LICENSE・docker-build.yml | – | – |
| `release/*` ブランチ（バージョンの bump だけ） | – | – |

- 結果は `ci-result` に集まる（main の必須チェックはこれだけ）。成功とスキップは通し、失敗とキャンセルは落とす
- **main への push では回さない。** マージ前に同じ中身をブランチで通しているため
- **タグ push（リリース）では全部回す。** [docker-build.yml](../.github/workflows/docker-build.yml) が
  checks をビルドと並べて回し、E2E は push したイメージそのもので回す。全部が緑のときだけデプロイの PR を出す。
  ブランチで省いた検査で壊れていた場合は、ここで止まる
- イメージのビルドは、タグのビルドがレジストリに積む `buildcache` をブランチの E2E も読む

## E2E

ブランチで、本番と同じイメージをビルドし、使い捨ての Postgres と偽 Fediverse サーバーと一緒に起動して
Playwright を回す（[e2e.yml](../.github/workflows/e2e.yml)。イメージは push しない）。
**画面の操作（クリック・入力）とリトライは入れない。** ブラウザではページが開けて JS の例外と CSP 違反が
無いことだけを見て、それ以外は API を直接呼ぶ（ページ内の fetch）。

| ファイル | 見ること |
|---|---|
| [smoke.spec.ts](../e2e/smoke.spec.ts) | 未ログインの主要なページが開けて JS の例外が出ない、API が空の DB で応答する、キャッシュのヘッダ |
| [og.spec.ts](../e2e/og.spec.ts) | イベントの OG 画像が版付きの絶対URLで載り、1200×630 の PNG を長く持たせる。版が違えばリダイレクト。非公開とイベント以外のページには共通の画像（`/og/default`） |
| [visibility.spec.ts](../e2e/visibility.spec.ts) | 非公開のイベント・日程調整は、未ログインには API も画面も head（題名・説明・OGP）も出ない |
| [fediverse.spec.ts](../e2e/fediverse.spec.ts) | 偽の Mastodon / Misskey 相手に、ログイン・権限の頼み方・前のトークンの失効（Misskey）・投稿・予約投稿・権限不足の返し方。ログイン後の主要なページ |

- **偽 Fediverse サーバー**（[e2e/fakeverse/server.mjs](../e2e/fakeverse/server.mjs)）: 標準ライブラリだけで書き、
  受けたリクエストを記録する。テストは管理用の口（:58080）から取り出して、本物のクライアントが送るものと同じものが
  届いたかを見る。TEST-NET（198.51.100.0/24）に置く（外向きの通信のガードはプライベートアドレスを断るが、TEST-NET は通す）。
  証明書は毎回 [gen-certs.sh](../e2e/fakeverse/gen-certs.sh) が作り、アプリは `NODE_EXTRA_CA_CERTS` で信頼する
- ログインは認可画面を通さず、認可 URL からコールバックの URL を組み立てて開く。Cookie は Secure 付きなので
  ブラウザに任せる（localhost を安全な接続として扱うのはブラウザだけ）
- **Discord と X は確かめていない。** 宛先が固定（discord.com・api.x.com）で、偽サーバーに向けるには本番の
  コードに抜け道が要るため
- マイグレーションは SQL を psql で流す（本番イメージは Prisma の CLI を積まない）
- E2E の結果も `ci-result` に入る（＝落ちたらマージできない）

手元でも同じ手順で動く:
```bash
npx playwright install chromium     # 初回だけ
e2e/fakeverse/gen-certs.sh
docker compose -f e2e/compose.yml up -d --build --wait
docker compose -f e2e/compose.yml exec -T postgres sh /migrate.sh
npx playwright test -c e2e/playwright.config.ts
docker compose -f e2e/compose.yml down -v
```

## リリース

1. バージョンの bump もブランチ → PR でマージする（`release/vX.Y.Z`。CI は何も回さない）。
   マージ後の main にタグを打って push する（タグは ruleset の対象外）:
   ```bash
   git switch main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z
   ```
2. タグの push で [docker-build.yml](../.github/workflows/docker-build.yml) が動く:
   1. **検査を全部回す**（ブランチで差分により省いたものも）。checks はビルドと並走し、
      E2E は **push したイメージそのもの**で回す（作り直したイメージで通っても、デプロイするものの確認にならない）
   2. イメージを `X.Y.Z`・`X.Y`・`latest` で GHCR へ push する。ビルドのときに公開URL（`PUBLIC_URL`）を
      `NEXTAUTH_URL` として渡す（静的なページにリンクカードの画像の絶対URLを焼き込むため）。**イメージは検査の結果を待たずに push され、
      `latest` も動く。本番は版を固定していて、`latest` はデプロイに使わない**
   3. 全部が緑のときだけ **GitHub Release** を作る（タグごと・パッチも含む）。Release がある版＝デプロイしてよい版
   4. 同じ条件で、k8s のマニフェスト（k8sg1-repo）へ「Update hosteka to X.Y.Z」の PR を出す（ラベル `app-update`）
3. **k8sg1 の PR のマージがそのまま本番へのデプロイになる**（Flux が約1分で反映）。k8sg1 には必須チェックが無いので、
   k8sg1 の CI が緑かを目で見てからマージする

### GitHub Release のノート

GitHub の自動生成（前回のタグからマージされた PR の一覧と Full Changelog・英語）。分類は
[.github/release.yml](../.github/release.yml) で、Renovate の PR（`dependencies` ラベル）を
`Dependencies` に、それ以外を `Changes` に分ける。同じノートを k8sg1 の PR 本文にも使う。

- **前回のタグを明示している**（`previous_tag_name`）。省くと GitHub は前回の「Release」を起点にするが、
  v2.0.1 以前は Release を作っていない
- `.github/release.yml` は、ノートを作る対象のコミット（タグの位置）から読まれる

### マイグレーション

**マイグレーションは自動では走らない。** k8sg1 の PR に `requires-migration` が付いていたら、
DB のバックアップを取り、port-forward して手元から `npm run deploy:migrate` を当ててから
PR をマージする（順番は「マイグレーション → イメージ差し替え」。PR の本文にコマンドが載る）。

**列やテーブルを消すマイグレーションは2回に分ける。** 当ててから差し替えるまでの間、
古いコードが消えた列を読んで止まる。それを読まない版を先に出してから当てる。

### うまくいかないとき

- **k8sg1 に PR が出ない**: `create-k8s-pr` のログを見る。マニフェストの `image:` の行が書き換わらなかった
  （マニフェストの書式が変わった）ときは、わざと赤で止めている。検査が赤なら、そもそも `release` と
  `create-k8s-pr` は動かない
- **イメージを作り直したい**: Actions から docker-build.yml を手で実行する（`workflow_dispatch`）。
  入力はそのままイメージタグと k8s マニフェストの版になるので、`v` を付けずに `2.0.2` のように入れる。
  このときは GitHub Release を作らない（タグが無い・既にある）
