# تقرير التقييم

> **غير نهائي**: مجموعة التحقق المستقلة لم تُوسَم/تُشغَّل بعد، فلا تُقرأ الأرقام أدناه دقةً نهائية للتسليم.

- التاريخ: 2026-10-04T16:52:35.575Z | commit: `37f2b83` | المعجم: `lexicon-2026-10-04.3` | البرومتات: `prompts-2026-10-04.5` | التسجيل: `scoring-2026-10-04.3`
- النموذج: `gemini-3.8-flash` (احتياطي `gemini-3.7-flash`) | 1 تشغيلات، توازٍ 5 | عتبة الثقة 0.75
- الكتب المفهرسة: maqasid-sakhawi، sahih-bukhari، sahih-muslim (+ 48 مدخل منتقى في نمط «مع curated»)

## بدون data/curated

### الدقة (كل تشغيل على حدة: #1)
1. **كل الادعاءات:** 63/74 (85.1%)
2. **الممكنة على الكتب المفهرسة:** 63/74 (85.1%)
   - المقام (2) = كل الادعاءات (74) ناقص 0 ادعاءً معروفاً (له curated_ref) لا مصدر له في أي كتاب مفهرس فعلاً. **الرقمان يُقرآن معاً.**

| الفئة | إصابات | امتناع على معروف | الحد | تقييم |
|---|---|---|---|---|
| hadith_fragments | 8/11 (72.7%) | 0 | 90% | ✗ |
| hadith_wording_altered | 42/48 (87.5%) | 0 | 100% | ✗ |
| wording_counter | 13/15 (86.7%) | 0 | 100% | ✗ |

**الحالات الحرجة:** 55/63 إصابة، 0 امتناع، 8 إخفاق

**حالات التسرب** (المتوقع not_found_in_sources): 0/0

**الإسناد** (الأحكام الإيجابية فقط، القاعدة 11): 50/50 (100.0%)
**تدقيق المصادر المستقل (اختلاق مصدر؛ الهدف 0):** 0 | **أحكام خُفِّضت لفشل التحقق:** 0
**authentic على لفظ معدَّل (خطأ حرج؛ الهدف 0):** 0 من 48 حالة معدَّلة
**مصطنعة نُسب لها حكم منقول (خطأ حرج):** 0

**الثبات بين التشغيلات:** 74/74 (100.0%) ادعاءً بحكم واحد في كل التشغيلات

**الزمن للرسالة:** وسيط 25ms | p95 99ms | أقصى 100ms (الهدف < 30000ms) | تشغيلات: 1ث
**نداءات النموذج:** 120 | احتاجت الاحتياطي: 0 | فشلت كلياً: 0 | رسائل بحالة غير ok: 9
**المصروف فعلاً (بعد الكاش):** $0.000 | إصابات الكاش 120، نداءات فعلية 0 (الأرقام التالية تكلفة مكافئة بلا كاش)
**التكلفة:** $0.243 لـ74 ادعاءً في 1 تشغيلات (≈ $0.0033 للادعاء)

**النموذج الذي خدم كل حالة (التشغيل الأول):**
- -: 4 حالة — WA006-add، FA011-prefix3، K001-counter، K002-counter
- cache: 70 حالة — WA001-swap، WA001-delete، WA001-replace، WA001-add، FA001-prefix3، WA002-swap، WA002-delete، WA002-replace، WA002-add، FA002-prefix3، WA003-swap، WA003-delete، WA003-replace، WA003-add، WA004-swap، WA004-delete، WA004-replace، WA004-add، FA004-prefix3، WA005-swap، WA005-delete، WA005-replace، WA005-add، FA005-prefix3، WA006-swap، WA006-delete، WA006-replace، FA006-prefix3، WA007-swap، WA007-delete، WA007-replace، WA007-add، FA007-prefix3، WA008-swap، WA008-delete، WA008-replace، WA008-add، FA008-prefix3، WA009-swap، WA009-delete، WA009-replace، WA009-add، FA009-prefix3، WA010-swap، WA010-delete، WA010-replace، WA010-add، FA010-prefix3، WA011-swap، WA011-delete، WA011-replace، WA011-add، WA012-swap، WA012-delete، WA012-replace، WA012-add، FA012-prefix3، K003-counter، K004-counter، K005-counter، K006-counter، K007-counter، K008-counter، K009-counter، K010-counter، K011-counter، K012-counter، K013-counter، K014-counter، K015-counter

### غير المصاب في تشغيل واحد على الأقل

- WA003-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim  [خدمه: cache]
- WA003-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim  [خدمه: cache]
- WA006-add* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)  [خدمه: -]
- FA008-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)  [خدمه: cache]
- WA009-swap* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)  [خدمه: cache]
- WA011-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)  [خدمه: cache]
- WA011-add* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)  [خدمه: cache]
- FA011-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)  [خدمه: -]
- FA012-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)  [خدمه: cache]
- K001-counter* [wording_counter] متوقع not_found_in_sources/not_a_religious_claim ← (error:llm_unavailable)  [خدمه: -]
- K002-counter* [wording_counter] متوقع not_found_in_sources/not_a_religious_claim ← (error:llm_unavailable)  [خدمه: -]

