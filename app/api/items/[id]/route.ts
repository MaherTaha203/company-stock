import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const update: Record<string, string> = {};
    if (typeof body.code === "string" && body.code.trim()) update.code = body.code.trim();
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (typeof body.unit === "string" && body.unit.trim()) update.unit = body.unit.trim();
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("items").update(update).eq("id", id).select("id,code,name,unit,opening_quantity").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "رمز الصنف مستخدم مسبقاً." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تعديل الصنف" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getSupabaseAdmin();
    const { error } = await db.from("items").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "لا يمكن حذف صنف له حركات مسجلة." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الصنف" }, { status: 500 });
  }
}
