import { createFileRoute } from "@tanstack/react-router";

// Server boundary for approving an uploaded source: verifies the caller's session
// and company, re-reads the stored file, and runs the durable canonical import.
export const Route = createFileRoute("/api/canonical-import-execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCanonicalImportExecute } = await import("@/server/canonical-import-execute.server");
        return handleCanonicalImportExecute(request);
      },
    },
  },
});
