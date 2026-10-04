/**
 * فحص أمني قبل الدفع (CLAUDE.md §10 البند 7): يفشل (exit 1) إن وُجد:
 *  - مسار حساس متتبَّع: .env، data/local/، data/index/، private/، eval/audio/ (عدا .gitkeep)، .scratch/
 *  - قيمة سرية من .env (مفاتيح KEY/TOKEN/SECRET بطول ≥ 8) في أي ملف متتبَّع أو في أي commit لم يُدفع بعد.
 * لا يطبع قيم الأسرار أبداً. الاستخدام: npm run precheck
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const git = (...args: string[]): string => {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e: any) {
    if (e.status === 1) return ""; // git grep بلا نتائج
    throw e;
  }
};

const problems: string[] = [];

const SENSITIVE = [/^\.env($|\.(?!example$))/, /^data\/local\//, /^data\/index\//, /^private\//, /^eval\/audio\/(?!\.gitkeep$)/, /^\.scratch\//];
for (const f of git("ls-files", "-z").split("\0").filter(Boolean)) {
  if (SENSITIVE.some((r) => r.test(f))) problems.push(`مسار حساس متتبَّع: ${f}`);
}

const secrets: { key: string; value: string }[] = [];
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && /KEY|TOKEN|SECRET/.test(m[1]) && m[2].length >= 8) secrets.push({ key: m[1], value: m[2] });
  }
}

const upstream = git("rev-parse", "--verify", "-q", "@{u}").trim();
const unpushedPatch = upstream ? git("log", "-p", "--all-match", `${upstream}..HEAD`) : git("log", "-p", "HEAD");
for (const { key, value } of secrets) {
  const files = git("grep", "-I", "-l", "-F", "--", value).split("\n").filter(Boolean);
  if (files.length) problems.push(`قيمة ${key} موجودة في ملفات متتبَّعة: ${files.join(", ")}`);
  if (unpushedPatch.includes(value)) problems.push(`قيمة ${key} موجودة في commits لم تُدفع بعد`);
}

if (problems.length) {
  console.error(`✗ الفحص الأمني فشل:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`✓ الفحص الأمني سليم: لا مسارات حساسة متتبَّعة، ولا أسرار (${secrets.length} قيمة مفحوصة) في الملفات أو commits غير المدفوعة.`);
