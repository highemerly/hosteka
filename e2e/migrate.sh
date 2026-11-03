#!/bin/sh
# prisma/migrations の SQL を、名前（＝日時）の順に当てる。Postgres のコンテナの中で動く。
# _prisma_migrations の記録は残さない（使い捨ての DB なので要らない）。
set -eu
for f in /migrations/*/migration.sql; do
  psql -q -v ON_ERROR_STOP=1 -U hosteka -d hosteka -f "$f"
done
echo "applied $(ls /migrations/*/migration.sql | wc -l) migrations"
