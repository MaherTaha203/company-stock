import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidUuid, validateItemFields } from "@/lib/inventory-validation.mjs";
import { isJsonObject, sanitizeApiError } from "@/lib/api-errors.mjs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) return NextResponse.json({ error: "معرّف الصنف غير صالح." }, { status: 400 });
    const body = await request.json();
    if (!isJsonObject(body)) return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    const validationError = validateItemFields(body, { partial: true });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const update: Record<string, string | number | null> = {};
    if ("code" in body) update.code = body.code.trim();
    if ("name" in body) update.name = body.name.trim();
    if ("unit" in body) update.unit = body.unit.trim();
    if ("category" in body) update.category = body.category == null ? null : String(body.category).trim() || null;
    if ("reorder_level" in body) update.reorder_level = Number(body.reorder_level ?? 0);
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "لا توجد بيانات صالحة للتعديل." }, { status: 400 });
    const db = getSupabaseAdmin();
    if (typeof update.unit === "string") {
      const { data: existing, error: lookupError } = await db.from("items").select("unit").eq("id", id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
      if (existing.unit !== update.unit) {
        const { data: priorMovement, error: movementLookupError } = await db.from("movements").select("id").eq("item_id", id).limit(1).maybeSingle();
        if (movementLookupError) throw movementLookupError;
        if (priorMovement) return NextResponse.json({ error: "لا يمكن تغيير وحدة القياس بعد تسجيل حركات للصنف." }, { status: 409 });
      }
    }
    const { data, error } = await db.from("items").update(update).eq("id", id).select("id,code,name,unit,opening_quantity,category,reorder_level").maybeSingle();
    if (error) {
      if (error.message?.includes("ITEM_UNIT_IN_USE")) return NextResponse.json({ error: "لا يمكن تغيير وحدة القياس بعد تسجيل حركات للصنف." }, { status: 409 });
      if (error.code === "23505") return NextResponse.json({ error: "رمز الصنف مستخدم مسبقاً." }, { status: 409 });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("PATCH /api/items/[id] failed", error);
    const safe = sanitizeApiError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
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
    console.error("DELETE /api/items/[id] failed", error);
    const safe = sanitizeApiError(error);
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
