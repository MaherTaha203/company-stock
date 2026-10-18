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

export function validateItemFields({ code, name, unit, opening_quantity }, { partial = false } = {}) {
  const fields = { code, name, unit };
  for (const [key, max] of [["code", 100], ["name", 200], ["unit", 50]]) {
    if (partial && !(key in arguments[0])) continue;
    if (typeof fields[key] !== "string" || !fields[key].trim() || fields[key].trim().length > max) {
      return key === "code" ? "رمز الصنف مطلوب وبحد أقصى 100 حرف."
        : key === "name" ? "اسم الصنف مطلوب وبحد أقصى 200 حرف."
        : "وحدة القياس مطلوبة وبحد أقصى 50 حرفاً.";
    }
  }
  if (!partial) {
    const opening = Number(opening_quantity ?? 0);
    if (!hasAtMostThreeDecimals(opening) || opening < 0) return "الرصيد الافتتاحي يجب أن يكون صفراً أو أكثر وبحد أقصى ثلاث منازل عشرية.";
  }
  return null;
}

export function validateMovementFields({ item_id, movement_type, quantity, movement_date, notes }) {
  if (!isValidUuid(item_id) || (movement_type !== "in" && movement_type !== "out")) return "اختر صنفاً صحيحاً ونوع حركة صالحاً.";
  const amount = Number(quantity);
  if (!hasAtMostThreeDecimals(amount) || amount <= 0) return "الكمية يجب أن تكون أكبر من صفر وبحد أقصى ثلاث منازل عشرية.";
  if (!isValidIsoDate(movement_date)) return "تاريخ الحركة غير صالح.";
  if (notes != null && String(notes).length > 1000) return "الملاحظات تتجاوز الحد المسموح (1000 حرف).";
  return null;
}
