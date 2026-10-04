# تقرير التقييم

> **غير نهائي**: مجموعة التحقق المستقلة لم تُوسَم/تُشغَّل بعد، فلا تُقرأ الأرقام أدناه دقةً نهائية للتسليم.

- التاريخ: 2026-10-04T16:52:33.008Z | commit: `37f2b83` | المعجم: `lexicon-2026-10-04.3` | البرومتات: `prompts-2026-10-04.5` | التسجيل: `scoring-2026-10-04.3`
- النموذج: `gemini-3.8-flash` (احتياطي `gemini-3.7-flash`) | 1 تشغيلات، توازٍ 5 | عتبة الثقة 0.75
- الكتب المفهرسة: maqasid-sakhawi، sahih-bukhari، sahih-muslim (+ 48 مدخل منتقى في نمط «مع curated»)

## مع data/curated

### الدقة (كل تشغيل على حدة: #1)
1. **كل الادعاءات:** 148/151 (98.0%)

| الفئة | إصابات | امتناع على معروف | الحد | تقييم |
|---|---|---|---|---|
| composite | 19/20 (95.0%) | 0 | 100% | ✗ |
| fatwa_request | 10/10 (100.0%) | 0 | 100% | ✓ |
| hadith_fragments | 11/11 (100.0%) | 0 | 90% | ✓ |
| hadith_wording_altered | 46/48 (95.8%) | 0 | 100% | ✗ |
| hadith_wording_controls | 24/24 (100.0%) | 0 | 100% | ✓ |
| leakage | 3/3 (100.0%) | 0 | 100% | ✓ |
| no_origin | 12/12 (100.0%) | 0 | 100% | ✓ |
| quran_misquoted | 8/8 (100.0%) | 0 | 100% | ✓ |
| wording_counter | 15/15 (100.0%) | 0 | 100% | ✓ |

**الحالات الحرجة:** 126/129 إصابة، 0 امتناع، 3 إخفاق

**حالات التسرب** (المتوقع not_found_in_sources): 3/3

**الإسناد** (الأحكام الإيجابية فقط، القاعدة 11): 105/105 (100.0%)
**تدقيق المصادر المستقل (اختلاق مصدر؛ الهدف 0):** 0 | **أحكام خُفِّضت لفشل التحقق:** 0
**authentic على لفظ معدَّل (خطأ حرج؛ الهدف 0):** 0 من 48 حالة معدَّلة
**مصطنعة نُسب لها حكم منقول (خطأ حرج):** 0

**الثبات بين التشغيلات:** 150/150 (100.0%) ادعاءً بحكم واحد في كل التشغيلات

**الزمن للرسالة:** وسيط 34ms | p95 220ms | أقصى 326ms (الهدف < 30000ms) | تشغيلات: 2ث
**نداءات النموذج:** 287 | احتاجت الاحتياطي: 0 | فشلت كلياً: 0 | رسائل بحالة غير ok: 0
**المصروف فعلاً (بعد الكاش):** $0.000 | إصابات الكاش 251، نداءات فعلية 0 (الأرقام التالية تكلفة مكافئة بلا كاش)
**التكلفة:** $0.621 لـ151 ادعاءً في 1 تشغيلات (≈ $0.0041 للادعاء)

**النموذج الذي خدم كل حالة (التشغيل الأول):**
- cache: 151 حالة — T016، T017، T019، T020، T021، T022، T023، T024، T025، T026، T027، T028، T029، T030، T030، T030، T031، T031، T031، T032، T032، T066، T067، T068، T069، T070، T071، T072، T075، T076، T077، T078، T079، T080، T081، T082، T083، T084، T085، T085، T086، T086، T086، T087، T087، T088، T088، T089، T089، T089، L003، L004، L005، WA001-swap، WA001-delete، WA001-replace، WA001-add، CA001-exact، CA001-share، FA001-prefix3، WA002-swap، WA002-delete، WA002-replace، WA002-add، CA002-exact، CA002-share، FA002-prefix3، WA003-swap، WA003-delete، WA003-replace، WA003-add، CA003-exact، CA003-share، WA004-swap، WA004-delete، WA004-replace، WA004-add، CA004-exact، CA004-share، FA004-prefix3، WA005-swap، WA005-delete، WA005-replace، WA005-add، CA005-exact، CA005-share، FA005-prefix3، WA006-swap، WA006-delete، WA006-replace، WA006-add، CA006-exact، CA006-share، FA006-prefix3، WA007-swap، WA007-delete، WA007-replace، WA007-add، CA007-exact، CA007-share، FA007-prefix3، WA008-swap، WA008-delete، WA008-replace، WA008-add، CA008-exact، CA008-share، FA008-prefix3، WA009-swap، WA009-delete، WA009-replace، WA009-add، CA009-exact، CA009-share، FA009-prefix3، WA010-swap، WA010-delete، WA010-replace، WA010-add، CA010-exact، CA010-share، FA010-prefix3، WA011-swap، WA011-delete، WA011-replace، WA011-add، CA011-exact، CA011-share، FA011-prefix3، WA012-swap، WA012-delete، WA012-replace، WA012-add، CA012-exact، CA012-share، FA012-prefix3، K001-counter، K002-counter، K003-counter، K004-counter، K005-counter، K006-counter، K007-counter، K008-counter، K009-counter، K010-counter، K011-counter، K012-counter، K013-counter، K014-counter، K015-counter

### غير المصاب في تشغيل واحد على الأقل

- T032* [composite] متوقع no_basis_per_scholar ← refer_to_scholar  [خدمه: cache]
- WA003-delete* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim  [خدمه: cache]
- WA003-replace* [hadith_wording_altered] متوقع wording_differs/not_found_in_sources ← not_a_religious_claim  [خدمه: cache]

