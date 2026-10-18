-- Prevent changing the meaning of quantities already recorded for an item.
-- record_stock_movement locks the item row FOR UPDATE, so this trigger and movement
-- creation serialize on the same row.
create or replace function public.prevent_item_unit_change_with_movements()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unit is distinct from old.unit
     and exists (select 1 from public.movements where item_id = old.id) then
    raise exception 'ITEM_UNIT_IN_USE';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_item_unit_change_with_movements on public.items;
create trigger prevent_item_unit_change_with_movements
before update of unit on public.items
for each row
execute function public.prevent_item_unit_change_with_movements();
