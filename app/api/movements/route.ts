import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidIsoDate, isValidUuid, parseMovementPagination, validateMovementFields } from "@/lib/inventory-validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && !isValidIsoDate(from)) return NextResponse.json({ error: "تاريخ البداية غير صالح." }, { status: 400 });
    if (to && !isValidIsoDate(to)) return NextResponse.json({ error: "تاريخ النهاية غير صالح." }, { status: 400 });
    if (from && to && from > to) return NextResponse.json({ error: "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية." }, { status: 400 });
    if (type && type !== "all" && type !== "in" && type !== "out") return NextResponse.json({ error: "نوع الحركة غير صالح." }, { status: 400 });
    if (itemId && !isValidUuid(itemId)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
    const pagination = parseMovementPagination(url.searchParams.get("limit"), url.searchParams.get("offset"));
    if ("error" in pagination) return NextResponse.json({ error: pagination.error }, { status: 400 });
    const db = getSupabaseAdmin();
    let query = db.from("movements").select("id,item_id,movement_type,quantity,movement_date,notes,created_at,items(name,code,unit)").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
    if (itemId) query = query.eq("item_id", itemId);
    if (type === "in" || type === "out") query = query.eq("movement_type", type);
    if (from) query = query.gte("movement_date", from);
    if (to) query = query.lte("movement_date", to);
    const { data, error } = await query;
    if (error) throw error;
    const movements = data ?? [];
    return NextResponse.json({ movements, hasMore: movements.length === pagination.limit, limit: pagination.limit, offset: pagination.offset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الحركات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationError = validateMovementFields({
      item_id: String(body.item_id ?? ""),
      movement_type: body.movement_type,
      quantity: Number(body.quantity),
      movement_date: String(body.movement_date ?? new Date().toISOString().slice(0, 10)),
      notes: body.notes == null ? null : String(body.notes).trim() || null,
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc("record_stock_movement", {
      p_item_id: String(body.item_id),
      p_movement_type: body.movement_type,
      p_quantity: Number(body.quantity),
      p_movement_date: String(body.movement_date ?? new Date().toISOString().slice(0, 10)),
      p_notes: body.notes == null ? null : String(body.notes).trim() || null,
    });
    if (error) {
      if (error.message.includes("INSUFFICIENT_STOCK")) return NextResponse.json({ error: "الكمية المطلوبة أكبر من الرصيد المتوفر." }, { status: 409 });
      if (error.message.includes("ITEM_NOT_FOUND")) return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
      if (error.message.includes("INVALID_QUANTITY")) return NextResponse.json({ error: "الكمية غير صالحة." }, { status: 400 });
      if (error.message.includes("INVALID_MOVEMENT_TYPE")) return NextResponse.json({ error: "نوع الحركة غير صالح." }, { status: 400 });
      throw error;
    }
    return NextResponse.json({ movement: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تسجيل الحركة" }, { status: 500 });
  }
}
