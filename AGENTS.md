<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- The Report-Advisor workspace (src/legacy-app.tsx, src/views, src/components, src/lib) is imported from GitHub main and runs client-only via src/components/LegacyAppHost.tsx from the `/` and `/$` routes; reuse/fix it rather than rebuilding (no-rebuild policy from the transfer pack).
- Screens import routing from `@/lib/router-compat`, a local adapter over TanStack Router history; never install react-router-dom.
- No paid AI services: all analysis is deterministic and in-browser (pdfjs, mammoth, xlsx, tesseract.js) so the app costs nothing to run.
- Database schema = consolidated final state of the original Report-Advisor repo's 319 migrations, applied via drizzle/migrations/0000 (fetched+verified bundle) plus later additive migrations; Drizzle journal is the source of truth going forward.
- src/lib/supabase.ts re-exports the generated untyped client from @/integrations/supabase/client; screens stay untyped, safety bound is RLS + current_company_id().
- Full-source extraction retains every dataset with sheet and row provenance; advisory totals are computed per dataset to avoid mixing unrelated tables.
- Secondary workbook analyses store independent dataset results and namespace finding/task IDs per sheet; this prevents first-sheet loss and cross-sheet decision collisions.
- Journey navigation carries report job, source hash and selected decision identity through shared link helpers; this prevents losing evidence when continuing to approvals or outcomes.
- Saved secondary analyses query only after the browser session hydrates, with user-scoped cache keys; SSR cannot read browser sessions and must not turn refreshes into false 404s.
- Import approval re-reads stored bytes and records the raw SHA-256 proof before commit; durable execution uses the verified user's client so tenant permissions remain enforced.
