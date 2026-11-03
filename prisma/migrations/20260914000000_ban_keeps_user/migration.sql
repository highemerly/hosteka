-- BAN を「削除」から「停止」に変える。
--
-- これまでの BAN は users の行を消して banned_users に名前だけを残していた。
-- そのため BAN の根拠になった通報も、主催していたものも、参加の記録も
-- cascade で一緒に消え、reason しか残らなかった。
--
-- 停止したユーザーを指す列を足す。**既存の行は NULL のまま**
-- （当人はもう居ないので指しようがない）。再登録を止める判定は
-- username+server で行っており、そちらは変わらないので NULL でも効く。
--
-- ユーザーが別の理由で消えたときは SET NULL。停止の記録ごと消えると
-- 同じ名前で入り直せてしまう。
ALTER TABLE "banned_users" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "banned_users_userId_key" ON "banned_users"("userId");

ALTER TABLE "banned_users" ADD CONSTRAINT "banned_users_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
