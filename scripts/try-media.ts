/**
 * مشغّل تطويري لمقطع صوتي محلي عبر handleTranscribe() الحقيقي (يستخدم eval/audio محلياً ولا يرفعه إلى أي مكان غير Gemini).
 * الاستخدام: npx tsx scripts/try-media.ts <path> [--show]
 *   --show يطبع النص المستخرَج (بيانات من ملفك أنت؛ لا تُسجَّل في أي سجل).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MemoryRateLimitStore } from "../lib/ratelimit/memory";
import { DailyCostMeter } from "../lib/ratelimit/cost";
import { handleTranscribe } from "../lib/transcribe";

process.loadEnvFile(".env");
const path = process.argv[2];
if (!path) throw new Error("usage: tsx scripts/try-media.ts <path> [--show]");
const data = readFileSync(path);
const fd = new FormData();
fd.append("file", new File([data], basename(path)));
const meter = new DailyCostMeter();
const t = Date.now();
const res = await handleTranscribe(new Request("http://local/api/transcribe", { method: "POST", body: fd }), new MemoryRateLimitStore(), { meter });
const body = (await res.json()) as { status: string; text?: string; clarity?: number; error?: { code: string; message_ar: string } };
console.log(`audio ${(data.length / 1024).toFixed(0)}KB ← http=${res.status} status=${body.status}${body.error ? ` error=${body.error.code}` : ""} | ${Date.now() - t}ms | clarity=${body.clarity} | cost≈${meter.total().toFixed(5)}$`);
if (process.argv.includes("--show")) console.log(`text: ${body.text ?? body.error?.message_ar}`);
