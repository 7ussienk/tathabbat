/**
 * سجلات تقنية فقط (القاعدة 7 و26 / R12): قائمة حقول مسموحة (allow-list). لا نص رسالة ولا ادعاء ولا ملف.
 * أي حقل خارج القائمة يُهمل بصمت حتى لو مُرِّر خطأً.
 */
export type LogRecord = {
  ts: string;
  request_id: string;
  route: string;
  input_type: "text" | "image" | "audio";
  status: string;
  duration_ms: number;
  claims_count: number;
  verdicts: string[];
  downgrades: number;
  tokens_in: number;
  tokens_out: number;
  cost_estimate_usd: number;
  error_code?: string;
  /** أثر نداءات النموذج: الخطوة والنموذج والزمن والنتيجة (تقني فقط) */
  llm_calls?: { label: string; attempts: { model: string; ms: number; outcome: string }[]; note?: string }[];
  /** النماذج التي خدمت الطلب فعلاً (تقني) */
  served_models?: string[];
};

const ALLOWED: (keyof LogRecord)[] = [
  "ts", "request_id", "route", "input_type", "status", "duration_ms", "claims_count", "verdicts",
  "downgrades", "tokens_in", "tokens_out", "cost_estimate_usd", "error_code", "llm_calls", "served_models",
];

export function sanitize(rec: Record<string, unknown>): Partial<LogRecord> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in rec) out[k] = rec[k];
  return out as Partial<LogRecord>;
}

export function logRequest(rec: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: "verify", ...sanitize(rec) }));
}
