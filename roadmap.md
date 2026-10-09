# Report-Advisor migration roadmap
- [x] Import screens, engines, styles from GitHub main eb28b2f into this project
- [x] Navigation adapter so existing screens run unchanged
- [x] P0 fixes: report-smart-insights declaration order, ExternalFileAnalysisPage `specialty` order
- [ ] Enable Lovable Cloud and replay the 319 database migrations (login, saving reports, decisions, work items) — waits on user go-ahead
- [ ] Port contract tests (*.test.ts) and re-run them
- [ ] Verify full journey on a real file: upload → smart report → recommendation → decision → work → outcome
- [x] Full status study + report (done / missing / to build) against the vision spec
- [ ] Vision spec: auth + per-company isolation, saved smart reports reopenable after refresh, export, audit log, learning from outcomes — after Cloud
