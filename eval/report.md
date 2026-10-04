# تقرير التقييم

> **غير نهائي**: مجموعة التحقق المستقلة لم تُوسَم/تُشغَّل بعد، فلا تُقرأ الأرقام أدناه دقةً نهائية للتسليم.

- التاريخ: 2026-10-04T13:11:19.729Z | commit: `1b8a349` | المعجم: `lexicon-2026-10-04.3` | البرومتات: `prompts-2026-10-04.4` | التسجيل: `scoring-2026-10-04.2`
- النموذج: `gemini-3.8-flash` (احتياطي `gemini-3.7-flash`) | 3 تشغيلات، توازٍ 5 | عتبة الثقة 0.75
- الكتب المفهرسة: maqasid-sakhawi، sahih-bukhari، sahih-muslim (+ 48 مدخل منتقى في نمط «مع curated»)

## مع data/curated

### الدقة (كل تشغيل على حدة: #1 / #2 / #3)
1. **كل الادعاءات:** 166/176 (94.3%) / 167/176 (94.9%) / 167/176 (94.9%)

| الفئة | إصابات | امتناع على معروف | الحد | تقييم |
|---|---|---|---|---|
| authentic | 11/12 (91.7%) | 0 | 90% | ✓ |
| composite | 19/20 (95.0%) | 0 | 100% | ✗ |
| disputed | 6/6 (100.0%) | 0 | 90% | ✓ |
| fatwa_request | 10/10 (100.0%) | 0 | 100% | ✓ |
| hadith_wording_altered | 45/48 (93.8%) | 0 | 100% | ✗ |
| hadith_wording_controls | 24/24 (100.0%) | 0 | 100% | ✓ |
| leakage | 3/3 (100.0%) | 0 | 100% | ✓ |
| no_origin | 12/12 (100.0%) | 0 | 100% | ✓ |
| not_religious | 1/1 (100.0%) | 0 | 90% | ✓ |
| quran_misquoted | 8/8 (100.0%) | 0 | 100% | ✓ |
| quran_verified | 4/4 (100.0%) | 0 | 90% | ✓ |
| widespread_variant | 5/8 (62.5%) | 1 | 90% | ✗ |
| widespread_weak_fabricated | 18/20 (90.0%) | 1 | 90% | ✓ |

**الحالات الحرجة:** 110/114 إصابة، 0 امتناع، 4 إخفاق / 111/114 إصابة، 0 امتناع، 3 إخفاق / 111/114 إصابة، 0 امتناع، 3 إخفاق

**حالات التسرب** (المتوقع not_found_in_sources): 3/3 / 3/3 / 3/3

**الإسناد** (الأحكام الإيجابية فقط، القاعدة 11): 142/142 (100.0%) / 142/142 (100.0%) / 142/142 (100.0%)
**تدقيق المصادر المستقل (اختلاق مصدر؛ الهدف 0):** 0 / 0 / 0 | **أحكام خُفِّضت لفشل التحقق:** 0 / 0 / 0
**authentic على لفظ معدَّل (خطأ حرج؛ الهدف 0):** 1 / 0 / 0 من 48 حالة معدَّلة
**مصطنعة نُسب لها حكم منقول (خطأ حرج):** 0

**الثبات بين التشغيلات:** 174/175 (99.4%) ادعاءً بحكم واحد في كل التشغيلات

**الزمن للرسالة:** وسيط 3338ms | p95 5440ms | أقصى 10707ms (الهدف < 30000ms) | تشغيلات: 120ث / 112ث / 111ث
**نداءات النموذج:** 1046 | احتاجت الاحتياطي: 0 | فشلت كلياً: 0 | رسائل بحالة غير ok: 0
**التكلفة:** $2.169 لـ528 ادعاءً في 3 تشغيلات (≈ $0.0041 للادعاء)

### غير المصاب في تشغيل واحد على الأقل

- T006 [widespread_weak_fabricated] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- T008 [widespread_weak_fabricated] متوقع fabricated ← not_found_in_sources (امتناع) ، not_found_in_sources (امتناع) ، not_found_in_sources (امتناع)
- T009 [widespread_variant] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- T010 [widespread_variant] متوقع weak ← not_found_in_sources (امتناع) ، not_found_in_sources (امتناع) ، not_found_in_sources (امتناع)
- T011 [widespread_variant] متوقع weak/fabricated/disputed ← wording_differs ، wording_differs ، wording_differs
- T013 [authentic] متوقع authentic ← wording_differs ، wording_differs ، wording_differs
- T032* [composite] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- WA003-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim ، not_a_religious_claim ، not_a_religious_claim
- WA003-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim ، not_a_religious_claim ، not_a_religious_claim
- WA005-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← authentic ، wording_differs ، wording_differs

## بدون data/curated

