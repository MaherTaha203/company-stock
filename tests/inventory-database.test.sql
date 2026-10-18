-- Runs only against the isolated PostgreSQL service in CI.
-- Every fixture is rolled back; this file must never target production.
BEGIN;

DO $$
DECLARE
  v_item_id uuid;
  v_balance numeric;
  v_movement_count integer;
BEGIN
  INSERT INTO public.items (code, name, unit, opening_quantity)
  VALUES ('CI-' || replace(gen_random_uuid()::text, '-', ''), 'CI inventory test item', 'piece', 0)
  RETURNING id INTO v_item_id;

  PERFORM public.record_stock_movement(v_item_id, 'in', 10.125, current_date, 'CI incoming');
  PERFORM public.record_stock_movement(v_item_id, 'out', 2.125, current_date, 'CI outgoing');

  SELECT current_quantity INTO v_balance
  FROM public.stock_balances WHERE id = v_item_id;
  IF v_balance <> 8.000 THEN
    RAISE EXCEPTION 'Expected balance 8.000 after incoming/outgoing, got %', v_balance;
  END IF;

  SELECT count(*) INTO v_movement_count FROM public.movements WHERE item_id = v_item_id;
  BEGIN
    PERFORM public.record_stock_movement(v_item_id, 'out', 9.000, current_date, 'must fail');
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

  SELECT unit INTO STRICT v_balance FROM public.items WHERE id = v_item_id;
END;
$$;

ROLLBACK;
