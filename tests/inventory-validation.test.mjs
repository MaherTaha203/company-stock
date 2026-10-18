import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAtMostThreeDecimals,
  isValidIsoDate,
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

test("validates item creation and partial updates", () => {
  assert.equal(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: 0 }), null);
  assert.match(validateItemFields({ code: "", name: "عبوات", unit: "حبة", opening_quantity: 0 }), /رمز الصنف/);
  assert.match(validateItemFields({ code: "PK-1", name: "عبوات", unit: "حبة", opening_quantity: -1 }), /الرصيد الافتتاحي/);
  assert.equal(validateItemFields({ name: "اسم جديد" }, { partial: true }), null);
  assert.match(validateItemFields({ name: " " }, { partial: true }), /اسم الصنف/);
  assert.equal(validateItemFields({}, { partial: true }), null);
});

test("validates movement type, UUID, positive quantity, date and notes", () => {
  const valid = { item_id: itemId, movement_type: "in", quantity: 2.125, movement_date: "2026-10-18", notes: null };
  assert.equal(isValidUuid(itemId), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(validateMovementFields(valid), null);
  assert.match(validateMovementFields({ ...valid, quantity: 0 }), /الكمية/);
  assert.match(validateMovementFields({ ...valid, quantity: 1.2345 }), /ثلاث منازل/);
  assert.match(validateMovementFields({ ...valid, movement_type: "transfer" }), /نوع حركة/);
  assert.match(validateMovementFields({ ...valid, movement_date: "2026-02-30" }), /تاريخ الحركة/);
  assert.match(validateMovementFields({ ...valid, notes: "x".repeat(1001) }), /الملاحظات/);
});
