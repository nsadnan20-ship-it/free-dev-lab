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
