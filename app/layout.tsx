import type { Metadata, Viewport } from "next";
import { Amiri, Amiri_Quran, Readex_Pro } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-readex",
  display: "swap",
});

// خط النص المنقول من الكتب (يتميز بصرياً عن خط الواجهة): docs/DESIGN.md §3
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri", display: "swap" });
// خط الآيات (علامات الرسم العثماني)
const amiriQuran = Amiri_Quran({ subsets: ["arabic", "latin"], weight: "400", variable: "--font-amiri-quran", display: "swap" });

export const metadata: Metadata = {
  title: "تثبّت — مدقق الرسائل الدينية المتداولة",
  description: "أداة ذكاء اصطناعي للمساعدة في التحقق من الرسائل الدينية المتداولة، وليست مفتياً.",
};

export const viewport: Viewport = { themeColor: "#12183F", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${readex.variable} ${amiri.variable} ${amiriQuran.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-turquoise focus:px-4 focus:py-2 focus:text-navy">
          تخطَّ إلى المحتوى
        </a>
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg text-2xl font-bold text-turquoise" aria-label="تثبّت: الصفحة الرئيسية">
            تثبّت
          </Link>
          <nav aria-label="التنقل الرئيسي">
            <Link href="/methodology" className="inline-flex min-h-11 items-center rounded-lg px-3 text-base text-line hover:text-offwhite">
              عن المنهجية
            </Link>
          </nav>
        </header>
        <div id="main">{children}</div>
        <footer className="mx-auto w-full max-w-3xl px-4 pb-10 pt-12 text-center text-sm text-muted-light">
          مشارك في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي 2026
        </footer>
      </body>
    </html>
  );
}
