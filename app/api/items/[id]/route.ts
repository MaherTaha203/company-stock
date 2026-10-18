import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidUuid, validateItemFields } from "@/lib/inventory-validation.mjs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
    const body = await request.json();
    const validationError = validateItemFields(body, { partial: true });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const update: Record<string, string> = {};
    if ("code" in body) update.code = body.code.trim();
    if ("name" in body) update.name = body.name.trim();
    if ("unit" in body) update.unit = body.unit.trim();
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "لا توجد بيانات صالحة للتعديل." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("items").update(update).eq("id", id).select("id,code,name,unit,opening_quantity").maybeSingle();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "رمز الصنف مستخدم مسبقاً." }, { status: 409 });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تعديل الصنف" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("items").delete().eq("id", id).select("id").maybeSingle();
    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "لا يمكن حذف صنف له حركات مسجلة." }, { status: 409 });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الصنف" }, { status: 500 });
  }
}
