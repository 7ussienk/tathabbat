# خطة التنفيذ — «تثبّت»

> أُعدّت في 2 أكتوبر 2026 (قبل التحدي). لا كود قبل 4 أكتوبر. البنود المعلّمة **[قرار]** تحتاج جواباً من صاحب المشروع قبل التنفيذ. (راجع أيضاً الفقرة 7 «ما اختلف في توثيق Gemini».)

## 1. القرارات المعتمدة (من صاحب المشروع، 2 أكتوبر 2026)
ملخصها في `docs/DECISIONS.md` (#12–#24) وأثرها في `CLAUDE.md`.

| الموضوع | القرار |
|---|---|
| الاسترجاع | المحلي المنتقى + الشاملة MCP مساران أساسيان؛ `scope.book_ids` دائماً؛ التحقق عبر `shamela_verify_quote`؛ تراث احتياطي؛ cache لنتائج الشاملة |
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
- **O3:** اختيار الاستضافة: Vercel أم خادم خاص.

## 2. الأسلوب العام
- Next.js 15 (App Router) + TypeScript strict + Tailwind، **npm**، Node 22 LTS.
- مكتبات التشغيل فقط: `next`, `react`, `@google/genai`, `zod`, `minisearch`, `@modelcontextprotocol/sdk` (البحث العميق).
- مكتبات التطوير: `typescript`, `tailwindcss`, `vitest`, `tsx` (للسكربتات), `eslint` (افتراضي Next). لا مكتبة UI ولا مكتبة حالة.
- كل خطوة معالجة دالة نقية تأخذ `LLMProvider` و`Retriever` كمعاملات (حقن تبعيات) ⇒ اختبارها بمزوّد وهمي دون شبكة.
- بيانات الاختبار الوهمية: معرّفات `TEST_HADITH_001` ونصوص واضحة الوهمية فقط (القاعدة 9).

## 3. هيكل الملفات (حسب القسم 9 مع الإضافات)

```
app/
  page.tsx                  الصفحة الرئيسية (إدخال + نتيجة)
  methodology/page.tsx      عن المنهجية
  api/verify/route.ts       POST (maxDuration، مصادقة Bearer للبوت فقط)
  api/health/route.ts
  layout.tsx, globals.css
components/                 InputTabs, ClaimCard, VerdictBadge, LevelBadge, SourceQuote, GeneratedNote, CopyReply, Disclaimer, ErrorBox
lib/
  config.ts                 قراءة env وفحصها بـ Zod
  schemas/                  claim.ts, verify-response.ts, manifest.ts, curated.ts, llm.ts
  arabic/normalize.ts       التطبيع + contains-normalized
  llm/provider.ts           interface LLMProvider
  llm/gemini.ts             التنفيذ
  llm/mock.ts               للاختبارات
  retrieval/{file-search,text-index,hybrid}.ts
  pipeline/{normalize-input,extract-claims,classify-level,retrieve,judge,validate,compose-reply}.ts
  pipeline/run.ts           المنسّق (تجميع 2+3، توازي لكل ادعاء، مهلة كلية)
  deep-lookup/{shamela-mcp,turath,cache,index}.ts
  verify-link.ts            رابط بحث الدرر (بناء رابط فقط)
  telegram-format.ts
  log.ts                    سجلات تقنية بلا نص الرسالة
data/ (sources/manifest.json، curated/، quran/ ← ملف Tanzil) + data/index/text-index.json (يُولَّد وقت `npm run build` ولا يُلتزم)
scripts/{build-index,upload-file-search,gen-sources-md,validate-manifest}.ts
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
| R8 | حدود Vercel: مدة الدالة وحجم جسم الطلب (صوت/صورة) | خادم خاص هو الافتراضي؛ على Vercel: ضغط الصورة والصوت في المتصفح وتحديد الحجم، وتحقق من الحدود الحالية للخطة |
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
- **صباحاً (9–12)**: spike File Search (R2؛ يُستبعد إن لم يُرجع النص) + spike الشاملة MCP العامة (R6: `shamela_verify_quote`، المهلة، حدود المعدل). + اختبار اختياري لخادم MCP الجمعية (`mcp.islamiccontent.org`) وواجهة HadeethEnc للبديل الصحيح (بشرط مطابقة الصحيحين). ثم المرحلة 0: `create-next-app`، tsconfig strict، env، Zod schemas، `normalize.ts` + اختباراتها، تحقق manifest (يرفض `license` فارغ **أو** يبدأ بـ `TODO`)، `build-index.ts` (MiniSearch)، `upload-file-search.ts`، `gen-sources-md.ts`. commit.
- **ظهراً/مساءً (12–22)**: المرحلة 1: LLMProvider+Gemini، الخطوات 2–7 نصاً فقط، `validate` مع اختبارات التخفيض ومنع المستوى د، `/api/verify`، `/api/health`. حالات يدوية من dataset. commit بعد كل خطوة كبيرة.
- **المخرج**: ادعاء نصي ⇒ JSON بحكم موثق (`no_basis_per_scholar` منقولاً) أو `not_found_in_sources` امتناعاً.

### اليوم 2 — الاثنين 5 أكتوبر: المرحلتان 2 و3
- **صباحاً**: الواجهة (RTL، جوال أولاً، داكن)، بطاقات الادعاءات، الرد الجاهز، صفحة المنهجية، رسائل الأخطاء، التنبيه الثابت.
- **ظهراً**: خطوة 1 (صوت/صورة) + حقل تعديل التفريغ عند ضعف الوضوح. البحث العميق (Shamela) بقائمة بيضاء ومهلة وcache.
- **مساءً**: `run-eval.ts` (3 تشغيلات، توازٍ محدود، تقرير)، أول تشغيل، معالجة الفشل في الحالات الحرجة أولاً.

### اليوم 3 — الاثنين/الثلاثاء 6 أكتوبر: المرحلتان 4 و5 (حتى 11:59 م)
- **صباحاً**: تحسين التقييم حتى تنجح الحالات الحرجة 100%؛ ثم تيليجرام عبر webhook مباشر `/api/telegram` (يُؤجَّل أولاً عند ضيق الوقت؛ n8n اختياري ولا يُبنى إلا بعد الإتمام).
- **ظهراً**: Dockerfile + compose + Caddy، نشر، فحص `/api/health`، مراقبة دورية (uptime) للفترة 7–22 أكتوبر.
- **مساءً (قبل 8)**: README، SOURCES.md (مُولَّد)، docs/ARCHITECTURE وMETHODOLOGY، تقرير eval نهائي، الفيديو (≤ دقيقتين) والعرض. **تجميد الكود 10 م**، ثم دفع نهائي وتحقق من الرابط الحي من جهاز آخر.

### ما يُؤجَّل عند الضيق (حسب DECISIONS #10)
تراث ⇒ البحث العميق ⇒ تيليجرام ⇒ الصور ⇒ الصوت. **لا يُمس**: الحالات الحرجة.

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
6. **التسجيل**: `{ts, duration_ms, input_type, claims_count, verdicts[], downgrades}` فقط.
7. **المصادقة**: `/api/verify` مفتوح للويب بتحديد معدل (rate limit) في الذاكرة، ويقبل Bearer للبوت.

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
