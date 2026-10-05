/**
 * حارس الفيض الأفقي على الجوال: Playwright بعرض 390px (وعرض ضيق 360px) على بيانات **وهمية** (يعترض /api/verify، بلا Gemini ولا تكلفة).
 * رسالة مركّبة بثلاثة ادعاءات: «صحيح» و«مختلف في الحكم عليه» و«لم نجد له أصلاً»، بروابط طويلة مرمَّزة (الدرر السنية) وروابط الشاملة وتراث،
 * ويتأكد أن document.documentElement.scrollWidth <= window.innerWidth بعد ظهور النتائج (وإلا فالصفحة تتسع ويصغّرها الجوال).
 * يستخدم خادماً يعمل على BASE_URL، وإلا يشغّل `next dev` مؤقتاً على 3061 ويوقفه عند الانتهاء.
 * الاستخدام: npm run guard:overflow      (الخروج 1 عند أي فيض، ويطبع العناصر المتجاوزة)
 * كل النصوص هنا تجريبية (القاعدة 9) ولا تُستخدم في أي عرض.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import { verifyLink } from "../lib/verify-link";

const PORT = 3061;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;
/** جوال (بأجهزة لمس) وسطح مكتب/لوحي: لا تجاوز أفقي في أيٍّ منها، وعرض الحاوية الرئيسية على العريض لا يتجاوز ما كان قبل إصلاح الفيض (قيس: 768px) */
const WIDTHS = [
  { width: 390, mobile: true },
  { width: 360, mobile: true },
  { width: 768, mobile: false },
  { width: 1024, mobile: false },
  { width: 1440, mobile: false },
];
const MAX_CONTAINER_PX = 768;
const MARGIN_PX = 2;
const MEASURE_ONLY = process.argv.includes("--measure");

const longUrl = "https://example.test/very/long/path/with/many/segments/and/query?token=TEST_TOKEN_0123456789abcdefghijklmnopqrstuvwxyz&ref=TEST";
const c1 = "نص تجريبي أول TEST_HADITH_001 يعمل حرفياً في المصدر";
const c2 = "نص تجريبي ثانٍ TEST_HADITH_002 مختلف في الحكم عليه بين الأئمة";
const c3 = `ادعاء تجريبي ثالث TEST_HADITH_003 بلا أصل في الفحص ${longUrl}`;
const shamela = "https://shamela.ws/book/1234567/89012345#p1&q=TEST_ANCHOR_NOT_BREAKABLE_0123456789abcdefghijklmnopqrstuvwxyz0123456789";
const turath = "https://app.turath.io/book/1234567?page=89012345&highlight=TEST_ANCHOR_NOT_BREAKABLE_0123456789abcdefghijklmnopqrstuvwxyz0123456789";

const src = (id: string, url: string, extra: object = {}) => ({
  source_id: id,
  title: "كتاب تجريبي TEST في الحديث",
  author: "مؤلف تجريبي",
  location: "المجلد الأول، الصفحة 123، الحديث رقم 456 TEST_LOCATION_0123456789_0123456789_0123456789",
  quoted_text: "متن تجريبي TEST_HADITH_001 يُقتبس حرفياً من الصفحة المخزَّنة في الفهرس التجريبي ويطول قليلاً ليختبر الالتفاف في السطور.",
  url,
  ...extra,
});
const base = { confidence: 0.9, review_status: "pending_review" as const, claim_type: "hadith" as const, content_level: "A" as const };
const mock = {
  request_id: "test",
  input_type: "text",
  status: "ok",
  claims: [
    { ...base, id: "c1", claim_text: c1, verdict: "authentic", sources: [src("sahih-test", shamela)], verify_link: verifyLink(c1) },
    {
      ...base,
      id: "c2",
      claim_text: c2,
      verdict: "disputed",
      sources: [src("book-a", turath, { grading_quote: "قال المؤلف التجريبي: حكم تجريبي أول TEST" }), src("book-b", shamela, { grading_quote: "وقال الآخر التجريبي: حكم تجريبي ثانٍ TEST" })],
      verify_link: verifyLink(c2),
    },
    { ...base, id: "c3", claim_text: c3, verdict: "not_found_in_sources", confidence: 0.2, sources: [], checked_sources: ["maqasid-test", "sahih-test"], verify_link: verifyLink(c3) },
  ],
  reply_text: [
    "نتيجة التحقق (أداة ذكاء اصطناعي وليست مفتياً):",
    `• «${c1}»: صحيح (صحيح تجريبي، الموضع: الجزء 1 الحديث 456)`,
    `• «${c3}»: لم نجد له أصلاً في المصادر المعتمدة التي فُحصت، للتحقق بنفسك:`,
    `  ${verifyLink(c3)}`,
  ].join("\n"),
  telegram_text: "x",
  disclaimer: "أداة ذكاء اصطناعي للمساعدة في التحقق، وليست مفتياً.",
  source_titles: { "maqasid-test": "كتاب تجريبي أول TEST", "sahih-test": "كتاب تجريبي ثانٍ TEST" },
  claims_total: 3,
  claims_examined: 3,
  timings_ms: {},
};

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let server: ChildProcess | null = null;
const stopServer = () => {
  if (server?.pid) {
    try {
      execSync(process.platform === "win32" ? `taskkill /pid ${server.pid} /T /F` : `kill -9 -${server.pid}`, { stdio: "ignore" });
    } catch {
      /* انتهى */
    }
  }
};

