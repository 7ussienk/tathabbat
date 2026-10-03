#!/usr/bin/env python3
"""يقارن data/quran/quran-uthmani.txt (Tanzil) بنص مجمع الملك فهد (رواية حفص).

سكربت بيانات (ليس كود منتج). لا يحتاج مكتبات خارجية.
1) نزّل kfgqpc_hafs_v30.zip من https://qurancomplex.gov.sa/quran-dev/ وتحقق من SHA-256 المنشور في الصفحة.
2) فك الضغط وامنح السكربت مسار kfgqpc_hafs_v30.json:
     python scripts/compare_quran_kfgqpc.py path/to/kfgqpc_hafs_v30-data/kfgqpc_hafs_v30.json
لا يُرفع ملف المجمع إلى المستودع (شروط الاستخدام غير مفصّلة في صفحة المطورين).
"""
import argparse
import collections
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]')
WAQF = re.compile('[\u06D6-\u06DC\u06DE\u06E2\u06E5\u06E6\u06E9\u06EA-\u06ED\u08D3-\u08FF]')
END_MARK = re.compile('\\s*\u06DD[\u0660-\u0669\\d]+\\s*$')


def skel(s):
    """هيكل الحروف: بلا تشكيل ولا ألف/همزة، وتوحيد ى/ي وة/ت."""
    s = unicodedata.normalize('NFC', s)
    s = END_MARK.sub('', s)
    s = MARKS.sub('', s).replace('\u0671', '\u0627')
    s = re.sub('[\u0623\u0625\u0622\u0621]', '', s).replace('\u0627', '')
    s = s.replace('\u0649', '\u064A').replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0629', '\u062A')
    return re.sub('[^\u0621-\u064A]', '', s)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('kfgqpc_json')
    a = ap.parse_args()

    tz = {}
    for line in (ROOT / 'data' / 'quran' / 'quran-uthmani.txt').read_text(encoding='utf-8').splitlines():
        m = re.match(r'^(\d+)\|(\d+)\|(.*)$', line)
        if m:
            tz[(int(m[1]), int(m[2]))] = m[3].strip()
    kf = {(r['sura_no'], r['aya_no']): r
          for r in json.loads(Path(a.kfgqpc_json).read_text(encoding='utf-8-sig'))}
    print(f'Tanzil: {len(tz)} آية | المجمع: {len(kf)} آية')
    print('ناقص/زائد:', sorted(set(tz) ^ set(kf))[:10])

    basm = skel('بسم الله الرحمن الرحيم')

    def tz_text(k):  # Tanzil يضيف البسملة إلى الآية 1 (عدا الفاتحة والتوبة)
        t = tz[k]
        if k[1] == 1 and k[0] not in (1, 9):
            acc = ''
            words = t.split(' ')
            for i, w in enumerate(words):
                acc += skel(w)
                if acc == basm:
                    return ' '.join(words[i + 1:])
            raise SystemExit(f'تعذّر تحديد البسملة في {k}')
        return t

    bad = [k for k in sorted(tz) if skel(tz_text(k)) != skel(kf[k]['aya_text_unicode'])]
    print(f'فروق هيكل الحروف: {len(bad)}/{len(tz)}', bad[:20])

    def harm_tz(s):  # توحيد اصطلاحات السكون
        s = unicodedata.normalize('NFC', s)
        return s.replace('\u0652', '\u06E1').replace('\u06DF', '\u0652')

    def harm_kf(s):  # التنوين المفتوح + حذف علامة نهاية الآية
        s = END_MARK.sub('', unicodedata.normalize('NFC', s))
        return s.replace('\u08F0', '\u064B').replace('\u08F1', '\u064C').replace('\u08F2', '\u064D')

    def fin(s):
        return re.sub(r'\s+', ' ', WAQF.sub('', s).replace('\u0640', '')).strip()

    res = [k for k in sorted(tz) if fin(harm_tz(tz_text(k))) != fin(harm_kf(kf[k]['aya_text_unicode']))]
    print(f'تطابق تام بعد توحيد الاصطلاحات وتجاهل علامات الوقف: {len(tz) - len(res)}/{len(tz)}؛ المتبقي {len(res)}')

    cat = collections.Counter()
    ex = {}
    for k in res:
        x, y = fin(harm_tz(tz_text(k))), fin(harm_kf(kf[k]['aya_text_unicode']))
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, x, y, autojunk=False).get_opcodes():
            if op == 'equal':
                continue
            key = (op, ' '.join(f'U+{ord(c):04X}' for c in x[i1:i2]), ' '.join(f'U+{ord(c):04X}' for c in y[j1:j2]))
            cat[key] += 1
            ex.setdefault(key, f'{k[0]}:{k[1]}')
    print('أنواع الفروق (الأكثر تكراراً):')
    for (op, t, f), n in cat.most_common(20):
        print(f'{n:6d}  {op:8s} Tanzil[{t}] KFGQPC[{f}]  مثال {ex[(op, t, f)]}')


if __name__ == '__main__':
    main()
