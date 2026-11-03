import { defineConfig, devices } from '@playwright/test'

/**
 * E2E。本番と同じイメージを e2e/compose.yml で起動した状態で回す。
 *
 * **画面の操作（クリック・入力）とリトライは入れない。** ブラウザではページが開けて
 * JS の例外が出ないことだけを見て、それ以外は API を直接呼ぶ（ページ内の fetch）。
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // 既定は実行時のカレント（リポジトリ直下）に作られるので、e2e/ の下に固定する（.gitignore 済み）
  outputDir: 'test-results',
  // 偽サーバーの記録を取り出して確かめるので、並列にしない
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    // Cookie は Secure 付き（本番イメージ）。ブラウザは localhost を安全な接続として扱うので、localhost で開く
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
