#!/usr/bin/env bash
# 로컬 Postgres로 DB 스키마·업그레이드·권한 규칙을 시험한다. (운영 DB와 무관, 시험 전용)
#
#   tools/pg/run-sql-test.sh                      새 설치: schema.sql ×2 → seed.sql → 권한 점검
#   tools/pg/run-sql-test.sh --from <커밋> 파일...  운영 DB 재현: 그 커밋 시점 schema+seed → 지정한 upgrade ×2 → 현재 schema.sql 재실행 → 권한 점검
#   tools/pg/run-sql-test.sh --stop               시험용 Postgres 끄기
#
# 예) 운영 DB(upgrade-006까지 적용된 상태)에 새 upgrade-007을 얹어 보기:
#   tools/pg/run-sql-test.sh --from HEAD supabase/upgrade-007-xxx.sql
#   (HEAD의 schema.sql은 006까지 반영돼 있으므로 '현재 운영 상태'와 같다. 007을 schema.sql에 넣기 전 커밋을 쓰거나,
#    007 반영 전 커밋 해시를 --from 으로 준다.)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=${PGTEST_DIR:-/tmp/hub-pgtest}
PORT=${PGTEST_PORT:-5499}
DB=hubtest
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$BIN" ] || { echo "Postgres가 설치돼 있지 않습니다 (/usr/lib/postgresql/*/bin)"; exit 1; }

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ "${1:-}" = "--stop" ]; then
  as_pg "$BIN/pg_ctl -D $DIR/data stop -m fast" || true
  exit 0
fi

FROM=""
if [ "${1:-}" = "--from" ]; then FROM=${2:?커밋을 지정하세요}; shift 2; fi

if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
  as_pg "$BIN/initdb -D $DIR/data -A trust -E UTF8 --locale=C.UTF-8 >/dev/null"
fi
if ! as_pg "$BIN/pg_ctl -D $DIR/data status" >/dev/null 2>&1; then
  as_pg "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null
  sleep 2
fi

export PGOPTIONS='-c client_min_messages=warning'
P="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
cd "$ROOT"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f tools/pg/mock-supabase.sql
seed() { sed "s/YOUR_EMAIL@medialog.co.kr/admin@test.kr/"; }

if [ -z "$FROM" ]; then
  echo "== schema.sql 1회차";               $P -d $DB -f supabase/schema.sql
  echo "== schema.sql 2회차 (재실행 안전)";  $P -d $DB -f supabase/schema.sql
  echo "== seed.sql";                       seed < supabase/seed.sql | $P -d $DB
else
  echo "== $FROM 시점 schema.sql + seed.sql (운영 DB 재현)"
  git show "$FROM:supabase/schema.sql" | $P -d $DB
  git show "$FROM:supabase/seed.sql" | seed | $P -d $DB
fi

for f in "$@"; do
  echo "== $f 1회차"; $P -d $DB -f "$f"
  echo "== $f 2회차 (재실행 안전)"; $P -d $DB -f "$f"
done
if [ -n "$FROM" ]; then echo "== 현재 schema.sql 재실행"; $P -d $DB -f supabase/schema.sql; fi

echo "== 권한 점검"
$P -d $DB -f tools/pg/rls-check.sql
echo
echo "끝. DB 직접 보기: psql -h $DIR -p $PORT -U postgres -d $DB   /   끄기: tools/pg/run-sql-test.sh --stop"
