-- Make retries of a stock movement request safe without changing stock arithmetic.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS movements_request_id_unique_idx
  ON public.movements (request_id)
  WHERE request_id IS NOT NULL;

-- Keep the existing five-argument function during rollout so the currently deployed app remains compatible.
-- The updated API calls the new six-argument overload with a required request ID.

CREATE FUNCTION public.record_stock_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_movement_date date,
  p_notes text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.items%rowtype;
  v_current numeric(14,3);
  v_movement public.movements%rowtype;
  v_effective_date date := coalesce(p_movement_date, current_date);
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST_ID';
  END IF;
  IF p_movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  -- Serialize requests sharing a token, including requests for different items.
  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    SELECT * INTO v_movement
    FROM public.movements
    WHERE request_id = p_request_id;

    IF FOUND THEN
      IF v_movement.item_id IS DISTINCT FROM p_item_id
         OR v_movement.movement_type IS DISTINCT FROM p_movement_type
         OR v_movement.quantity IS DISTINCT FROM p_quantity
         OR v_movement.movement_date IS DISTINCT FROM v_effective_date
         OR v_movement.notes IS DISTINCT FROM p_notes THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN to_jsonb(v_movement);
    END IF;
  END IF;

  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  SELECT v_item.opening_quantity
    + coalesce(sum(quantity) FILTER (WHERE movement_type = 'in'), 0)
    - coalesce(sum(quantity) FILTER (WHERE movement_type = 'out'), 0)
    INTO v_current
  FROM public.movements
  WHERE item_id = p_item_id;

  IF p_movement_type = 'out' AND p_quantity > v_current THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  INSERT INTO public.movements (item_id, movement_type, quantity, movement_date, notes, request_id)
  VALUES (p_item_id, p_movement_type, p_quantity, v_effective_date, p_notes, p_request_id)
  RETURNING * INTO v_movement;

  RETURN to_jsonb(v_movement);
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, text, numeric, date, text, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, text, numeric, date, text, uuid)
  TO service_role;
