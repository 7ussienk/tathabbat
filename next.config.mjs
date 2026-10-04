/** @type {import('next').NextConfig} */
const nextConfig = {
  // تقرير الجلب والفهرس المبني يُضمَّنان في حزمة الدوال (لا اعتماد على نظام الملفات وقت التشغيل: CLAUDE.md §9.1)
  outputFileTracingIncludes: {
    "/api/health": ["./data/index/**"],
    "/api/machine/health": ["./data/index/**"],
    "/api/verify": ["./data/index/**", "./data/quran/**"],
    "/api/machine/verify": ["./data/index/**", "./data/quran/**"],
  },
};

export default nextConfig;
