create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null,
  opening_quantity numeric(14,3) not null default 0 check (opening_quantity >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  movement_type text not null check (movement_type in ('in', 'out')),
  quantity numeric(14,3) not null check (quantity > 0),
  movement_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists movements_item_date_idx
  on public.movements (item_id, movement_date desc);
create index if not exists movements_date_idx
  on public.movements (movement_date desc);

create or replace view public.stock_balances as
select
  i.id, i.code, i.name, i.unit, i.opening_quantity, i.created_at,
  coalesce(sum(m.quantity) filter (where m.movement_type = 'in'), 0)::numeric(14,3) as incoming_quantity,
  coalesce(sum(m.quantity) filter (where m.movement_type = 'out'), 0)::numeric(14,3) as outgoing_quantity,
  (i.opening_quantity
    + coalesce(sum(m.quantity) filter (where m.movement_type = 'in'), 0)
    - coalesce(sum(m.quantity) filter (where m.movement_type = 'out'), 0)
  )::numeric(14,3) as current_quantity
from public.items i
left join public.movements m on m.item_id = i.id
group by i.id;

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
  if p_quantity is null or p_quantity <= 0 then
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

alter table public.items enable row level security;
alter table public.movements enable row level security;
revoke all on public.items, public.movements from anon, authenticated;
revoke all on public.stock_balances from anon, authenticated;
revoke all on function public.record_stock_movement(uuid, text, numeric, date, text) from public, anon, authenticated;
grant all on public.items, public.movements to service_role;
grant select on public.stock_balances to service_role;
grant execute on function public.record_stock_movement(uuid, text, numeric, date, text) to service_role;
