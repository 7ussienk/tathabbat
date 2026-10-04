import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, LevelBadge } from "@/components/ui";
import manifest from "@/data/sources/manifest.json";
import { MAQASID_SOURCE_ID } from "@/lib/retrieval/chunk-maqasid";

export const metadata: Metadata = {
  title: "عن المنهجية — تثبّت",
  description: "كيف يتحقق «تثبّت» من الرسائل الدينية: المصادر، مستويات المحتوى، وحدود الأداة.",
};

type ManifestEntry = { id: string; title: string; type: string; reviewed?: boolean };

// الكتب المفهرسة فعلاً: تلك التي لها مقطِّع في بناء الفهرس (لا كل ما في الـ manifest).
const INDEXED_IDS = new Set([MAQASID_SOURCE_ID]);
const books = (manifest as ManifestEntry[]).filter((s) => INDEXED_IDS.has(s.id));

const LEVELS: Array<{ level: "A" | "B" | "C" | "D"; text: string }> = [
  { level: "A", text: "حديث منسوب أو آية: حكم منقول بنصه من المصدر مع موضعه، أو «لم نجد له أصلاً في المصادر المعتمدة التي فُحصت»." },
  { level: "B", text: "شرح أو معنى مستنبط: نعرض المادة المعتمدة مع مرجعها دون قطع." },
  { level: "C", text: "مسألة خلافية: نبيّن الخلاف ونعرض الأقوال بمصادرها دون ترجيح آلي." },
  { level: "D", text: "فتوى أو حالة شخصية: لا نصدر حكماً، بل معلومة عامة وإحالة إلى جهة مؤهلة." },
];

export default function Methodology() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-3xl font-bold text-offwhite">عن المنهجية</h1>
      <Disclaimer />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">كيف نتحقق</h2>
        <ol className="list-decimal space-y-2 pe-6 ps-0 text-line marker:text-muted-light">
          <li>نفكك رسالتك إلى ادعاءات منفصلة.</li>
          <li>نبحث عن كل ادعاء في فهرس محلي مبني من كتب مفهرسة مسبقاً، ولا نتصل بأي موقع أثناء البحث.</li>
          <li>يختار النموذج اللغوي المرشح الأقرب فقط، ولا يكتب حكماً ولا يحكم على حديث من عنده.</li>
          <li>يقتطع الكود نص المصدر بحروفه ويرفض أي اقتباس ليس جزءاً حرفياً من المدخل المخزَّن.</li>
          <li>أي حكم لا يجتاز التحقق يتحول تلقائياً إلى «لم نجد له أصلاً» ولا يُخمَّن.</li>
        </ol>
        <p className="text-line">النص المنقول من المصدر يظهر في صندوق مستقل عن أي سطر يولّده النموذج، وكل سطر مولَّد موسوم بذلك.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">مستويات المحتوى</h2>
        <ul className="space-y-3">
          {LEVELS.map((l) => (
            <li key={l.level} className="flex items-start gap-3">
              <LevelBadge level={l.level} />
              <span className="text-line">{l.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">الكتب المفهرسة</h2>
        {books.length > 0 ? (
          <ul className="list-disc space-y-1 pe-6 ps-0 text-line">
            {books.map((b) => (
              <li key={b.id}>{b.title}</li>
            ))}
          </ul>
        ) : (
          <p className="text-line">لم تُحمَّل كتب مفهرسة في هذه النسخة.</p>
        )}
        <p className="text-line">
          إضافةً إلى مدخلات منتقاة بأحكام بشرية تسبق الفهرس. الفهرس لا يغطي كل الكتب المعتمدة، لذلك «لم نجد» تعني أننا لم نجد في الكتب المفهرسة التي فُحصت، ولا تعني أن الحديث لا أصل له.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">حدود الأداة</h2>
        <ul className="list-disc space-y-2 pe-6 ps-0 text-line">
          <li>الحكم على الرواية لا على العمل أو المسألة الفقهية؛ للفتوى راجع جهة مؤهلة.</li>
          <li>نلتزم بلفظ العالم منسوباً إلى كتابه، ولا نحوّل «لم أقف عليه» إلى «لا أصل له».</li>
          <li>الأحكام المسندة إلى مدخلات لم تُراجع شرعياً بعد تحمل شارة «بانتظار مراجعة شرعية».</li>
          <li>لا نحفظ رسالتك ولا ملفاتك بعد المعالجة، ولا نسجل نصها.</li>
        </ul>
      </section>

      <p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-turquoise px-6 font-semibold text-navy">
          العودة إلى التحقق
        </Link>
      </p>
    </main>
  );
}