### الدقة (كل تشغيل على حدة: #1 / #2 / #3)
1. **كل الادعاءات:** 166/178 (93.3%) / 166/178 (93.3%) / 165/178 (92.7%)
2. **الممكنة على الكتب المفهرسة:** 166/176 (94.3%) / 166/176 (94.3%) / 165/176 (93.8%)
   - المقام (2) = كل الادعاءات (178) ناقص 2 ادعاءً معروفاً (له curated_ref) لا مصدر له في أي كتاب مفهرس فعلاً. **الرقمان يُقرآن معاً.**

| الفئة | إصابات | امتناع على معروف | الحد | تقييم |
|---|---|---|---|---|
| authentic | 11/12 (91.7%) | 0 | 90% | ✓ |
| composite | 19/20 (95.0%) | 0 | 100% | ✗ |
| disputed | 4/6 (66.7%) | 0 | 90% | ✗ |
| fatwa_request | 10/10 (100.0%) | 0 | 100% | ✓ |
| hadith_wording_altered | 46/48 (95.8%) | 0 | 100% | ✗ |
| hadith_wording_controls | 24/24 (100.0%) | 0 | 100% | ✓ |
| leakage | 5/5 (100.0%) | 0 | 100% | ✓ |
| no_origin | 12/12 (100.0%) | 0 | 100% | ✓ |
| not_religious | 1/1 (100.0%) | 0 | 90% | ✓ |
| quran_misquoted | 8/8 (100.0%) | 0 | 100% | ✓ |
| quran_verified | 4/4 (100.0%) | 0 | 90% | ✓ |
| widespread_variant | 4/8 (50.0%) | 2 | 90% | ✗ |
| widespread_weak_fabricated | 18/20 (90.0%) | 1 | 90% | ✓ |

**الحالات الحرجة:** 113/116 إصابة، 0 امتناع، 3 إخفاق / 113/116 إصابة، 0 امتناع، 3 إخفاق / 112/116 إصابة، 0 امتناع، 4 إخفاق

**حالات التسرب** (المتوقع not_found_in_sources): 5/5 / 5/5 / 5/5

**الإسناد** (الأحكام الإيجابية فقط، القاعدة 11): 140/140 (100.0%) / 139/139 (100.0%) / 139/139 (100.0%)
**تدقيق المصادر المستقل (اختلاق مصدر؛ الهدف 0):** 0 / 0 / 0 | **أحكام خُفِّضت لفشل التحقق:** 0 / 0 / 0
**authentic على لفظ معدَّل (خطأ حرج؛ الهدف 0):** 0 / 0 / 0 من 48 حالة معدَّلة
**مصطنعة نُسب لها حكم منقول (خطأ حرج):** 0

**الثبات بين التشغيلات:** 174/177 (98.3%) ادعاءً بحكم واحد في كل التشغيلات

**الزمن للرسالة:** وسيط 3339ms | p95 7505ms | أقصى 20493ms (الهدف < 30000ms) | تشغيلات: 121ث / 116ث / 133ث
**نداءات النموذج:** 1058 | احتاجت الاحتياطي: 12 | فشلت كلياً: 3 | رسائل بحالة غير ok: 3
**التكلفة:** $2.300 لـ534 ادعاءً في 3 تشغيلات (≈ $0.0043 للادعاء)

### غير المصاب في تشغيل واحد على الأقل

- T006 [widespread_weak_fabricated] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- T008 [widespread_weak_fabricated] متوقع fabricated ← not_found_in_sources (امتناع) ، not_found_in_sources (امتناع) ، not_found_in_sources (امتناع)
- T009 [widespread_variant] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- T010 [widespread_variant] متوقع weak ← not_found_in_sources (امتناع) ، not_found_in_sources (امتناع) ، not_found_in_sources (امتناع)
- T011 [widespread_variant] متوقع weak/fabricated/disputed ← wording_differs ، wording_differs ، wording_differs
- T013 [authentic] متوقع authentic ← scholar_text_only ، scholar_text_only ، scholar_text_only
- T030* [composite] متوقع weak/fabricated/disputed ← weak ، disputed ، quran_misquoted
- T032* [composite] متوقع no_basis_per_scholar ← wording_differs ، wording_differs ، wording_differs
- T048 [widespread_variant] متوقع fabricated ← not_found_in_sources (امتناع) ، not_found_in_sources (امتناع) ، not_found_in_sources (امتناع)
- T062 [disputed] متوقع disputed/misattributed/weak ← scholar_text_only ، scholar_text_only ، scholar_text_only
- T065 [disputed] متوقع disputed/weak ← scholar_text_only ، scholar_text_only ، scholar_text_only
- WA003-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim ، not_a_religious_claim ، not_a_religious_claim
- WA003-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim ، not_a_religious_claim ، not_a_religious_claim

