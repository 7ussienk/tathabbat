# سجل الأدوات والتراخيص والاعتمادات

> كُتب هذا الملف في 2026-10-05 **من الملفات الفعلية** (`package.json` و`package-lock.json` وحقول `license` في `node_modules` وبيانات الخطوط المبنية وملف Tanzil والـ manifest) لا من الذاكرة. ما لم نتحقق منه مكتوب «**لم يُتحقق**» ولا نخمّنه. سجل المصادر الديني وحالة الترخيص لكل كتاب في [`SOURCES.md`](../SOURCES.md)، وهذا الملف يكمله بالأدوات والمكتبات والخطوط والخدمات.

## 1) المكتبات المباشرة (`package.json`)

الإصدار المثبَّت والترخيص قُرئا من `node_modules/<الحزمة>/package.json` (حقل `license`).

| الحزمة | الاستخدام | النطاق في package.json | المثبَّت | الترخيص |
|---|---|---|---|---|
| `@google/genai` | وقت التشغيل | ^2.27.0 | 2.27.0 | Apache-2.0 |
| `minisearch` | وقت التشغيل | ^7.2.0 | 7.2.0 | MIT |
| `next` | وقت التشغيل | ^15.5.27 | 15.5.27 | MIT |
| `react` | وقت التشغيل | ^19.3.0 | 19.3.0 | MIT |
| `react-dom` | وقت التشغيل | ^19.3.0 | 19.3.0 | MIT |
| `zod` | وقت التشغيل | ^4.6.5 | 4.6.5 | MIT |
| `@tailwindcss/postcss` | تطوير/بناء | ^4.3.3 | 4.3.3 | MIT |
| `tailwindcss` | تطوير/بناء | ^4.3.3 | 4.3.3 | MIT |
| `postcss` | تطوير/بناء | ^8.5.28 | 8.5.28 | MIT |
| `typescript` | تطوير/بناء | ^6.0.3 | 6.0.3 | Apache-2.0 |
| `tsx` | تطوير/بناء | ^4.23.15 | 4.23.15 | MIT |
| `vitest` | اختبارات | ^5.0.3 | 5.0.3 | MIT |
| `playwright` | لقطات الشاشة وحارس العرض | ^1.63.0 | 1.63.0 | Apache-2.0 |
| `@types/node` | أنواع TypeScript | ^26.6.4 | 26.6.4 | MIT |
| `@types/react` | أنواع TypeScript | ^19.3.0 | 19.3.0 | MIT |
| `@types/react-dom` | أنواع TypeScript | ^19.3.0 | 19.3.0 | MIT |

سكربتات بايثون للمراجعة (`scripts/*.py`) تستورد `openpyxl` (3.1.5، ترخيص MIT بحسب `pip show`)؛ وهي أدوات تطوير خارج التطبيق.

## 2) ملخص تراخيص كل الحزم (المباشرة والمتفرعة)

المصدر: حقل `license` لكل حزمة في `package-lock.json` (**223** حزمة، تشمل الحزم الاختيارية الخاصة بمنصات أخرى). المثبَّت فعلاً على جهاز التطوير (ويندوز) **120** نسخة، وتوزيعه مماثل (MIT 83 · Apache-2.0 14 · BSD-3-Clause 12 · MPL-2.0 4 · ISC 3 · LGPL مركَّب 2 · CC-BY-4.0 1 · 0BSD 1). المجاميع أدناه من ملف القفل:

| الترخيص | عدد الحزم |
|---|---|
| MIT | 142 |
| Apache-2.0 | 26 |
| MPL-2.0 | 24 |
| BSD-3-Clause | 12 |
| LGPL-3.0-or-later (منفرداً) | 10 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| ISC | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| CC-BY-4.0 | 1 |
| 0BSD | 1 |
| **غير معروف / بلا حقل ترخيص** | **0** |

