import { createFileRoute } from "@tanstack/react-router";
import { LegacyAppHost } from "@/components/LegacyAppHost";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الأغبري | منصة ذكاء الأعمال والقرار" },
      { name: "description", content: "الأغبري — حلّل أي ملف أعمال واحصل على تقرير ذكي مدعوم بالأدلة وتوصيات وقرارات." },
      { property: "og:title", content: "الأغبري | منصة ذكاء الأعمال والقرار" },
      { property: "og:description", content: "حلّل أي ملف أعمال واحصل على تقرير ذكي مدعوم بالأدلة وتوصيات وقرارات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LegacyAppHost,
});
