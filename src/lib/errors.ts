/**
 * データベース接続エラーを表すカスタムエラークラス
 * このエラー名はシリアライズ後もクライアント側で識別可能
 */
export class DatabaseConnectionError extends Error {
  constructor(message: string = "データベースに接続できません", cause?: Error) {
    super(message);
    this.name = "DatabaseConnectionError";
    this.cause = cause;
  }
}

/**
 * シリアライズされたエラーオブジェクトからデータベース接続エラーかを判定
 * (クライアントサイドのerror.tsxで使用)
 *
 * **ここに Prisma を持ち込まないこと。** このファイルは error.tsx /
 * global-error.tsx（どちらもクライアント）が読む。`Prisma` を値として
 * import すると生成クライアントがブラウザ側のチャンクに入り、
 * `node:module` を解決できずに**本番ビルドだけが落ちる**
 * （テストも lint も typecheck も通るので気づくのはビルドの時）。
 * Prisma のエラー型を見たい判定は server/http/db-errors.ts にある。
 */
export function isSerializedDatabaseConnectionError(error: Error): boolean {
  // エラー名での判定（カスタムエラーがthrowされた場合）
  if (error.name === "DatabaseConnectionError") {
    return true;
  }

  // Prismaエラー名での判定
  if (error.name === "PrismaClientInitializationError") {
    return true;
  }

  return false;
}
