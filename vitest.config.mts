import { defineConfig } from 'vitest/config'
import path from 'path'

// 'server-only' は「クライアントから import されたら落ちる」ためのマーカーで、
// Next.js は react-server 条件で空実装に解決する。vitest は素の node 解決なので
// 例外を投げる側を掴んでしまう。テストでは無害な空モジュールに差し替える。
const alias = {
  '@': path.resolve(import.meta.dirname, './src'),
  'server-only': path.resolve(import.meta.dirname, './src/test/server-only-stub.ts'),
}

/**
 * 2プロジェクト構成。
 *
 * - node:  純ロジック・サービス層・APIルート。DOM を必要としない。
 *          APIルートのテストは実 NextRequest を組み立てて route.ts の export を直接呼ぶ。
 *          DB は使わず `vi.mock('@/lib/prisma')` で境界をモックする（CIにサービスコンテナを置かない）。
 * - jsdom: コンポーネント。拡張子 .test.tsx で振り分ける。
 *
 * **@vitejs/plugin-react は置かない。** JSX の変換は Vite 8 が tsconfig の
 * `jsx: "react-jsx"` を見て自前で行う。プラグインの仕事は Fast Refresh で、
 * テストには要らない。足すと peer で @babel/core 8 を連れてきて、
 * eslint-plugin-react-hooks / shadcn が使う 7 と衝突する。
 */
/*
  **テストは UTC で回す。**

  このアプリは「すべて JST」で作られているが、動く場所は JST とは限らない。
  本番のサーバーは UTC、利用者の端末はその土地の時刻帯。にもかかわらず
  開発機（JST）でテストすると、`toLocaleString('ja-JP')` の書き忘れも、
  「JSTの壁掛け時計 Date」と本物の瞬間を混ぜた比較も、**全部通ってしまう**。
  ずれるのは本番だけなので、気づくのは利用者に指摘されたとき。

  ここを UTC に固定すると、開発機の結果が CI（ubuntu-latest も UTC）と
  一致し、時刻帯に依存したコードはその場で落ちる。実際にこの固定で
  5件の潜在バグが表に出た（削除可能までの残り時間が9時間ずれる、など）。

  時刻を固定するテストでは `new Date('2024-06-15T12:00:00+09:00')` のように
  **オフセットまで書くこと。** 付けないと「実行環境のローカル12:00」になり、
  結局ここで固定した意味が無くなる。
*/
process.env.TZ = 'UTC'

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // カバレッジの分母は「ユニットテストで守ると決めた範囲」に限定する。
      // import されていないファイルも 0% として可視化されるよう include を明示する。
      include: ['src/lib/**', 'src/server/**', 'src/app/api/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      // 閾値は設けない。CIでも実行しない（ローカルの可視化ツールとして扱う）。
    },
  },
})
