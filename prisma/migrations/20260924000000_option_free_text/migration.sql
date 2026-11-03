-- オプション・アンケートに「自由入力」を足す。
--
-- 真偽値（multipleChoice）のままでは3つ目を表せないので、回答の種類を
-- 1つの列にまとめる。**両方を並べない** — 「複数選択できる自由入力」という
-- 無い状態が作れてしまう。
ALTER TABLE "event_option_groups" ADD COLUMN "responseType" VARCHAR(20) NOT NULL DEFAULT 'single';

UPDATE "event_option_groups" SET "responseType" = 'multiple' WHERE "multipleChoice" = true;

ALTER TABLE "event_option_groups" DROP COLUMN "multipleChoice";

-- 自由入力の回答。選択式のグループでは NULL。
-- 1グループにつき1つなので、選択の行（participantId + groupId で一意）に持たせる。
ALTER TABLE "participant_group_selections" ADD COLUMN "textAnswer" VARCHAR(100);
