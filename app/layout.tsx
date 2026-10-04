import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import "./globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "تثبّت — مدقق الرسائل الدينية المتداولة",
  description: "أداة ذكاء اصطناعي للمساعدة في التحقق من الرسائل الدينية المتداولة، وليست مفتياً.",
};

export const viewport: Viewport = { themeColor: "#12183F", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={readex.variable}>
      <body>{children}</body>
    </html>
  );
}
