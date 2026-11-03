-- ログインした場所（Cloudflare の訪問者位置ヘッダ）。
-- 既存の行と、CF を通さない経路では NULL のまま。
-- 画面は NULL の欄を出さない（「不明」を並べても読む意味がない）。
ALTER TABLE "sessions" ADD COLUMN "country" VARCHAR(2);
ALTER TABLE "sessions" ADD COLUMN "region" VARCHAR(64);
