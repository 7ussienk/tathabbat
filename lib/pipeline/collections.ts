/**
 * دواوين الحديث التي يجوز أن تُثبت «صحيح» بوجود الرواية فيها بلفظها (قرار 4 أكتوبر، البند 7): الصحيحان فقط.
 * السنن والمسانيد لا تُثبت الصحة بوجودها. و`authentic` لا يصدر إلا بتغطية ≥ 0.85 من كلمات الادعاء داخل المدخل.
 */
export const AUTHENTIC_COLLECTIONS = new Set(["sahih-bukhari", "sahih-muslim"]);
export const AUTHENTIC_COVERAGE_MIN = 0.85;
export const isAuthenticCollection = (sourceId: string) => AUTHENTIC_COLLECTIONS.has(sourceId);
