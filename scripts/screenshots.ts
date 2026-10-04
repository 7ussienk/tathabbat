/**
 * لقطات الواجهة بمتصفح headless (Playwright) بمقاسين: جوال 390×844 وسطح مكتب 1280×800 (docs/DESIGN.md §10).
 * لا يتحكم بأي متصفح للمستخدم. يتطلب خادماً يعمل على BASE_URL (الافتراضي http://localhost:3060، مثل `next start -p 3060`).
 * يحفظ في docs/screens/ (بلا شعارات) ويطبع فحوص: الفيض الأفقي، وأهداف اللمس < 44px، وتباين النص الأساسي.
 * الاستخدام: npx tsx scripts/screenshots.ts [--no-live]   (--no-live يتخطى النداء الحقيقي لـGemini)
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3060";
const OUT = "docs/screens";
const noLive = process.argv.includes("--no-live");
const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;

mkdirSync(OUT, { recursive: true });

async function checks(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const small: string[] = [];
    document.querySelectorAll<HTMLElement>("main button, main a, header a, textarea, summary").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (b.height < 43.5) small.push(`${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 18)} (${Math.round(b.height)}px)`);
    });
    return { overflow: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, dir: document.documentElement.dir, lang: document.documentElement.lang, small };
  });
  console.log(`  [${label}] dir=${r.dir} lang=${r.lang} overflow=${r.overflow} (${r.sw}/${r.cw}) أهداف لمس أقل من 44px: ${r.small.length ? r.small.join(" | ") : "لا يوجد"}`);
}

const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, locale: "ar-SA", colorScheme: "dark" });
    const page = await ctx.newPage();
    console.log(`\n== ${size.name}px ==`);

    // 1) الصفحة الرئيسية (حالة فارغة + أمثلة)
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/home-${size.name}.png`, fullPage: true });
    await checks(page, "home");

    // 2) حالة الخطأ (إرسال فارغ)
    await page.getByRole("button", { name: "تثبّت", exact: true }).click();
    await page.locator("main [role=alert]").waitFor();
    await page.screenshot({ path: `${OUT}/error-${size.name}.png`, fullPage: true });
    await checks(page, "error");

    // 3) نتيجة حقيقية: حديث مشهور (من الأمثلة)، وتحميل أثناء الانتظار
    if (!noLive) {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "حديث مشهور" }).click();
      await page.getByRole("button", { name: "تثبّت", exact: true }).click();
      await page.getByText("نبحث في المصادر").waitFor({ timeout: 10_000 });
      await page.screenshot({ path: `${OUT}/loading-${size.name}.png`, fullPage: true });
      await page.locator("article").first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/result-${size.name}.png`, fullPage: true });
      await checks(page, "result");

      // 4) آية بخطأ + سؤال فتوى + لا أصل (حالات أخرى لبطاقة الادعاء)
      for (const [ex, file] of [["آية بخطأ", "quran"], ["سؤال فتوى", "fatwa"]] as const) {
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: ex }).click();
        await page.getByRole("button", { name: "تثبّت", exact: true }).click();
        await page.locator("article").first().waitFor({ timeout: 60_000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${file}-${size.name}.png`, fullPage: true });
        await checks(page, file);
      }
    }

    // 5) المنهجية
    await page.goto(`${BASE}/methodology`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/methodology-${size.name}.png`, fullPage: true });
    await checks(page, "methodology");
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nاللقطات في ${OUT}/`);
