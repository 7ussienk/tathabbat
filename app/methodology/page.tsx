import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, LevelBadge } from "@/components/ui";
import manifest from "@/data/sources/manifest.json";
import { getStore } from "@/lib/retrieval/store";

export const metadata: Metadata = {
  title: "عن المنهجية — تثبّت",
  description: "كيف يتحقق «تثبّت» من الرسائل الدينية: المصادر، مستويات المحتوى، حدود التغطية، وحالة المراجعة الشرعية.",
};

type ManifestEntry = { id: string; title: string; author?: string; type: string };
const BOOK_TYPES = new Set(["hadith_collection", "widespread_hadith_verdicts", "fabricated_list", "narrator_criticism", "hadith_takhrij", "hadith_commentary", "hadith_methodology"]);

const LEVELS: Array<{ level: "A" | "B" | "C" | "D"; text: string }> = [
  { level: "A", text: "حديث منسوب أو أثر أو آية: حكم منقول بنصه من المصدر مع موضعه، أو «لم نجد له أصلاً في المصادر المعتمدة التي فُحصت»." },
  { level: "B", text: "شرح أو معنى مستنبط: نعرض المادة المعتمدة مع مرجعها دون قطع." },
  { level: "C", text: "مسألة خلافية أو تعارض أحكام المحدثين: نبيّن الخلاف ونعرض الأقوال بمصادرها دون ترجيح آلي." },
  { level: "D", text: "فتوى أو حالة شخصية: لا نصدر حكماً ولا نجتهد؛ نحيلك إلى عالم أو جهة إفتاء رسمية." },
];

