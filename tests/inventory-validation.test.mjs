import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAtMostThreeDecimals,
  isValidIsoDate,
  MAX_STOCK_QUANTITY,
  parseMovementPagination,
  isValidUuid,
  validateItemFields,
  validateMovementFields,
} from "../lib/inventory-validation.mjs";

const itemId = "550e8400-e29b-41d4-a716-446655440000";

test("accepts valid calendar dates and rejects impossible dates", () => {
  assert.equal(isValidIsoDate("2026-10-18"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("18-10-2026"), false);
  assert.equal(isValidIsoDate(""), false);
});

test("limits quantities to three decimal places", () => {
  assert.equal(hasAtMostThreeDecimals(1), true);
  assert.equal(hasAtMostThreeDecimals(1.125), true);
  assert.equal(hasAtMostThreeDecimals(1.2345), false);
  assert.equal(hasAtMostThreeDecimals(Number.POSITIVE_INFINITY), false);
});

test("validates movement pagination limits and offsets", () => {
  assert.deepEqual(parseMovementPagination(null, null), { limit: 500, offset: 0 });
  assert.deepEqual(parseMovementPagination("25", "500"), { limit: 25, offset: 500 });
  assert.match(parseMovementPagination("501", "0").error, /بين 1 و500/);
  assert.match(parseMovementPagination("0", "0").error, /بين 1 و500/);
  assert.match(parseMovementPagination("50", "-1").error, /غير صالح/);
  assert.match(parseMovementPagination("50", "1.5").error, /غير صالح/);
});

test("validates item creation and partial updates", () => {
  assert.equal(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0 }), null);
  assert.match(validateItemFields({ code: "", name: "عبوات", unit: "حبة", opening_quantity: 0 }), /رمز الصنف/);
  assert.match(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: -1 }), /الرصيد الافتتاحي/);
  assert.equal(validateItemFields({ code: "PK-2", name: "أقصى كمية", unit: "حبة", opening_quantity: MAX_STOCK_QUANTITY }), null);
  assert.match(validateItemFields({ code: "PK-3", name: "كمية أكبر", unit: "حبة", opening_quantity: MAX_STOCK_QUANTITY + 1 }), /99,999,999,999.999/);
  assert.equal(validateItemFields({ name: "اسم جديد" }, { partial: true }), null);
  assert.match(validateItemFields({ name: " " }, { partial: true }), /اسم الصنف/);
  assert.equal(validateItemFields({}, { partial: true }), null);
});

test("validates optional category and reorder level", () => {
  assert.equal(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0, category: "مواد خام", reorder_level: 10 }), null);
  assert.equal(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0, category: null, reorder_level: 0 }), null);
  assert.match(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0, category: "x".repeat(101) }), /التصنيف/);
  assert.match(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0, reorder_level: -1 }), /نقطة الطلب/);
  assert.match(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0, reorder_level: 1.2345 }), /نقطة الطلب/);
  assert.equal(validateItemFields({ reorder_level: 5, category: "تغليف" }, { partial: true }), null);
  assert.match(validateItemFields({ reorder_level: -2 }, { partial: true }), /نقطة الطلب/);
});

test("validates movement type, UUID, positive quantity, date and notes", () => {
  const valid = { item_id: itemId, movement_type: "in", quantity: 2.125, movement_date: "2026-10-18", notes: null };
  assert.equal(isValidUuid(itemId), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(validateMovementFields(valid), null);
  assert.match(validateMovementFields({ ...valid, quantity: 0 }), /الكمية/);
  assert.match(validateMovementFields({ ...valid, quantity: 1.2345 }), /ثلاث منازل/);
  assert.equal(validateMovementFields({ ...valid, quantity: MAX_STOCK_QUANTITY }), null);
  assert.match(validateMovementFields({ ...valid, quantity: MAX_STOCK_QUANTITY + 1 }), /99,999,999,999.999/);
  assert.match(validateMovementFields({ ...valid, movement_type: "transfer" }), /نوع حركة/);
  assert.match(validateMovementFields({ ...valid, movement_date: "2026-02-30" }), /تاريخ الحركة/);
  assert.match(validateMovementFields({ ...valid, notes: "x".repeat(1001) }), /الملاحظات/);
});
