-- Add optional classification and a reorder threshold to items so the UI can
-- show category, a real "below reorder point" status, and richer reporting.
-- Additive and backward compatible; does not change stock arithmetic or the
-- record_stock_movement RPC.

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS reorder_level numeric(14,3) NOT NULL DEFAULT 0;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_category_length_check;
ALTER TABLE public.items ADD CONSTRAINT items_category_length_check
  CHECK (category IS NULL OR char_length(category) <= 100);

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_reorder_level_nonneg_check;
ALTER TABLE public.items ADD CONSTRAINT items_reorder_level_nonneg_check
  CHECK (reorder_level >= 0);

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_reorder_level_scale_check;
ALTER TABLE public.items ADD CONSTRAINT items_reorder_level_scale_check
  CHECK (reorder_level = round(reorder_level, 3));

-- Recreate the balance view with the new columns appended at the end so the
-- CREATE OR REPLACE keeps the existing leading column list unchanged.
CREATE OR REPLACE VIEW public.stock_balances AS
SELECT
  i.id, i.code, i.name, i.unit, i.opening_quantity, i.created_at,
  coalesce(sum(m.quantity) FILTER (WHERE m.movement_type = 'in'), 0)::numeric(14,3) AS incoming_quantity,
  coalesce(sum(m.quantity) FILTER (WHERE m.movement_type = 'out'), 0)::numeric(14,3) AS outgoing_quantity,
  (i.opening_quantity
    + coalesce(sum(m.quantity) FILTER (WHERE m.movement_type = 'in'), 0)
    - coalesce(sum(m.quantity) FILTER (WHERE m.movement_type = 'out'), 0)
  )::numeric(14,3) AS current_quantity,
  i.category,
  i.reorder_level
FROM public.items i
LEFT JOIN public.movements m ON m.item_id = i.id
GROUP BY i.id;

REVOKE ALL ON public.stock_balances FROM anon, authenticated;
GRANT SELECT ON public.stock_balances TO service_role;
