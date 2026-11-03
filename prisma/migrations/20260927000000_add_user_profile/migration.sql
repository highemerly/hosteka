-- ユーザーが自分で書くプロフィール。
--
-- **users に初めて入る「OAuth 同期値でない列」。** これまでの列は全部、
-- ログインのたびに相手のサーバーから受け取ったもので、Hosteka 側で
-- 書き換えるものは1つも無かった。ログインのたびに消えないよう、
-- OAuth のコールバック（src/app/api/v1/auth/callback/*）の upsert は
-- この4列に触れないこと。

-- 自己紹介（Markdown）。表示は SafeMarkdown を通す
ALTER TABLE "users" ADD COLUMN "bio" TEXT;

-- 連絡先のメールアドレス。254 は RFC 5321 のアドレス長上限。
--
-- **ユニークにしない。** 同じ連絡先を複数人が書くことはあるし、
-- 一意にすると 409 が「そのアドレスは登録済み」という存在オラクルになる。
ALTER TABLE "users" ADD COLUMN "email" VARCHAR(254);

-- 他のSNSのID（最大5）と、ホームページのURL（最大2）。
--
-- **JSON を Text に入れる。** events.hashtags / users.ipAddresses と同じ形。
-- 専用テーブルにしないのは、同じプラットフォーム・同じIDの重複を許す仕様の
-- ため一意キーが張れず、行の同一性が surrogate id しか無くなること。
-- すると保存が差分（id を往復させるか、毎回消して作り直す）になり、
-- 「開いて保存しただけで消える」事故の経路が増える。
--
-- 件数の上限はアプリ側（src/schemas/user.ts）が持つ。検索はしない。
ALTER TABLE "users" ADD COLUMN "socialAccounts" TEXT;
ALTER TABLE "users" ADD COLUMN "homepageUrls" TEXT;
