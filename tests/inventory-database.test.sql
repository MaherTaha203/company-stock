-- Runs only against the isolated PostgreSQL service in CI.
-- Every fixture is rolled back; this file must never target production.
BEGIN;

DO $$
DECLARE
  v_item_id uuid;
  v_balance numeric;
  v_unit text;
  v_movement_count integer;
  v_request_id uuid;
  v_in_request_id uuid;
  v_out_request_id uuid;
  v_first jsonb;
  v_retry jsonb;
BEGIN
  INSERT INTO public.items (code, name, unit, opening_quantity)
  VALUES ('CI-' || replace(gen_random_uuid()::text, '-', ''), 'CI inventory test item', 'piece', 0)
  RETURNING id INTO v_item_id;

  v_in_request_id := gen_random_uuid();
  v_out_request_id := gen_random_uuid();
  PERFORM public.record_stock_movement(v_item_id, 'in', 10.125, current_date, 'CI incoming', v_in_request_id);
  PERFORM public.record_stock_movement(v_item_id, 'out', 2.125, current_date, 'CI outgoing', v_out_request_id);

  SELECT current_quantity INTO v_balance
  FROM public.stock_balances WHERE id = v_item_id;
  IF v_balance <> 8.000 THEN
    RAISE EXCEPTION 'Expected balance 8.000 after incoming/outgoing, got %', v_balance;
  END IF;

  SELECT count(*) INTO v_movement_count FROM public.movements WHERE item_id = v_item_id;
  BEGIN
    PERFORM public.record_stock_movement(v_item_id, 'out', 9.000, current_date, 'must fail', gen_random_uuid());
    RAISE EXCEPTION 'TEST_EXPECTED_INSUFFICIENT_STOCK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_EXPECTED_INSUFFICIENT_STOCK' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%INSUFFICIENT_STOCK%' THEN
      RAISE EXCEPTION 'Unexpected error for overdraw: %', SQLERRM;
    END IF;
  END;

  SELECT current_quantity INTO v_balance
  FROM public.stock_balances WHERE id = v_item_id;
  SELECT count(*) INTO v_movement_count FROM public.movements WHERE item_id = v_item_id;
  IF v_balance <> 8.000 OR v_movement_count <> 2 THEN
    RAISE EXCEPTION 'Failed movement was not atomic: balance %, movements %', v_balance, v_movement_count;
  END IF;

  BEGIN
    PERFORM public.record_stock_movement(v_item_id, 'in', 1.2345, current_date, 'must fail precision', gen_random_uuid());
    RAISE EXCEPTION 'TEST_EXPECTED_INVALID_QUANTITY';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_EXPECTED_INVALID_QUANTITY' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%INVALID_QUANTITY%' THEN
      RAISE EXCEPTION 'Unexpected error for excessive precision: %', SQLERRM;
    END IF;
  END;

  v_request_id := gen_random_uuid();
  v_first := public.record_stock_movement(v_item_id, 'in', 1.000, current_date, 'retry-safe', v_request_id);
  v_retry := public.record_stock_movement(v_item_id, 'in', 1.000, current_date, 'retry-safe', v_request_id);
  IF v_first ->> 'id' IS DISTINCT FROM v_retry ->> 'id' THEN
    RAISE EXCEPTION 'Retry created a different movement ID';
  END IF;

  SELECT current_quantity INTO v_balance
  FROM public.stock_balances WHERE id = v_item_id;
  SELECT count(*) INTO v_movement_count FROM public.movements WHERE item_id = v_item_id;
  IF v_balance <> 9.000 OR v_movement_count <> 3 THEN
    RAISE EXCEPTION 'Idempotent retry changed balance or duplicated movement: balance %, movements %', v_balance, v_movement_count;
  END IF;

  BEGIN
    PERFORM public.record_stock_movement(v_item_id, 'in', 2.000, current_date, 'different payload', v_request_id);
    RAISE EXCEPTION 'TEST_EXPECTED_IDEMPOTENCY_KEY_REUSED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_EXPECTED_IDEMPOTENCY_KEY_REUSED' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%IDEMPOTENCY_KEY_REUSED%' THEN
      RAISE EXCEPTION 'Unexpected error for reused idempotency key: %', SQLERRM;
    END IF;
  END;

  BEGIN
    UPDATE public.items SET unit = 'kg' WHERE id = v_item_id;
    RAISE EXCEPTION 'TEST_EXPECTED_UNIT_GUARD';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_EXPECTED_UNIT_GUARD' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%ITEM_UNIT_IN_USE%' THEN
      RAISE EXCEPTION 'Unexpected error for historical unit change: %', SQLERRM;
    END IF;
  END;

  SELECT unit INTO STRICT v_unit FROM public.items WHERE id = v_item_id;
  IF v_unit <> 'piece' THEN
    RAISE EXCEPTION 'Unit changed despite historical movements: %', v_unit;
  END IF;
END;
$$;

ROLLBACK;
