-- X と Discord のアカウントを、ユーザー名ではなく不変のIDで見分ける。
--
-- **あの2つはユーザー名を変えられ、手放した名前を他人が取れる。**
-- これまで `username@server` で照合していたので、Alice が X のハンドルを
-- foo から bar に変えたあと、foo を取った Bob がログインすると
-- Alice の Hosteka アカウント（主催イベント・参加者の連絡先・グループの
-- 管理権限）にそのまま入れた。
--
-- Mastodon / Misskey / Pleroma はユーザー名を変えられないので埋めない。
-- NULL どうしは一意制約で衝突しない（Postgres は別物として扱う）。
ALTER TABLE "users" ADD COLUMN "platformUserId" TEXT;

-- Discord は保存済みのアバターURL（`/avatars/<id>/<hash>.png`）にIDが入っているので、
-- そこから埋め戻す。**アバターの無い人と X の人は埋められない** — 次に
-- ログインしたとき、ユーザー名で見つかった行へIDを書き込む（hosted-user.ts）。
--
-- 同じIDの行が複数あるのは、名前を変えた人が入り直して2つ目の行ができた跡。
-- **最後にログインした行だけにIDを入れ、古いほうの名前は退避名に変えて空ける。**
-- 古い行を名前のまま残すと、その名前を後から取った別人が引き継いでしまう
-- （退避名の形はアプリ側の `releasedUsername` と同じ。`-` は X にも
-- Discord にも使えない文字なので、本物のハンドルとは衝突しない）。
WITH candidates AS (
  SELECT
    "id",
    substring("avatar" from '^https://cdn\.discordapp\.com/avatars/([0-9]+)/') AS pid,
    "lastLoginAt",
    "createdAt"
  FROM "users"
  WHERE "server" = 'discord.com'
    AND "avatar" ~ '^https://cdn\.discordapp\.com/avatars/[0-9]+/'
),
ranked AS (
  SELECT
    "id",
    pid,
    row_number() OVER (
      PARTITION BY pid
      ORDER BY "lastLoginAt" DESC NULLS LAST, "createdAt" DESC
    ) AS rn
  FROM candidates
)
UPDATE "users" AS u
SET
  "platformUserId" = CASE WHEN r.rn = 1 THEN r.pid ELSE NULL END,
  "username" = CASE WHEN r.rn = 1 THEN u."username" ELSE u."username" || '-' || u."id" END
FROM ranked AS r
WHERE u."id" = r."id";

CREATE UNIQUE INDEX "users_server_platformUserId_key" ON "users"("server", "platformUserId");
