export const MAX_STOCK_QUANTITY = 99999999999.999;

export function parseMovementPagination(limitValue, offsetValue) {
  const limit = limitValue === null ? 500 : Number(limitValue);
  const offset = offsetValue === null ? 0 : Number(offsetValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) return { error: "حجم صفحة الحركات يجب أن يكون بين 1 و500." };
  if (!Number.isSafeInteger(offset) || offset < 0) return { error: "موضع صفحة الحركات غير صالح." };
  return { limit, offset };
}

export function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function hasAtMostThreeDecimals(value) {
  return Number.isFinite(value) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
}

export function isValidUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateItemFields(input, { partial = false } = {}) {
  const { code, name, unit, opening_quantity, category, reorder_level } = input;
  const fields = { code, name, unit };
  for (const [key, max] of [["code", 100], ["name", 200], ["unit", 50]]) {
    if (partial && !(key in input)) continue;
    if (typeof fields[key] !== "string" || !fields[key].trim() || fields[key].trim().length > max) {
      return key === "code" ? "رمز الصنف مطلوب وبحد أقصى 100 حرف."
        : key === "name" ? "اسم الصنف مطلوب وبحد أقصى 200 حرف."
        : "وحدة القياس مطلوبة وبحد أقصى 50 حرفاً.";
    }
  }
  if ("category" in input && category != null && category !== "") {
    if (typeof category !== "string" || category.trim().length > 100) return "التصنيف بحد أقصى 100 حرف.";
  }
  if ("reorder_level" in input && reorder_level != null && reorder_level !== "") {
    const reorder = Number(reorder_level);
    if (!hasAtMostThreeDecimals(reorder) || reorder < 0 || reorder > MAX_STOCK_QUANTITY) return "نقطة الطلب يجب أن تكون بين صفر و99,999,999,999.999 وبحد أقصى ثلاث منازل عشرية.";
  }
  if (!partial) {
    const opening = Number(opening_quantity ?? 0);
    if (!hasAtMostThreeDecimals(opening) || opening < 0 || opening > MAX_STOCK_QUANTITY) return "الرصيد الافتتاحي يجب أن يكون بين صفر و99,999,999,999.999 وبحد أقصى ثلاث منازل عشرية.";
  }
  return null;
}

export function validateMovementFields({ item_id, movement_type, quantity, movement_date, notes }) {
  if (!isValidUuid(item_id) || (movement_type !== "in" && movement_type !== "out")) return "اختر صنفاً صحيحاً ونوع حركة صالحاً.";
  const amount = Number(quantity);
  if (!hasAtMostThreeDecimals(amount) || amount <= 0 || amount > MAX_STOCK_QUANTITY) return "الكمية يجب أن تكون أكبر من صفر ولا تتجاوز 99,999,999,999.999 وبحد أقصى ثلاث منازل عشرية.";
  if (!isValidIsoDate(movement_date)) return "تاريخ الحركة غير صالح.";
  if (notes != null && String(notes).length > 1000) return "الملاحظات تتجاوز الحد المسموح (1000 حرف).";
  return null;
}
