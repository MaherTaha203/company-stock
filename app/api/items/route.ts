import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("stock_balances").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الأصناف" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const opening = Number(body.opening_quantity ?? 0);
    if (!code || !name || !unit) return NextResponse.json({ error: "أدخل رمز الصنف واسمه ووحدة القياس." }, { status: 400 });
    if (!Number.isFinite(opening) || opening < 0) return NextResponse.json({ error: "الرصيد الافتتاحي يجب أن يكون صفراً أو أكثر." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("items").insert({ code, name, unit, opening_quantity: opening }).select("id,code,name,unit,opening_quantity").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "رمز الصنف مستخدم مسبقاً." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إضافة الصنف" }, { status: 500 });
  }
}
