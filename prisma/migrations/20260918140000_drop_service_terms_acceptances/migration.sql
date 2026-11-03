-- 規約の同意記録テーブルを落とす。
--
-- どこからも読まれていなかった。同意した日時を見せているのは
-- users.lastTermsAcceptedAt のほうで、管理画面もアカウント画面もそちらを出す。
-- このテーブルだけが持っていたのは「どの版に同意したか」だが、
--
--   1. 初回ログインのほかに、イベント作成のたびにも version='1.0' 固定で
--      1行積まれていた。どれが同意の記録なのか区別できない
--   2. 規約は「変更後も利用を続けていれば同意したものとみなす」と定めており、
--      版ごとの同意記録を前提にしていない
--   3. どの版の時代に同意したかは、lastTermsAcceptedAt と規約の最終更新日で足りる
--
-- 初回にしか書かないものに1対多を当てていたのが、そもそも噛み合っていなかった。

-- DropForeignKey
ALTER TABLE "service_terms_acceptances" DROP CONSTRAINT "service_terms_acceptances_userId_fkey";

-- DropTable
DROP TABLE "service_terms_acceptances";
