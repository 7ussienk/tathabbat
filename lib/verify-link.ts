/**
 * رابط تحقق خارجي (الدرر السنية) يُبنى من نص الادعاء. **رابط فقط**: لا أحكام منها ولا اتصال بها ولا
 * تخزين لشيء من بياناتها (القاعدتان 17 و25).
 */
export function verifyLink(claimText: string): string {
  return `https://dorar.net/hadith/search?q=${encodeURIComponent(claimText.trim().slice(0, 200))}`;
}
