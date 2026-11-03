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
| 必須チェック | `checks / check` | ブランチへの push で [ci.yml](../.github/workflows/ci.yml) が付ける。paths で絞らない（スキップされると結果が付かず、マージできなくなる） |
| 最新化の強制 | しない（strict=false） | Renovate の PR が並んだとき、1件マージするたびに全件を rebase・再 CI させないため |
| force push・削除 | 禁止 | |
| バイパス | なし（管理者も対象） | |

ruleset を変えたら JSON を直して反映する（作成時は POST、以降は `gh api repos/highemerly/hosteka/rulesets` で id を引いて PUT）:
```bash
gh api -X POST repos/highemerly/hosteka/rulesets --input .github/rulesets/main.json
gh api -X PUT repos/highemerly/hosteka/rulesets/<id> --input .github/rulesets/main.json
```

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

## リリース

1. バージョンの bump もブランチ → PR でマージする。マージ後の main にタグを打って push する
   （タグは ruleset の対象外）:
   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
2. [docker-build.yml](../.github/workflows/docker-build.yml) がテストとイメージのビルドを並べて走らせ、
   両方が緑のときだけ k8s のマニフェスト（別リポジトリ）へ PR を出す
3. その PR をマージすると本番のイメージが替わる

**マイグレーションは自動では走らない。** PR に `requires-migration` が付いていたら、
DB のバックアップを取り、port-forward して手元から `npm run deploy:migrate` を当ててから
PR をマージする（順番は「マイグレーション → イメージ差し替え」）。

**列やテーブルを消すマイグレーションは2回に分ける。** 当ててから差し替えるまでの間、
古いコードが消えた列を読んで止まる。それを読まない版を先に出してから当てる。

`v*` のタグはすべて GHCR の `latest` を付ける。本番は版を固定しているので影響しない。
