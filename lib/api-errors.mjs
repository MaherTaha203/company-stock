export function sanitizeApiError(error) {
  if (error instanceof SyntaxError) {
    return { status: 400, message: "صيغة الطلب غير صالحة." };
  }
  return { status: 500, message: "حدث خطأ داخلي. يرجى المحاولة لاحقاً." };
}
