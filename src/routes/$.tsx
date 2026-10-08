import { createFileRoute } from "@tanstack/react-router";
import { LegacyAppHost } from "@/components/LegacyAppHost";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "مساحة العمل | الأغبري" },
      { name: "description", content: "مساحة عمل الأغبري: التقارير الذكية، الأدلة، القرارات، والمتابعة." },
      { property: "og:title", content: "مساحة العمل | الأغبري" },
      { property: "og:description", content: "التقارير الذكية، الأدلة، القرارات، والمتابعة في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LegacyAppHost,
});
