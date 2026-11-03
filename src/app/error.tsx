"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSerializedDatabaseConnectionError } from "@/lib/errors";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDatabaseError = isSerializedDatabaseConnectionError(error);

  /*
    問い合わせ用の識別子。**初回の描画で一度だけ決める。**
    以前は ref に書いて読み返していたが、描画中の ref の読み書きは
    React の規則から外れる（`react-hooks/refs`）。遅延初期化なら
    一度しか走らず、再描画でも値が変わらない。
  */
  const [errorId] = useState(() => {
    const unixtime = Math.floor(Date.now() / 1000);
    const prefix = isDatabaseError ? "#db" : "#general";
    return error.digest
      ? `${prefix}.${unixtime}.${error.digest}`
      : `${prefix}.${unixtime}`;
  });

  useEffect(() => {
    console.error(`Page error (${errorId}):`, error);
  }, [error, errorId]);

  if (isDatabaseError) {
    return <DatabaseErrorPage reset={reset} errorId={errorId} />;
  }

  return <GeneralErrorPage reset={reset} errorId={errorId} />;
}

/**
 * データベース接続エラー専用ページ
 */
function DatabaseErrorPage({
  reset,
  errorId,
}: {
  reset: () => void;
  errorId: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-card text-card-foreground rounded-xl shadow-lg p-8 text-center">
        <div className="mb-6">
          {/* サーバー/データベースアイコン */}
          <svg
            className="mx-auto h-16 w-16 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-4">
          接続できません
        </h1>
        <p className="text-muted-foreground mb-6">
          サービスは一時的に利用できない状態です。
          <br />
          しばらく時間をおいてから再度お試しください。
          <br />
          ご迷惑をおかけしていることをお詫びいたします。
        </p>

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
          >
            再読み込み
          </button>
          <Link
            href="/"
            className="block w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
          >
            トップページに戻る
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{errorId}</p>
      </div>
    </div>
  );
}

/**
 * 一般的なエラーページ（データベース接続エラー以外）
 */
function GeneralErrorPage({
  reset,
  errorId,
}: {
  reset: () => void;
  errorId: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-card text-card-foreground rounded-xl shadow-lg p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-4">
          エラーが発生しました
        </h1>
        <p className="text-muted-foreground mb-6">
          ページの読み込み中にエラーが発生しました。
          <br />
          問題が続く場合は、しばらく時間をおいてから再度お試しください。
        </p>

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
          >
            再読み込み
          </button>
          <Link
            href="/"
            className="block w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
          >
            トップページに戻る
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{errorId}</p>
      </div>
    </div>
  );
}
