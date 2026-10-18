import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
    const body = await request.json();
    const update: Record<string, string> = {};
    if ("code" in body) {
      if (typeof body.code !== "string" || !body.code.trim() || body.code.trim().length > 100) return NextResponse.json({ error: "رمز الصنف مطلوب وبحد أقصى 100 حرف." }, { status: 400 });
      update.code = body.code.trim();
    }
    if ("name" in body) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) return NextResponse.json({ error: "اسم الصنف مطلوب وبحد أقصى 200 حرف." }, { status: 400 });
      update.name = body.name.trim();
    }
    if ("unit" in body) {
      if (typeof body.unit !== "string" || !body.unit.trim() || body.unit.trim().length > 50) return NextResponse.json({ error: "وحدة القياس مطلوبة وبحد أقصى 50 حرفاً." }, { status: 400 });
      update.unit = body.unit.trim();
    }
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
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
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