**التراخيص غير المتساهلة (للشفافية):**
- **GPL / AGPL: لا شيء.**
- **LGPL-3.0-or-later (14 حزمة في ملف القفل):** كلها ثنائيات `@img/sharp-libvips-*` و`@img/sharp-win32-*` و`@img/sharp-wasm32`، وهي حزم اختيارية للمكتبة الصورية `sharp` التي يجلبها `next` (`npm ls`: `next → sharp → @img/sharp-<المنصة>`). **لا يستورد كودنا هذه الحزم ولا نعدّلها، ولا يستخدم المشروع `next/image`.** هل تُحزَم في نشر Vercel الفعلي: **لم يُتحقق**.
- **MPL-2.0 (24 حزمة):** `lightningcss` وثنائياته للمنصات، تأتي عبر `@tailwindcss/postcss` وعبر `vite` (من `vitest`)؛ أدوات بناء واختبار غير معدَّلة.
- **CC-BY-4.0:** `caniuse-lite` (بيانات متصفحات يجلبها `next`، لا كود)؛ يتطلب نسبة البيانات إلى caniuse.com.
- هذه القراءة من حقول البيانات الوصفية للحزم، **ولم تُراجَع نصوص التراخيص الكاملة ولا ملفات NOTICE** (لم يُتحقق).

## 3) الخطوط

تُحمَّل عبر `next/font/google` وقت البناء (`app/layout.tsx`)، ولا تُنسخ ملفاتها إلى المستودع. المعلومات أدناه **مقروءة من جدول `name` داخل ملفات الخطوط المبنية** (`.next/static/media/*.woff2`، مُفكَّكة آلياً) لا من الذاكرة:

