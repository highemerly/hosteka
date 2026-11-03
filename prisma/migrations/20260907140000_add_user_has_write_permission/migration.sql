-- 投稿の権限を持つトークンかどうか。
-- NULL は「分からない」を表す（この列より前にログインしたユーザー）。
-- 既存行を false で埋めない: 実際には権限を持っている人まで
-- 「権限が要ります」と言われ、不要な入り直しを強いることになる。
ALTER TABLE "users" ADD COLUMN "hasWritePermission" BOOLEAN;
