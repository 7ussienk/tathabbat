# خطة التنفيذ — «تثبّت»

> أُعدّت في 2 أكتوبر 2026 (قبل التحدي). لا كود قبل 4 أكتوبر. البنود المعلّمة **[قرار]** تحتاج جواباً من صاحب المشروع قبل التنفيذ. (راجع أيضاً الفقرة 7 «ما اختلف في توثيق Gemini».)

## 1. القرارات المعتمدة (من صاحب المشروع، 2 أكتوبر 2026)
ملخصها في `docs/DECISIONS.md` (#12–#24) وأثرها في `CLAUDE.md`.

| الموضوع | القرار |
|---|---|
| الاسترجاع | (مُحدَّث 3 أكتوبر) الشاملة MCP مقيَّداً بالقائمة البيضاء هو الأساس وقت التشغيل؛ `data/curated` احتياط وتسريع؛ `scope.book_ids` دائماً؛ المتن فقط؛ التحقق عبر `shamela_verify_quote`؛ تراث رابط تحقق ما لم يثبت دعمه القصر على كتب وفصل المتن/الحاشية؛ cache في الذاكرة |
| File Search | يُختبر أول صباح 4 أكتوبر؛ يُستبعد إن لم يُرجع نص المقطع |
| `not_found_in_sources` | امتناع؛ لا يصدر إلا بعد فحص كل كتب القائمة البيضاء، بصياغة «التي فُحصت» + قائمة الكتب (`checked_sources`) |
| الإسناد | يُحسب على الأحكام الإيجابية فقط |
| القرآن | ملف محلي `data/quran/` (Tanzil، نسخ حرفي دون تغيير)؛ بلا شبكة |
| التراخيص | صيغة موحدة للتراثي؛ الكود يرفض `TODO`؛ توحيد قيم `type` (تمّ في manifest) |
| `reviewed:false` | تظهر بشارة «بانتظار مراجعة شرعية» |
| `confidence` | برمجي من درجة الاسترجاع ونتيجة التحقق |
| تيليجرام | webhook مباشر في Next.js؛ n8n اختياري لاحقاً |
| التقييم | توازي 5 طلبات + cache |
| Gemini | Interactions API + `gemini-3.8-flash` عبر `GEMINI_MODEL`؛ الفوترة مفعّلة |

### ما أُغلق (3 أكتوبر)
- «الموضوعات» لابن الجوزي = الشاملة 882 (أُضيف)؛ ملف القرآن نُزّل (Tanzil v1.1)؛ `.mcp.json` أُضيف؛ شروط الشاملة منشورة (shamela.ws/page/terms) وسُجّلت، أما تراث فلا شروط منشورة فسُجّل النص المتفق عليه.
- النسخ المختارة مقبولة مبدئياً؛ **يُفضَّل ما يأتي فيه الحكم في المتن لا الحاشية**، ويُراجع ذلك عند فحص كل كتاب يوم 4.

### ما زال مفتوحاً
- **O1:** مراجعة النسخ المؤقتة (`edition_selection:"provisional"`) كتاباً كتاباً أثناء الـ spike.
- **O2:** التحقق من أن شروط الشاملة (تحدّ المعدل، ومعاينات البحث ليست دليلاً قبل فتح الصفحة) متوافقة مع تصميم البحث العميق: نعرض دائماً رابط الصفحة، ونلتزم بالمهلة والـ cache.
- **O3:** (حُسم) الهدف Vercel، والخادم الخاص بديل موثق (القرار 59).

## 2. الأسلوب العام
- Next.js 15 (App Router) + TypeScript strict + Tailwind، **npm**، Node 22 LTS.
- مكتبات التشغيل فقط: `next`, `react`, `@google/genai`, `zod`, `minisearch`, `@modelcontextprotocol/sdk` (البحث العميق).
- مكتبات التطوير: `typescript`, `tailwindcss`, `vitest`, `tsx` (للسكربتات), `eslint` (افتراضي Next). لا مكتبة UI ولا مكتبة حالة.
- كل خطوة معالجة دالة نقية تأخذ `LLMProvider` و`Retriever` كمعاملات (حقن تبعيات) ⇒ اختبارها بمزوّد وهمي دون شبكة.
- بيانات الاختبار الوهمية: معرّفات `TEST_HADITH_001` ونصوص واضحة الوهمية فقط (القاعدة 9).
- **التحقق البصري:** بعد كل مرحلة واجهة (2، ثم أي تعديل جوهري) لقطة شاشة بعرض 390px وأخرى لسطح المكتب، للتحقق من اتجاه RTL والتباين (النسبة الدنيا 4.5) وفق `docs/DESIGN.md` §2 و§10، وتُحفظ خارج Git أو في `docs/` دون شعارات.
- **الهوية:** ألوان الواجهة متغيرات CSS في `app/globals.css`، والخط Readex Pro عبر `next/font/google`، ولا شعارات للمنظمين في التطبيق أو المستودع (`CLAUDE.md` §6.1).

## 3. هيكل الملفات (حسب القسم 9 مع الإضافات)

```
app/
  page.tsx                  الصفحة الرئيسية (إدخال + نتيجة)
  methodology/page.tsx      عن المنهجية
  api/verify/route.ts       POST عام للواجهة (محدَّد المعدل لكل IP + سقف يومي)
  api/machine/verify/route.ts   مسار آلي للتقييم (VERIFY_API_TOKEN)؛ الاسم مبدئي
  api/health/route.ts       سطحي بلا Gemini؛ ?deep=1 ينادي الشاملة فقط
  layout.tsx, globals.css
components/                 InputTabs, ClaimCard, VerdictBadge, LevelBadge, SourceQuote, GeneratedNote, CopyReply, Disclaimer, ErrorBox
lib/
  config.ts                 قراءة env وفحصها بـ Zod
  schemas/                  claim.ts, verify-response.ts, manifest.ts, curated.ts, llm.ts
  arabic/normalize.ts       التطبيع + contains-normalized
  llm/provider.ts           interface LLMProvider
  llm/gemini.ts             التنفيذ
  llm/mock.ts               للاختبارات
  retrieval/{text-index (MiniSearch على data/curated فقط), file-search (خطة بديلة موسومة)}.ts
  ratelimit/{store,memory,upstash}.ts   واجهة RateLimitStore؛ الذاكرة افتراضياً وUpstash اختياري الاثنين
  verify-message.ts         verifyMessage(): تنادي بها المسارات الثلاثة
  pipeline/{normalize-input,extract-claims,classify-level,retrieve,judge,validate,compose-reply}.ts
  pipeline/run.ts           المنسّق (تجميع 2+3، توازي لكل ادعاء، مهلة كلية)
  deep-lookup/{shamela-mcp,turath,cache,index}.ts
  verify-link.ts            رابط بحث الدرر (بناء رابط فقط)
  telegram-format.ts
  log.ts                    سجلات تقنية بلا نص الرسالة
data/ (sources/manifest.json، curated/، quran/ ← ملف Tanzil) + data/index/text-index.json (يُولَّد وقت `npm run build` ولا يُلتزم)
scripts/{build-curated-index,gen-sources-md,validate-manifest}.ts   (+ upload-file-search.ts: خطة بديلة موسومة؛ لا سكربت يفهرس الكتب محلياً)
eval/{run-eval.ts,report.md}
integrations/n8n/tathabbat-telegram.json   (اختياري ومؤجَّل)
app/api/telegram/route.ts   webhook تيليجرام المباشر
tests/                      وحدة (Vitest)
Dockerfile, docker-compose.yml, Caddyfile.example, LICENSE
```

## 4. المخاطر التقنية (مرتبة بالأثر)

| # | الخطر | التخفيف |
|---|---|---|
| R1 | **تغطية القاعدة:** 13 مدخلاً محلياً لا تغطي 100 حالة؛ الشاملة مسار أساسي فاعتمادنا على توفرها وسرعتها | بحث الشاملة مقيّد بالقائمة البيضاء + cache + مهلة 8ث؛ `not_found_in_sources` لا يصدر إلا بفحص كامل (القاعدة 10) وإلا تُعرض صياغة «تعذّر البحث الموسع». توسيع `curated` قبل التحدي إن أمكن |
| R2 | **هل يعيد File Search نصوص المقاطع المسترجعة؟** القاعدة 3 تتطلب مقطعاً حرفياً. الاستشهادات الموثقة تعطي `file_name/source/custom_metadata` وقد لا تعطي النص | **قرار مُعتمد:** اختبار أول شيء صباح اليوم 1 (≤ 45 دقيقة)؛ إن لم يُرجع نص المقطع المسترجع **يُستبعد File Search** ويكتفى بـ MiniSearch + الشاملة. (احتمال وسط: استعادة `custom_metadata.entry_id` ثم قراءة النص من نسختنا المحلية — يُقبل فقط إن حقق القاعدة 3) |
| R3 | زمن < 30 ثانية (صوت + استخراج + استرجاع + حكم لكل ادعاء + بحث عميق) | دمج خطوتي 2+3 في استدعاء واحد؛ حكم كل ادعاء بالتوازي؛ نموذج Flash؛ مهلة البحث العميق 8 ثوانٍ؛ مهلة كلية 25 ثانية مع نتيجة جزئية؛ قياس الزمن في التقييم |
| R4 | تذبذب نتائج النموذج بين التشغيلات | temperature=0، مخرجات منظمة، والحكم ينشأ **اختياراً من الحكم المنقول** (`grading_quote`) لا صياغةً؛ تقرير ثبات في eval |
| R5 | `confidence` ذاتي من النموذج غير معاير | تُحسب برمجياً: (درجة التطابق النصي/الدلالي + نجاح التحقق + اتفاق الاثنين)، وتُستخدم مع `CONFIDENCE_THRESHOLD` |
| R6 | الشاملة MCP العامة: شروط الاستخدام، حدود المعدل، التوفر، أسماء الأدوات | spike في اليوم 1؛ cache؛ مهلة؛ التراجع الآمن؛ توثيق الشروط في SOURCES.md. الأدوات المتاحة لي الآن تعمل على مكتبة محلية، فالتحقق من الخادم العام يتم يوم 4 |
| R7 | تراث (turath) API غير موثق رسمياً | يُؤجَّل إلى آخر الأولويات (بعد الشاملة)؛ يُحذف دون أثر إن لم يتوفر |
| R8 | حدود Vercel: مدة الدالة وحجم جسم الطلب (صوت/صورة) | Vercel هو الهدف (القرار 59)؛ ضغط الصورة والصوت في المتصفح وتحديد الحجم؛ والتحقق من الحدود الحالية للخطة؛ الخادم الخاص بديل موثق |
| R9 | التطبيع العربي يكسر مطابقة الاقتباس (ألفاظ مروية بالمعنى) | اختبارات وحدة بحالات وهمية؛ التحقق يقارن بعد التطبيع فقط، وعدم التطابق ⇒ تخفيض |
| R10 | حقن أوامر (prompt injection) داخل نص الرسالة الواردة | الرسالة تُمرَّر كبيانات محددة بوسوم، المخرجات منظمة، والتحقق البرمجي يمنع أي مصدر غير مسترجع |
| R11 | الصوت العامي (يمني/خليجي) وخطأ التفريغ | درجة وضوح + تعديل المستخدم قبل المتابعة؛ حد 85% في التقييم |
| R12 | حفظ الخصوصية في السجلات والتقييم | `log.ts` يقبل حقولاً مسموحة فقط (allow-list) |

## 5. الجدول الزمني

### السبت 3 أكتوبر (تجهيز، بلا كود)
- إغلاق Q1–Q8، إضافة البخاري والدواوين وملف القرآن في `data/sources/` و`manifest.json`.
- مفتاح Gemini مفعّل الفوترة، اختبار صوت يدوي واحد في AI Studio، وبوت BotFather، وملفات الصوت 4–8.
- إرسال `widespread.jsonl` و`dataset.jsonl` للمرشد.

### اليوم 1 — الأحد 4 أكتوبر: المرحلتان 0 و1
- **صباحاً (9–12)**: spike File Search (R2؛ يُستبعد إن لم يُرجع النص) + spike الشاملة MCP العامة (R6: `shamela_verify_quote`، المهلة، حدود المعدل). + اختبار اختياري لخادم MCP الجمعية (`mcp.islamiccontent.org`) وواجهة HadeethEnc للبديل الصحيح (بشرط مطابقة الصحيحين). ثم المرحلة 0: `create-next-app`، tsconfig strict، env، Zod schemas، `normalize.ts` + اختباراتها، تحقق manifest (يرفض `license` فارغ **أو** يبدأ بـ `TODO`)، `build-curated-index.ts` (MiniSearch على data/curated فقط)، `gen-sources-md.ts`. commit. + (حسب القرارات 47–48): اختبار تراث (قصر البحث على كتب، فصل المتن عن الحاشية) واختبار الاتصال بالشاملة **من Vercel نفسه** على 30 استدعاء (الزمن والنجاح) وإعداد تسخين دوري عبر `/api/health`.
- **ظهراً/مساءً (12–22)**: المرحلة 1: LLMProvider+Gemini، الخطوات 2–7 نصاً فقط، `validate` مع اختبارات التخفيض ومنع المستوى د، `/api/verify`، `/api/health`. حالات يدوية من dataset. commit بعد كل خطوة كبيرة.
- **المخرج**: ادعاء نصي ⇒ JSON بحكم موثق (`no_basis_per_scholar` منقولاً) أو `not_found_in_sources` امتناعاً.

### اليوم 2 — الاثنين 5 أكتوبر: المرحلتان 2 و3
- **صباحاً**: الواجهة (RTL، جوال أولاً، داكن)، بطاقات الادعاءات، الرد الجاهز، صفحة المنهجية، رسائل الأخطاء، التنبيه الثابت.
- **ظهراً**: خطوة 1 (صوت/صورة) + حقل تعديل التفريغ عند ضعف الوضوح. البحث العميق (Shamela) بقائمة بيضاء ومهلة وcache.
- **مساءً**: `run-eval.ts` (3 تشغيلات، توازٍ محدود، تقرير)، أول تشغيل، معالجة الفشل في الحالات الحرجة أولاً. + خمس حالات «تسرب» (القرار 61) وقياس بنمطين (مع/بدون `data/curated`).
- **بعد المرحلة 2 (الواجهة):** لقطتا شاشة 390px وسطح مكتب، مع فحص RTL والتباين قبل المتابعة.

### اليوم 3 — الاثنين/الثلاثاء 6 أكتوبر: المرحلتان 4 و5 (حتى 11:59 م)
- **صباحاً**: تحسين التقييم حتى تنجح الحالات الحرجة 100%؛ ثم تيليجرام عبر webhook مباشر `/api/telegram` (يُؤجَّل أولاً عند ضيق الوقت؛ n8n اختياري ولا يُبنى إلا بعد الإتمام).
- **ظهراً**: Dockerfile + compose + Caddy، نشر، فحص `/api/health`، مراقبة دورية (uptime) للفترة 7–22 أكتوبر.
- **مساءً (قبل 8)**: README، SOURCES.md (مُولَّد)، docs/ARCHITECTURE وMETHODOLOGY، تقرير eval نهائي، الفيديو (≤ دقيقتين) والعرض. **تجميد الكود 10 م**، ثم دفع نهائي وتحقق من الرابط الحي من جهاز آخر.

### ما يُؤجَّل عند الضيق (حسب DECISIONS #10)
تيليجرام أولاً، ثم الصور فالصوت (حسب القرار 53). **لا يُمس**: الحالات الحرجة، ثم الاسترجاع المقيّد من الشاملة.

## 6. تفاصيل تصميم تحتاج تثبيتاً (تُعتمد ما لم تعترض)
1. **مخطط الاستجابة العلوي** (مُعرَّف كاملاً في CLAUDE.md §5 كنوع `VerifyResponse`):
   ```ts
   type VerifyResponse = {
     request_id: string; input_type: "text"|"image"|"audio";
     transcript?: { text: string; clarity: number; needs_confirmation: boolean };
     claims: ClaimResult[]; reply_text: string; telegram_text: string; disclaimer: string;
     status: "ok"|"needs_confirmation"|"partial"|"error";
     error?: { code: string; message_ar: string; next_step_ar: string };
     timings_ms: Record<string, number>;
   };
   ```
   وأُضيف إلى `ClaimResult`: `checked_sources`, `search_completeness`, `review_status`, `downgrade_reason`.
2. **التحقق من الاستشهاد**: `source_id` ∈ مقاطع الاسترجاع **و** `normalize(quoted_text)` ⊂ `normalize(passage)` **و** `normalize(grading_quote)` ⊂ المقطع؛ ولنتائج الشاملة يُستدعى `shamela_verify_quote` على الكتاب نفسه ويُشترط أن يكون في **المتن**؛ وللآيات مطابقة حرفية مع `data/quran/`. وإلا ⇒ `not_found_in_sources` مع `downgrade_reason`. (للقرآن المخزّن بـ Tanzil: لا يُعدَّل الملف، والتطبيع في الذاكرة.)
3. **اتساق الحكم مع الحكم المنقول**: النموذج يختار من `candidate_verdicts` المرتبطة بالمدخل (`verdict`/`also_judged_as` في curated)، ولا يضيف حكماً غير مدعوم.
4. **الشاملة**: النتيجة من `foot` (الحاشية) لا تُعد حكماً.
5. **الثقة (قرار 8):** `confidence = f(درجة الدمج الدلالي/النصي، تطابق الاقتباس، نجاح verify_quote)` بدالة بسيطة موثقة في METHODOLOGY، لا من النموذج.
6. **التسجيل** (القاعدة 26): `{ts, duration_ms, input_type, claims_count, verdicts[], downgrades, tokens_in, tokens_out, cost_estimate}` فقط، ولا نص رسالة.
7. **المسارات والمصادقة** (القرار 57): `/api/verify` عام بتحديد معدل لكل IP وسقف يومي، و`/api/telegram` بالترويسة السرية، ومسار آلي بـ `VERIFY_API_TOKEN`؛ وكلها تنادي `verifyMessage()`. المحدد في الذاكرة خلف `RateLimitStore` (تقريبي لكل نسخة) مع سقف Google/الرصيد، وUpstash اختياري الاثنين.

## 7. ما اختلف في توثيق Gemini API (راجعته 2 أكتوبر 2026)

| الموضوع | ما في الملف/المتوقع | الواقع الحالي |
|---|---|---|
| واجهة الاستدعاء | `@google/genai` عامة | **Interactions API** (`client.interactions.create`) متاحة GA منذ يونيو 2026 وموصى بها للمشاريع الجديدة؛ `generateContent` تُعد legacy لكنها مدعومة |
| النماذج | اسم من env | الأحدث المستقر `gemini-3.8-flash`؛ وFile Search يدعم 3.8/3.7/3.6/3.5 Flash وغيرها. نماذج 2.5 مقيّدة الوصول. **توصية:** `GEMINI_MODEL=gemini-3.8-flash` (التأكد في AI Studio) |
| File Search | store + رفع + استعلام | `ai.fileSearchStores.create({config:{embeddingModel:'models/gemini-embedding-2'}})`، `uploadToFileSearchStore`/`importFile`، وأداة `{type:"file_search", file_search_store_names:[...]}`. الاستشهادات `file_citation` فيها `file_name/source/custom_metadata`. **لا يدعم الصوت/الفيديو.** حد الملف 100MB |
| الدمج مع المخرجات المنظمة | غير مذكور | **مدعوم** في Gemini 3 (`response_format` بـ JSON schema) مع File Search وfunction calling |
| المخرجات المنظمة | Zod | `response_format:{type:'text', mime_type:'application/json', schema}`؛ بعض ميزات JSON Schema غير مدعومة، فنتحقق بعدها بـ Zod |
| الصوت | غير محدد | OGG/Opus مدعوم (يناسب voice تيليجرام)؛ الجسم المضمّن ≤ 20MB؛ Files API للأكبر؛ ~32 توكن/ثانية |
| الفوترة | غير مذكورة | (الفوترة ستُفعَّل — قرار 12) **File Search غير متاح في الطبقة المجانية**؛ تكلفة التضمين ≈ $0.15/مليون توكن؛ التخزين واستعلام التضمين مجانيان. `gemini-3.8-flash` ≈ $0.75 دخل / $3.75 خرج لكل مليون (حتى 31 ديسمبر 2026) |
| نموذج التفريغ | Gemini للتفريغ | يوجد أيضاً نموذج متخصص `Gemini 3.5 Transcribe`؛ نبدأ بـ Flash نفسه لبساطة المزود الواحد ونقارن إن ساء التفريغ العامي |

> هذه الأرقام من صفحات التوثيق الرسمية وقت المراجعة؛ تُعاد معاينتها صباح 4 أكتوبر قبل كتابة الكود (R2 يعتمد عليها).

## 8. تعارضات ونقص في CLAUDE.md (تفصيل)
انظر رسالة المراجعة في المحادثة؛ الأهم: Q1، Q2، Q3، وعدم تطابق أنواع manifest (`type`) وحقوله مع المخطط المذكور في القسم 3، وفراغ حقل `license` (قيمته «TODO…» تجتاز فحص «غير فارغ»).

## 9. القرارات المعمارية وقت التشغيل (3 أكتوبر 2026)
تفاصيلها في `CLAUDE.md` (القواعد 21–26) و`docs/DECISIONS.md` (#42–#53). المهام التنفيذية المترتبة:
- **الأحد (spikes):** (1) الشاملة MCP: حدود المعدل والمهلة ومصادقة الاتصال من Vercel؛ (2) تراث: دعم القصر على كتب وفصل المتن/الحاشية؛ (3) خادم MCP الجمعية وHadeethEnc: روابط فقط حتى تُؤكَّد الشروط؛ (4) 30 استدعاءً من Vercel لقياس الزمن والنجاح.
- **المرحلة 1:** `lib/deep-lookup/` بالـ MCP SDK (عمليات ثابتة، `scope.book_ids`، المتن فقط، مهلة 8ث، cache في الذاكرة)؛ واجهة النموذج تختار معرّف المرشّح فقط؛ اقتطاع الكود للنص والتحقق بـ `shamela_verify_quote`.
- **المرحلة 3 (eval):** حالات التسرب + القياس بنمطين (مع/بدون `data/curated`)؛ وعند ضعف الاسترجاع يُعرض خيار فهرسة المقاصد الحسنة وحدها وتُنتظر الموافقة.
- **الحماية:** تحديد معدل لكل IP + سقف يومي + رسالة عند بلوغه على المسار العام؛ `VERIFY_API_TOKEN` لمسار الآلات؛ `TELEGRAM_WEBHOOK_SECRET` للـ webhook.

### بوابة الأحد 9:15 (اتصال خادم الشاملة العام)
**ما وُجد (3 أكتوبر، قراءة فقط):** `https://shamela.link/mcp` يرد 401 `missing authorization header` مع `WWW-Authenticate: Bearer resource_metadata=…`. بيانات الموارد المحمية تعلن خادم تفويض `https://shamela.link/api/auth` (OAuth 2.x بـ PKCE-S256 وDPoP اختياري). خادم التفويض يعلن: `authorization_code` و`refresh_token` (بنطاق `offline_access`) و`client_credentials`، وتسجيل عملاء ديناميكياً (`/oauth2/register`)، ومصادقة العميل بـ none/secret/private_key_jwt. **لا مفتاح ثابت ولا صفحة مطورين**؛ الصفحة الرئيسية تقول فقط «الصق العنوان ثم سجّل الدخول مرة واحدة». وشروط الموقع (`/terms`) تقول: «ولا تنسخ المكتبة كلها عبره» و«لا تُشغِّل عليه ما يستنزفه عن غيره» وأن الخادم يرفض الطلبات بأدب عند بلوغ طاقته. لم يوضع أي توكن في أي ملف أو في Vercel.
- **البوابة:** نداء من **سكربت Node عادي بلا جلسة تفاعلية** (`MCP TypeScript SDK`) إلى `shamela_search_pages` و`shamela_get_page` و`shamela_verify_quote`. النجاح = أداء النداءات دون تدخل بشري ودون توكن مرتبط بحساب شخصي في الكود أو في Vercel.
- **الخطة (ب) إن فشلت:** استخراج متن «المقاصد الحسنة» فقط (متن بلا حواشي المحقق، 20 صفحة لكل طلب، طلب واحد في كل مرة) بجلسة مصادقة صاحب المشروع، ثم رفعه إلى مخزن File Search **لا إلى Git**، **بشرط أن يعيد File Search نص المقطع المسترجع**. (تنبيه: شروط الموقع تمنع «نسخ المكتبة كلها»؛ والترخيص لم يُحسم.)
- **الخطة (ج) إن لم يُعد File Search نص المقطع:** الطبقة المنتقاة (`data/curated`) + MiniSearch، مع تصريح علني بحدود التغطية في الواجهة وصفحة المنهجية وREADME.
- **جارٍ الآن (بيانات فقط):** استخراج متن «المقاصد الحسنة» إلى `data/local/` المستثنى من Git (القرار 65).

## 10. القرارات على التعارضات P1–P11 (3 أكتوبر 2026)
كانت هنا معلّقة ثم حسمها صاحب المشروع؛ تفاصيلها في `docs/DECISIONS.md` (#54–#66) و`CLAUDE.md`.

| # | القرار |
|---|---|
| P1 | الحكم الحي: النموذج يقترح جملة الحكم (substring حرفي) وتصنيفاً مرشحاً، والكود يتحقق بمعجم ثابت (موضوع/باطل→fabricated، لا أصل له→no_basis_per_scholar، ضعيف/منكر/لا يصح→weak). اتفاق⇒قبول، تعارض ألفاظ⇒disputed، لا لفظ⇒`scholar_text_only`. لا authentic آلياً. المنتقى يسبق الحي |
| P2 | الشرط على نص المدخل الكامل من صفحات متتالية حتى رقم المدخل التالي (حد أقصى صفحتان)، والرابط لصفحة بداية الاقتباس |
| P3 | MiniSearch على `data/curated` فقط؛ File Search خطة بديلة موسومة؛ لا سكربت يفهرس الكتب محلياً |
| P4 | ثلاثة مسارات (`/api/verify` عام، `/api/telegram`، مسار آلي بـ VERIFY_API_TOKEN) تنادي `verifyMessage()` |
| P5 | محدد معدل في الذاكرة (تقريبي لكل نسخة) خلف `RateLimitStore` + سقف Google/الرصيد؛ Upstash اختياري الاثنين |
| P6 | Vercel هو الهدف والخادم الخاص بديل موثق؛ `/api/health` سطحي بلا Gemini و`?deep=1` للشاملة فقط؛ التسخين من مراقب خارجي لا Vercel Cron |
| P7 | مفتوح حتى بوابة الأحد 9:15 (انظر §9)؛ وُثّق ما وُجد عن مصادقة الخادم |
| P8 | ملف القرآن يبقى في Git |
| P9 | لا إجراء |
| P10 | حالات التسرب (خمس) مساء الاثنين |
| P11 | حُذف `search_completeness`؛ يبقى `checked_sources` وأُضيف `failed_sources`؛ `not_found_in_sources` فقط إن كانت `failed_sources` فارغة وإلا `search_unavailable` |