async function main(): Promise<number> {
  if (!process.env.BASE_URL && !(await reachable(BASE))) {
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], { shell: true, stdio: "ignore", detached: process.platform !== "win32" });
    for (let i = 0; i < 90 && !(await reachable(BASE)); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!(await reachable(BASE))) throw new Error("تعذّر تشغيل الخادم المؤقت");
  }
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  let failed = 0;
  try {
    for (const { width, mobile } of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2, locale: "ar-SA", colorScheme: "dark" });
      const page = await ctx.newPage();
      await page.route("**/api/verify", (route) => route.fulfill({ json: mock }));
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 90_000 });
      const measure = () =>
        page.evaluate(() => {
          const de = document.documentElement;
          const over: string[] = [];
          document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1)) over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(b.left)}..${Math.round(b.right)}] «${(el.textContent ?? "").trim().slice(0, 24)}»`);
          });
          return { sw: de.scrollWidth, iw: window.innerWidth, over: over.slice(0, 8) };
        });
      const before = await measure();
      await page.locator("textarea").fill(`${c1}\n${c2}\n${c3}`);
      await page.getByRole("button", { name: "تثبّت", exact: true }).click();
      await page.locator("article").nth(2).waitFor({ timeout: 15_000 });
      await page.getByText("الرد الجاهز للمشاركة").waitFor();
      await page.waitForTimeout(400);
      const after = await measure();
      // عروض الحاويات بعد ظهور النتائج: الرأس والحاوية الرئيسية وبطاقة الإدخال وأول بطاقة والرد الجاهز
      const [header, main, input, card, reply] = await page.evaluate(
        (sels) => sels.map((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? -1)),
        ["header", "main", "section[aria-labelledby=input-h]", "article", "section[aria-labelledby=reply-h]"],
      );
      const w = { header, main, input, card, reply };
      const containerOk = !mobile ? Math.max(w.header, w.main, w.input, w.card, w.reply) <= MAX_CONTAINER_PX + MARGIN_PX : true;
      const ok = before.sw <= before.iw && after.sw <= after.iw && containerOk;
      console.log(`${ok ? "✓" : "✗"} ${width}px: قبل النتائج ${before.sw}/${before.iw}، بعدها ${after.sw}/${after.iw} | عرض: رأس ${w.header} حاوية ${w.main} إدخال ${w.input} بطاقة ${w.card} رد ${w.reply}${containerOk ? "" : ` (> ${MAX_CONTAINER_PX}+${MARGIN_PX})`}`);
      // صفحة المنهجية (روابط المستودع وغيرها): لا تجاوز أفقي
      await page.goto(`${BASE}/methodology`, { waitUntil: "networkidle", timeout: 90_000 });
      const [msw, miw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      console.log(`${msw <= miw ? "✓" : "✗"} ${width}px /methodology: ${msw}/${miw}`);
      if (msw > miw) failed++;
      if (!ok) {
        failed++;
        for (const o of after.over) console.log(`   متجاوز: ${o}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return failed;
}

main()
  .then((failed) => {
    stopServer();
    if (failed && !MEASURE_ONLY) {
      console.error(`✗ حارس الفيض الأفقي فشل في ${failed} عرض/عروض`);
      process.exit(1);
    }
    console.log(failed ? "(وضع القياس فقط)" : "✓ لا فيض أفقي، وعرض الحاوية ضمن الحد على كل العروض");
    process.exit(0);
  })
  .catch((e) => {
    stopServer();
    console.error(e);
    process.exit(1);
  });
