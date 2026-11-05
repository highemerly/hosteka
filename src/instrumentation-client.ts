import { z } from 'zod'

/*
  ブラウザで、アプリのコードより先に1回だけ走る（Next の instrumentation-client）。

  **zod に `eval` を試させない。** zod 4 は速く検証するために、最初の検証で
  `new Function("")` が使えるかを試す。CSP（`next.config.ts`）は `eval` を
  許していないので失敗し、zod はそれを握り潰して遅い方へ倒れるが、
  **ブラウザは握り潰された失敗も CSP 違反として報告する**（E2E が拾う）。
  `jitless` にすると、試さずに初めから遅い方を使う。画面で検証するのは
  フォームと URL のクエリ程度なので、速さの差は見えない。
*/
z.config({ jitless: true })
