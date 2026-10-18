alter table public.items
  add constraint items_opening_quantity_scale_check
  check (opening_quantity = round(opening_quantity, 3));

alter table public.movements
  add constraint movements_quantity_scale_check
  check (quantity = round(quantity, 3));

create or replace function public.record_stock_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_movement_date date default current_date,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_current numeric(14,3);
  v_movement public.movements%rowtype;
begin
  if p_movement_type not in ('in', 'out') then
    raise exception 'INVALID_MOVEMENT_TYPE';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception 'INVALID_QUANTITY';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  select v_item.opening_quantity
    + coalesce(sum(quantity) filter (where movement_type = 'in'), 0)
    - coalesce(sum(quantity) filter (where movement_type = 'out'), 0)
    into v_current
  from public.movements
  where item_id = p_item_id;

  if p_movement_type = 'out' and p_quantity > v_current then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  insert into public.movements (item_id, movement_type, quantity, movement_date, notes)
  values (p_item_id, p_movement_type, p_quantity, coalesce(p_movement_date, current_date), p_notes)
  returning * into v_movement;

  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.record_stock_movement(uuid, text, numeric, date, text) from public, anon, authenticated;
grant execute on function public.record_stock_movement(uuid, text, numeric, date, text) to service_role;
