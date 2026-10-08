import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const App = lazy(() => import("@/legacy-app"));

function Loading() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      <span className="sr-only">جارٍ التحميل</span>
    </div>
  );
}

/** Report-Advisor workspace runs fully in the browser (file parsing, OCR, analysis). */
export function LegacyAppHost() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <App />
      </Suspense>
    </ClientOnly>
  );
}
