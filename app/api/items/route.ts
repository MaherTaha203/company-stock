import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateItemFields } from "@/lib/inventory-validation.mjs";
import { isJsonObject, sanitizeApiError } from "@/lib/api-errors.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("stock_balances").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error("GET /api/items failed", error);
    const safe = sanitizeApiError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isJsonObject(body)) return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const opening = Number(body.opening_quantity ?? 0);
    const validationError = validateItemFields({ code, name, unit, opening_quantity: opening });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("items").insert({ code, name, unit, opening_quantity: opening }).select("id,code,name,unit,opening_quantity").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "رمز الصنف مستخدم مسبقاً." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items failed", error);
    const safe = sanitizeApiError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
