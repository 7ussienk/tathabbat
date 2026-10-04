# تقرير التقييم

> **غير نهائي**: مجموعة التحقق المستقلة لم تُوسَم/تُشغَّل بعد، فلا تُقرأ الأرقام أدناه دقةً نهائية للتسليم.

- التاريخ: 2026-10-04T16:38:31.318Z | commit: `f5a19ff` | المعجم: `lexicon-2026-10-04.3` | البرومتات: `prompts-2026-10-04.5` | التسجيل: `scoring-2026-10-04.3`
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

**الزمن للرسالة:** وسيط 29ms | p95 104ms | أقصى 106ms (الهدف < 30000ms) | تشغيلات: 1ث
**نداءات النموذج:** 120 | احتاجت الاحتياطي: 0 | فشلت كلياً: 0 | رسائل بحالة غير ok: 9
**المصروف فعلاً (بعد الكاش):** $0.000 | إصابات الكاش 120، نداءات فعلية 0 (الأرقام التالية تكلفة مكافئة بلا كاش)
**التكلفة:** $0.243 لـ74 ادعاءً في 1 تشغيلات (≈ $0.0033 للادعاء)

### غير المصاب في تشغيل واحد على الأقل

- WA003-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim
- WA003-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim
- WA006-add* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)
- FA008-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)
- WA009-swap* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)
- WA011-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)
- WA011-add* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← (error:llm_unavailable)
- FA011-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)
- FA012-prefix3 [hadith_fragments] متوقع wording_differs/authentic ← (error:llm_unavailable)
- K001-counter* [wording_counter] متوقع not_found_in_sources/not_a_religious_claim ← (error:llm_unavailable)
- K002-counter* [wording_counter] متوقع not_found_in_sources/not_a_religious_claim ← (error:llm_unavailable)

