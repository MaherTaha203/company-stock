#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the isolated CI PostgreSQL database}"

item_id="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "INSERT INTO public.items (code, name, unit, opening_quantity) VALUES ('CI-CONCURRENCY-' || replace(gen_random_uuid()::text, '-', ''), 'CI concurrency test item', 'piece', 1) RETURNING id")"
movement_sql="SELECT public.record_stock_movement('$item_id', 'out', 1, current_date, 'concurrency test');"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$movement_sql" >/tmp/company-stock-concurrency-1.log 2>&1 &
pid1=$!
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$movement_sql" >/tmp/company-stock-concurrency-2.log 2>&1 &
pid2=$!

set +e
wait "$pid1"; status1=$?
wait "$pid2"; status2=$?
set -e

if [ "$status1" -eq "$status2" ]; then
  cat /tmp/company-stock-concurrency-1.log /tmp/company-stock-concurrency-2.log
  echo "Expected exactly one concurrent outgoing movement to succeed; statuses were $status1 and $status2." >&2
  exit 1
fi

result="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT (current_quantity = 0)::text || ':' || (SELECT count(*) FROM public.movements WHERE item_id = '$item_id')::text FROM public.stock_balances WHERE id = '$item_id'")"
if [ "$result" != "true:1" ]; then
  echo "Unexpected final state after concurrent outgoing movements: $result" >&2
  exit 1
fi

echo "Concurrency test passed: exactly one outgoing movement succeeded; balance is zero and one movement exists."
