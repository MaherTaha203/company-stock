import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeApiError } from "../lib/api-errors.mjs";

test("database and unexpected errors never expose internal messages", () => {
  const error = new Error('relation "private_table" does not exist');
  assert.deepEqual(sanitizeApiError(error), {
    status: 500,
    message: "حدث خطأ داخلي. يرجى المحاولة لاحقاً.",
  });
  assert.equal(JSON.stringify(sanitizeApiError(error)).includes("private_table"), false);
});

test("malformed JSON gets a safe client error", () => {
  assert.deepEqual(sanitizeApiError(new SyntaxError("Unexpected token in JSON")), {
    status: 400,
    message: "صيغة الطلب غير صالحة.",
  });
});
