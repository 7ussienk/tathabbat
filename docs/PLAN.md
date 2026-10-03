# خطة التنفيذ — «تثبّت»

> أُعدّت في 2 أكتوبر 2026 (قبل التحدي). لا كود قبل 4 أكتوبر. البنود المعلّمة **[قرار]** تحتاج جواباً من صاحب المشروع قبل التنفيذ. (راجع أيضاً الفقرة 7 «ما اختلف في توثيق Gemini».)

## 1. القرارات المعتمدة (من صاحب المشروع، 2 أكتوبر 2026)
ملخصها في `docs/DECISIONS.md` (#12–#24) وأثرها في `CLAUDE.md`.

| الموضوع | القرار |
|---|---|
| الاسترجاع | (مُحدَّث 3 أكتوبر مساءً) فهرس MiniSearch محلي من متون القائمة البيضاء يُجلب وقت البناء عبر `turath-sdk`؛ `data/curated` يسبقه؛ لا اتصال بالشاملة/تراث/الدرر وقت التشغيل؛ الشاملة وتراث MCP أدوات تطوير فقط |
| File Search | خطة بديلة فقط إن فشل `getBookFile` |
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
  api/health/route.ts       سطحي بلا Gemini؛ ?deep=1 يفحص سلامة الفهرس المحلي
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
  (حُذف deep-lookup/ بقرار 3 أكتوبر؛ الاسترجاع من الفهرس المحلي)
  verify-link.ts            رابط بحث الدرر (بناء رابط فقط)
  telegram-format.ts
  log.ts                    سجلات تقنية بلا نص الرسالة
data/ (sources/manifest.json، curated/، quran/ ← ملف Tanzil) + data/index/text-index.json (يُولَّد وقت `npm run build` ولا يُلتزم)
scripts/{build-curated-index,gen-sources-md,validate-manifest}.ts   (+ upload-file-search.ts: خطة بديلة موسومة؛ لا سكربت يفهرس الكتب محلياً)
scripts/fetch-books.ts   جلب المتون عبر turath-sdk إلى data/local/ (خارج Git) ضمن npm run build
eval/{run-eval.ts,report.md}
integrations/n8n/tathabbat-telegram.json   (اختياري ومؤجَّل)
app/api/telegram/route.ts   webhook تيليجرام المباشر
tests/                      وحدة (Vitest)
Dockerfile, docker-compose.yml, Caddyfile.example, LICENSE
```

## 4. المخاطر التقنية (مرتبة بالأثر)

| # | الخطر | التخفيف |
|---|---|---|
| R1 | **تغطية الفهرس:** يغطي الكتب المجلوبة فقط (الأولوية: المقاصد الحسنة، ثم الصحيحان) | `not_found_in_sources` بصياغة «التي فُحصت» مع قائمة الكتب المفهرسة وتصريح بحدود التغطية؛ و`data/curated` يسبق؛ كتاب ثانٍ إن بقي وقت |
| R2 | **هل ينجح `getBookFile` للكتب الثلاثة ومن بيئة Vercel (Preview)؟** | بوابة الأحد 9:15 (القسم 9)؛ فشل ← File Search ثم `data/curated` فقط مع تصريح بحدود التغطية |
| R3 | زمن < 30 ثانية (صوت + استخراج + استرجاع + حكم لكل ادعاء + البحث في الفهرس المحلي) | دمج خطوتي 2+3 في استدعاء واحد؛ حكم كل ادعاء بالتوازي؛ نموذج Flash؛ مهلة البحث العميق 8 ثوانٍ؛ مهلة كلية 25 ثانية مع نتيجة جزئية؛ قياس الزمن في التقييم |
| R4 | تذبذب نتائج النموذج بين التشغيلات | temperature=0، مخرجات منظمة، والحكم ينشأ **اختياراً من الحكم المنقول** (`grading_quote`) لا صياغةً؛ تقرير ثبات في eval |
| R5 | `confidence` ذاتي من النموذج غير معاير | تُحسب برمجياً: (درجة التطابق النصي/الدلالي + نجاح التحقق + اتفاق الاثنين)، وتُستخدم مع `CONFIDENCE_THRESHOLD` |
| R6 | شروط turath.io وواجهته/`turath-sdk` وحدود المعدل، وفصل المتن عن الحاشية في `getBookFile` | استكشاف خارج المستودع (3 أكتوبر)؛ جلب بطيء بطلب واحد؛ توثيق الشروط في SOURCES.md؛ فشل الجلب يفشل النشر |
| R7 | اختلاف نص تراث عن الشاملة (الحزمة سمّت الشاملة) | مقارنة عينة 20 مدخلاً قبل التسليم وتوثيقها في SOURCES.md |
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
- **صباحاً (9–12)**: **بوابة 9:15** (القسم 9): `getBookFile` للكتب الثلاثة ثم الجلب من Vercel Preview؛ ثم المرحلة 0: `create-next-app`، tsconfig strict، env، Zod schemas، `normalize.ts` + اختباراتها، تحقق manifest (يرفض `license` فارغ **أو** يبدأ بـ `TODO`)، `scripts/fetch-books` و`build-curated-index.ts`، `gen-sources-md.ts`. commit.
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
تيليجرام أولاً، ثم الصور فالصوت (حسب القرار 53 والأولويات المحدثة). **لا يُمس**: الحالات الحرجة، ثم الفهرس المحلي والاسترجاع.

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
2. **التحقق من الاستشهاد**: `source_id` ∈ نتائج الفهرس المحلي **و** `normalize(quoted_text)` ⊂ `normalize(نص المدخل المخزَّن)` **و** `normalize(grading_quote)` ⊂ نص المدخل؛ وللآيات مطابقة حرفية مع `data/quran/`. وإلا ⇒ `not_found_in_sources` مع `downgrade_reason`. (للقرآن المخزّن بـ Tanzil: لا يُعدَّل الملف، والتطبيع في الذاكرة.)
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

## 9. القرارات المعمارية وقت التشغيل (مُحدَّث 3 أكتوبر مساءً)
يلغي هذا القسم نسخته السابقة (الاسترجاع الحي من الشاملة وخطتي (ب) و(ج) واستخراج «المقاصد الحسنة» يدوياً). التفاصيل في `CLAUDE.md` (القواعد 21–28 و§5.1) و`docs/DECISIONS.md` (#66–#76).
- **وقت التشغيل:** فهرس MiniSearch محلي، لا شبكة نحو الشاملة/تراث/الدرر. **الجلب** وقت البناء بـ `scripts/fetch-books` (`turath-sdk`، طلب واحد في كل مرة بمعدل بطيء) إلى `data/local/` خارج Git؛ فشله يفشل النشر.
- **المرحلة 1:** الفهرس المحلي (تطبيع عربي، أفضل 10)، النموذج يختار المرشح، الكود يقتطع النص حرفياً ويرفض ما ليس substring؛ `data/curated` تسبق.
- **المرحلة 3 (eval):** حالات التسرب (خمس، مساء الاثنين) + القياس بنمطين (مع/بدون `data/curated`).
- **الحماية:** تحديد معدل لكل IP + سقف يومي على المسار العام؛ `VERIFY_API_TOKEN` للمسار الآلي؛ `TELEGRAM_WEBHOOK_SECRET` للـ webhook.

### بوابة الأحد 9:15
1. اختبار `getBookFile` (turath-sdk) للكتب الثلاثة: «المقاصد الحسنة»، وصحيح البخاري، وصحيح مسلم (التوفر، الحجم، شكل الصفحة والمدخل، فصل المتن عن الحاشية).
2. اختبار الجلب من بيئة **Vercel (Preview)** نفسها.
3. **نجح ← نبني الفهرس.** **فشل ← File Search ثم `data/curated` فقط** مع تصريح علني بحدود التغطية في الواجهة وصفحة المنهجية وREADME.
- (للتاريخ: خادم `shamela.link/mcp` يتطلب OAuth 2.x ولا مفتاح ثابت له؛ وشروط الموقع تمنع «نسخ المكتبة كلها عبره». لذلك لم يعد وقت التشغيل يعتمد عليه، ويبقى أداة تطوير.)

## 10. القرارات على التعارضات P1–P11 (3 أكتوبر 2026)
كانت هنا معلّقة ثم حسمها صاحب المشروع؛ تفاصيلها في `docs/DECISIONS.md` (#54–#66) و`CLAUDE.md`.

| # | القرار |
|---|---|
| P1 | الحكم الحي: النموذج يقترح جملة الحكم (substring حرفي) وتصنيفاً مرشحاً، والكود يتحقق بمعجم ثابت (موضوع/باطل→fabricated، لا أصل له→no_basis_per_scholar، ضعيف/منكر/لا يصح→weak). اتفاق⇒قبول، تعارض ألفاظ⇒disputed، لا لفظ⇒`scholar_text_only`. لا authentic آلياً. المنتقى يسبق الحي |
| P2 | الشرط على نص المدخل الكامل من صفحات متتالية حتى رقم المدخل التالي (حد أقصى صفحتان)، والرابط لصفحة بداية الاقتباس |
| P3 | (سابقاً) MiniSearch على `data/curated` فقط — **حلّ محله قرار 3 أكتوبر مساءً: فهرس محلي من متون الكتب المجلوبة وقت البناء** |
| P4 | ثلاثة مسارات (`/api/verify` عام، `/api/telegram`، مسار آلي بـ VERIFY_API_TOKEN) تنادي `verifyMessage()` |
| P5 | محدد معدل في الذاكرة (تقريبي لكل نسخة) خلف `RateLimitStore` + سقف Google/الرصيد؛ Upstash اختياري الاثنين |
| P6 | Vercel هو الهدف والخادم الخاص بديل موثق؛ `/api/health` سطحي بلا Gemini و`?deep=1` لسلامة الفهرس؛ التسخين من مراقب خارجي لا Vercel Cron |
| P7 | (سابقاً) مصادقة `shamela.link/mcp` — **أُلغي موضوعه: لا اتصال بالشاملة وقت التشغيل**؛ بوابة الأحد صارت اختبار `getBookFile` (القسم 9) |
| P8 | ملف القرآن يبقى في Git |
| P9 | لا إجراء |
| P10 | حالات التسرب (خمس) مساء الاثنين |
| P11 | حُذف `search_completeness`؛ يبقى `checked_sources` وأُضيف `failed_sources`؛ `not_found_in_sources` فقط إن كانت `failed_sources` فارغة وإلا `search_unavailable` |
