#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the isolated CI PostgreSQL database}"

item_id="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "WITH new_item AS (INSERT INTO public.items (code, name, unit, opening_quantity) VALUES ('CI-CONCURRENCY-' || replace(gen_random_uuid()::text, '-', ''), 'CI concurrency test item', 'piece', 1) RETURNING id) SELECT id FROM new_item")"
request_id_1="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT gen_random_uuid()")"
request_id_2="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT gen_random_uuid()")"
movement_sql_1="SELECT public.record_stock_movement('$item_id', 'out', 1, current_date, 'concurrency test', '$request_id_1');"
movement_sql_2="SELECT public.record_stock_movement('$item_id', 'out', 1, current_date, 'concurrency test', '$request_id_2');"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$movement_sql_1" >/tmp/company-stock-concurrency-1.log 2>&1 &
pid1=$!
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$movement_sql_2" >/tmp/company-stock-concurrency-2.log 2>&1 &
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

retry_item_id="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "WITH new_item AS (INSERT INTO public.items (code, name, unit, opening_quantity) VALUES ('CI-IDEMPOTENCY-' || replace(gen_random_uuid()::text, '-', ''), 'CI idempotency test item', 'piece', 0) RETURNING id) SELECT id FROM new_item")"
request_id="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT gen_random_uuid()")"
retry_sql="SELECT public.record_stock_movement('$retry_item_id', 'in', 1, current_date, 'same retry', '$request_id');"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$retry_sql" >/tmp/company-stock-idempotency-1.log 2>&1 &
pid1=$!
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$retry_sql" >/tmp/company-stock-idempotency-2.log 2>&1 &
pid2=$!

set +e
wait "$pid1"; status1=$?
wait "$pid2"; status2=$?
set -e

if [ "$status1" -ne 0 ] || [ "$status2" -ne 0 ]; then
  cat /tmp/company-stock-idempotency-1.log /tmp/company-stock-idempotency-2.log
  echo "Both identical concurrent requests should return successfully." >&2
  exit 1
fi

result="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT (current_quantity = 1)::text || ':' || (SELECT count(*) FROM public.movements WHERE item_id = '$retry_item_id')::text FROM public.stock_balances WHERE id = '$retry_item_id'")"
if [ "$result" != "true:1" ]; then
  echo "Unexpected final state after concurrent duplicate requests: $result" >&2
  exit 1
fi

echo "Idempotency concurrency test passed: both requests succeeded but only one movement was stored."
