import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasAtMostThreeDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && !isValidDate(from)) return NextResponse.json({ error: "تاريخ البداية غير صالح." }, { status: 400 });
    if (to && !isValidDate(to)) return NextResponse.json({ error: "تاريخ النهاية غير صالح." }, { status: 400 });
    if (from && to && from > to) return NextResponse.json({ error: "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية." }, { status: 400 });
    if (type && type !== "all" && type !== "in" && type !== "out") return NextResponse.json({ error: "نوع الحركة غير صالح." }, { status: 400 });
    const db = getSupabaseAdmin();
    let query = db.from("movements").select("id,item_id,movement_type,quantity,movement_date,notes,created_at,items(name,code,unit)").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (itemId) query = query.eq("item_id", itemId);
    if (type === "in" || type === "out") query = query.eq("movement_type", type);
    if (from) query = query.gte("movement_date", from);
    if (to) query = query.lte("movement_date", to);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ movements: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الحركات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const itemId = String(body.item_id ?? "");
    const movementType = body.movement_type;
    const quantity = Number(body.quantity);
    const movementDate = String(body.movement_date ?? new Date().toISOString().slice(0, 10));
    const notes = String(body.notes ?? "").trim() || null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId) || (movementType !== "in" && movementType !== "out")) {
      return NextResponse.json({ error: "اختر صنفاً صحيحاً ونوع حركة صالحاً." }, { status: 400 });
    }
    if (!hasAtMostThreeDecimals(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "الكمية يجب أن تكون أكبر من صفر وبحد أقصى ثلاث منازل عشرية." }, { status: 400 });
    }
    if (!isValidDate(movementDate)) return NextResponse.json({ error: "تاريخ الحركة غير صالح." }, { status: 400 });
    if (notes && notes.length > 1000) return NextResponse.json({ error: "الملاحظات تتجاوز الحد المسموح (1000 حرف)." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc("record_stock_movement", {
      p_item_id: itemId,
      p_movement_type: movementType,
      p_quantity: quantity,
      p_movement_date: movementDate,
      p_notes: notes,
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