| الخط | حقوق النسخ المكتوبة في الخط | الترخيص كما في الخط |
|---|---|---|
| Readex Pro | Copyright 2019 The Readex Pro Project Authors (https://github.com/ThomasJockin/readexpro) | حقل نص الترخيص فارغ، وحقل الرابط يشير إلى https://openfontlicense.org (أي SIL OFL). نص الترخيص الكامل **لم يُتحقق** منه |
| Amiri | Copyright 2010-2022 The Amiri Project Authors (https://github.com/aliftype/amiri) | الرابط https://openfontlicense.org (OFL)؛ نص الترخيص الكامل **لم يُتحقق** منه |
| Amiri Quran | Copyright 2010-2022 The Amiri Project Authors (https://github.com/aliftype/amiri) | الرابط https://openfontlicense.org (OFL)؛ نص الترخيص الكامل **لم يُتحقق** منه |
| Scheherazade New | Copyright (c) 1994-2026, SIL Global (https://www.sil.org/), with Reserved Font Names "Scheherazade" and "SIL" | **مكتوب صراحة في الخط:** «licensed under the SIL Open Font License, Version 1.1» |

لم نقرأ ملفات ترخيص الخطوط في مستودعاتها الأصلية (**لم يُتحقق**).

## 4) مصادر البيانات

### نص القرآن الكريم: Tanzil
الملف `data/quran/quran-uthmani.txt` (Tanzil Quran Text، Uthmani، الإصدار 1.1). **كتلة الترخيص منسوخة حرفياً من آخر الملف:**

```
# PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK
#====================================================================
#
#  Tanzil Quran Text (Uthmani, Version 1.1)
#  Copyright (C) 2007-2026 Tanzil Project
#  License: Creative Commons Attribution 3.0
#
#  This copy of the Quran text is carefully produced, highly 
#  verified and continuously monitored by a group of specialists 
#  at Tanzil Project.
#
#  TERMS OF USE:
#
#  - Permission is granted to copy and distribute verbatim copies 
#    of this text, but CHANGING IT IS NOT ALLOWED.
#
#  - This Quran text can be used in any website or application, 
#    provided that its source (Tanzil Project) is clearly indicated, 
#    and a link is made to tanzil.net to enable users to keep
#    track of changes.
#
#  - This copyright notice shall be included in all verbatim copies 
#    of the text, and shall be reproduced appropriately in all files 
#    derived from or containing substantial portion of this text.
#
#  Please check updates at: http://tanzil.net/updates/
#
#====================================================================
```

الاستخدام: نص حرفي بلا تعديل، منسوب إلى Tanzil مع رابط tanzil.net في README وSOURCES.md وصفحة المنهجية.

### الكتب المفهرسة (متونها لا تُرفع إلى Git)
حالتها كما في [`SOURCES.md`](../SOURCES.md) (لا نكررها هنا): ثلاثة كتب (صحيح البخاري، صحيح مسلم، المقاصد الحسنة) تُجلب وقت البناء من `files.turath.io` وتُفهرس محلياً، والترخيص الموحَّد في الـ manifest: «نص تراثي في الملك العام؛ الطبعة من المكتبة الشاملة (shamela.ws)؛ يُقتبس المتن فقط دون حواشي المحقق».

| الخدمة / المصدر | الحالة (كما في SOURCES.md) |
|---|---|
| **تراث (turath.io، `files.turath.io`)** | مصدر نص الفهرس وقت البناء؛ المسار `books-v3` غير موثق. **شروط turath.io وواجهته لم يُتحقق منها**، ولم يُتواصل مع القائمين عليها. الاستخدام: بحث واقتباس قصير مع العزو |
| **المكتبة الشاملة (shamela.ws)** | مرجع المقارنة والتحقق أثناء التطوير (أداة MCP تطوير فقط، لا اتصال وقت التشغيل) وروابط العزو للمدخلات المنتقاة. شروطها تنص على أن «النصوص والتحقيقات لأصحابها وناشريها» (روجعت 2026-10-02). **حقوق التحقيق والطبعة (البغا، عبد الباقي، الغماري) لم يُتحقق من وضعها** |
| **الدرر السنية (dorar.net)** | **رابط تحقق خارجي فقط** يُبنى من نص الادعاء؛ لا أحكام ولا اتصال وقت التشغيل ولا نسخ ولا تخزين. شروطهم تمنع النسخ خارج الموقع، ولم يُنسخ شيء |
| مجمع الملك فهد (qurancomplex.gov.sa) | مرجع مقارنة لنص القرآن فقط (قورن في 2026-10-03)؛ لم يُنسخ منه شيء، وشروط منصته **لم يُتحقق** منها |
| HadeethEnc وخادم MCP الجمعية | **غير مستخدمين** في هذه النسخة |
| المدخلات المنتقاة (`data/curated/`، 48 مدخلاً) | أحكام الأئمة منقولة بنصها وموضعها من الكتب أعلاه؛ `reviewed:false` (لم تحصل مراجعة متخصص شرعي) |

## 5) الخدمات

| الخدمة | الاستخدام | الحالة |
|---|---|---|
| **Gemini API (Google)** | استخراج الادعاءات واختيار المرشح وتفريغ الصوت؛ يُرسل إليه نص الرسالة أو المقطع الصوتي (`store:false`). لا يُصدر حكماً شرعياً | شروط Google لخدمة API المدفوعة: **لم تُراجَع** نصاً |
| **Vercel** | استضافة التطبيق والدوال (https://tathabbat.vercel.app) | شروط Vercel والخطة المستخدمة: **لم تُراجَع** هنا |
| **GitHub** | المستودع العام https://github.com/7ussienk/tathabbat | شروط GitHub: لم تُراجَع |

## 6) أدوات التطوير (بصدق)

- **Claude Code (Anthropic):** بُني المشروع بمساعدته (إفصاح معلن في README، و`CLAUDE.md` ظاهر في المستودع العام). شروط الخدمة والمخرجات: **لم تُراجَع** هنا.
- **أداتا MCP للشاملة وتراث:** للتطوير فقط (التحقق من النصوص أثناء إعداد البيانات)، ولا يُتصل بهما وقت التشغيل. المسجَّل في `.mcp.json` خادم الشاملة (`shamela.link/mcp`)؛ شروط الخادم **لم تُراجَع**.
- **Playwright:** لقطات الشاشة وحارس الفيض الأفقي (`npm run guard:overflow`) على بيانات وهمية.
- **Python:** `openpyxl` لسكربتات ورقة المراجعة.
- **Git وGitHub وVercel وNode.js 22:** البناء والنشر.
- قاعدة المشروع (القاعدة 9 في `CLAUDE.md`): بيانات الأحكام الدينية يوفرها صاحب المشروع من الكتب، ولا يكتبها النموذج.

## 7) ما لم يُتحقق منه (ملخص)

1. نصوص التراخيص الكاملة لحزم npm وملفات NOTICE.
2. هل تُحزَم ثنائيات `sharp`/libvips (LGPL) في نشر Vercel.
3. نصوص ترخيص الخطوط في مستودعاتها (المقروء: بيانات الخط فقط).
4. شروط turath.io وواجهته، وحقوق التحقيق والطبعة للكتب الثلاثة.
5. شروط Gemini API وVercel وGitHub وClaude Code والخادم MCP.
6. المراجعة الشرعية لأي مدخل (`reviewed:false`).