export default async function Methodology() {
  // الكتب المفهرسة فعلاً من الفهرس المبني نفسه (لا قائمة مكتوبة يدوياً)
  let indexed: { id: string; title: string; author?: string; entries: number }[] = [];
  let curatedCount = 0;
  let loadFailed = false;
  try {
    const store = await getStore();
    curatedCount = store.curated.size;
    indexed = store.indexedSources.map((id) => ({
      id,
      title: store.sourceMeta[id]?.title ?? id,
      author: store.sourceMeta[id]?.author?.replace(/\s*\([^)]*\)\s*$/, ""),
      entries: [...store.entries.values()].filter((e) => e.source_id === id).length,
    }));
  } catch {
    loadFailed = true;
  }
  const whitelist = (manifest as ManifestEntry[]).filter((m) => BOOK_TYPES.has(m.type)).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-3xl font-bold text-offwhite">عن المنهجية</h1>
      <Disclaimer />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">كيف نتحقق</h2>
        <ol className="list-decimal space-y-2 pe-6 ps-0 text-line marker:text-muted-light">
          <li>نفكك رسالتك إلى ادعاءات منفصلة، ونصنّف كل ادعاء بمستواه.</li>
          <li>نبحث عن كل ادعاء في فهرس محلي مبني مسبقاً من نصوص الكتب، دون اتصال بأي موقع أثناء البحث.</li>
          <li>يختار النموذج اللغوي المرشح الأقرب فقط، ولا يكتب حكماً ولا يحكم على حديث من عنده.</li>
          <li>يقتطع الكود نص المصدر بحروفه، ويحدد نوع الحكم بمعجم ثابت من لفظ العالم نفسه؛ فإن لم يرد في الجملة لفظ معروف عرضنا نص كلام العالم دون تصنيف.</li>
          <li>أي اقتباس ليس جزءاً حرفياً من نص المدخل المخزَّن يُلغى حكمه ويصير «لم نجد له أصلاً»، ولا يُخمَّن.</li>
          <li>الآيات تُقارَن برمجياً بنص المصحف المحلي دون نموذج لغوي، وتُكشف الكلمة المحرّفة.</li>
        </ol>
        <p className="text-line">
          نص المصدر يظهر في صندوق مستقل عن أي سطر يولّده النموذج، وكل سطر مولَّد («كيف فهمنا رسالتك») موسوم بذلك. والثقة تُحسب برمجياً من درجة التطابق ونجاح التحقق، لا من تقدير النموذج.
        </p>
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
        <h2 className="text-2xl font-semibold text-turquoise">الكتب المفهرسة وحدود التغطية</h2>
        {loadFailed ? (
          <p className="text-line">تعذّر تحميل قائمة الكتب المفهرسة الآن.</p>
        ) : (
          <ul className="list-disc space-y-1 pe-6 ps-0 text-line">
            {indexed.map((b) => (
              <li key={b.id}>
                «{b.title}»{b.author ? ` — ${b.author}` : ""} ({b.entries.toLocaleString("ar")} مدخلاً)
              </li>
            ))}
            <li>{curatedCount.toLocaleString("ar")} مدخلاً منتقى بأحكام بشرية منقولة بنصها، تسبق الفهرس.</li>
            <li>القرآن الكريم (رواية حفص) من نص مشروع Tanzil المحلي، للتحقق من الآيات.</li>
          </ul>
        )}
        <p className="text-line">
          قائمة الكتب المعتمدة تضم {whitelist.toLocaleString("ar")} كتاباً، والمفهرس منها الآن {indexed.length.toLocaleString("ar")} فقط. لذلك فعبارة «لم نجد» تعني أننا لم نجد في الكتب المفهرسة التي فُحصت، وهي ليست حكماً شرعياً على النص ولا تعني أنه لا أصل له.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">المراجعة الشرعية</h2>
        <p className="text-line">
          الأحكام المنتقاة والنصوص المستخرجة من الكتب لم يراجعها مرشد شرعي بعد، وقد تحقق منها الكود آلياً فقط (مطابقة النص للمصدر). لذلك يحمل كل حكم مستند إليها شارة «بانتظار مراجعة شرعية» إلى أن تُراجَع وتُسجَّل المراجعة. والتحقق الآلي لا يغني عن المراجعة الشرعية.
        </p>
        <p className="text-line">ما أُضيف إلى معجم الأحكام من ألفاظ بعد اختباره الأول موسوم أيضاً بأنه ينتظر مراجعة المرشد.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-turquoise">حدود الأداة</h2>
        <ul className="list-disc space-y-2 pe-6 ps-0 text-line">
          <li>الحكم على الرواية لا على العمل أو المسألة الفقهية؛ للفتوى راجع جهة مؤهلة.</li>
          <li>نلتزم بلفظ العالم منسوباً إلى كتابه، ولا نحوّل «لم أقف عليه» إلى «لا أصل له»، ولا نعمّم حكماً على صيغة إلى صيغ أخرى.</li>
          <li>لا نصدر حكم «صحيح» آلياً من عبارة «صحيح الإسناد»؛ يظهر «صحيح» فقط في مدخلات منتقاة بحكم بشري.</li>
          <li>قد يخطئ الاسترجاع في الرواية بالمعنى أو اللفظ المختلف كثيراً؛ ونمتنع حينها ولا نخمّن.</li>
          <li>لا نحفظ رسالتك ولا ملفاتك بعد المعالجة، ولا نسجل نصها؛ نسجل فقط بيانات تقنية (المدة وعدد الادعاءات والأحكام والتوكنز).</li>
          <li>أداة ذكاء اصطناعي للمساعدة في التحقق، وليست مفتياً.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-muted-light">
        <p>
          نص القرآن: Tanzil Quran Text (Uthmani v1.1) من <a className="inline-flex min-h-11 items-center px-1 text-turquoise underline underline-offset-4" href="https://tanzil.net" target="_blank" rel="noopener noreferrer">tanzil.net</a>، بترخيص Creative Commons Attribution 3.0، يُستخدم حرفياً دون تعديل.
        </p>
        <p>نصوص الكتب مأخوذة من تراث، وقورنت بعينة من الشاملة (التفصيل في سجل المصادر في المستودع).</p>
      </section>

      <p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-turquoise px-6 font-semibold text-navy">
          العودة إلى التحقق
        </Link>
      </p>
    </main>
  );
}
