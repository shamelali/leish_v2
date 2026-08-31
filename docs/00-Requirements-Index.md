# Leish! v2 — Requirements & Specification Index

> **Start here.** This index maps the full requirements corpus and tells any role where to go.

| Doc | File | Audience | Purpose |
|-----|------|----------|---------|
| **BRS** | [`01-BRS-Business-Requirements-Specification.md`](./01-BRS-Business-Requirements-Specification.md) | Founders, PM, Ops, Investors | *Why* we build — objectives, scope, business model (hybrid deposit/balance + payouts), rules BRL-01..15, processes, KPIs, roadmap |
| **SRS** | [`02-SRS-Software-Requirements-Specification.md`](./02-SRS-Software-Requirements-Specification.md) | Architects, Eng Lead, QA Lead | *What* the system shall do — IEEE 830 system features SRS-F-01..13, external interfaces, data & verification strategy |
| **FRS** | [`03-FRS-Functional-Requirements-Specification.md`](./03-FRS-Functional-Requirements-Specification.md) | Engineers, QA, UAT | *How* each function works — 48 `FR-xxx` with pre/post, flows, source files (`src/server/*:line`), and Given/When/Then acceptance |
| **NFR** | [`04-NFR-Non-Functional-Requirements.md`](./04-NFR-Non-Functional-Requirements.md) | Eng, SRE, Security, Compliance | *How well* — measurable latency, availability 99.5%, headers/CSP/HMAC, coverage ≥80%, WCAG AA etc. |
| **Use Cases** | [`05-Use-Cases-and-User-Stories.md`](./05-Use-Cases-and-User-Stories.md) | PM, Design, QA | 20 use cases UC-01..20 + 24 INVEST stories — step-by-step actor flows for every journey |
| **Data Model** | [`06-Data-Model-and-ERD.md`](./06-Data-Model-and-ERD.md) | DBAs, Eng | ERD + 13 table dictionaries + money logic + seeding/migration + retention |
| **API Spec** | [`07-API-Specification.md`](./07-API-Specification.md) | Frontend, Mobile, Integrators | 40+ endpoints with request/response examples, status codes, pagination, SSE, webhook HMAC contract |
| **RTM** | [`08-Traceability-Matrix.md`](./08-Traceability-Matrix.md) | QA, Auditors, Release Mgr | Bidirectional BR→SRS→FRS→API→DB→test + BRL→test + orphan check |
| **Glossary** | [`09-Glossary.md`](./09-Glossary.md) | Everyone | Canonical term definitions (Deposit/Balance/Payout/Claim/etc.) |
| *Index* | `00-Requirements-Index.md` | Everyone | This file |

**Companion docs (existing)**:

- `AGENTS.md` — repo conventions and "active memory" for agents (DB facade, auth, catalog 404 gotchas, security).
- `ARCHITECTURE.md` — single-backend data flow narrative (booking→fee→webhook→confirm).
- `PDPA_RETENTION_GUIDELINES.md` — retention policy per entity.
- `CODEBASE-AUDIT-FINAL.md` — closure of prior audit findings.
- `DEPLOY.md` / `HANDOVER.md` / `ROADMAP-TO-DEPLOYMENT.md` — operational runbooks.

---

### Reading Paths

| Role | Read in order |
|------|---------------|
| **Founder / Investor** | BRS (01) → NFR §9 Success metrics → Use Cases intro → API index (scan) |
| **Product Manager** | BRS (01) → Use Cases (05) → FRS (03) §12–14 dashboard/compliance → RTM (08) for coverage |
| **Engineering (backend)** | SRS (02) §2.1 → FRS (03) §4–11 → Data Model (06) → API Spec (07) → NFR (04) §4 Security |
| **Engineering (frontend)** | SRS (02) §4.1 UI + §4.3 supabase header → API Spec (07) §3–7 → Use Cases (05) for flows |
| **QA / Release** | FRS (03) acceptance criteria → RTM (08) §1 → NFR (04) §11 gate matrix → `npm run` checks |
| **Design** | BRS (01) §8 journeys → Use Cases (05) flows → SRS (02) §4.1 design system notes |
| **Security / Compliance** | NFR (04) §4 Security → FRS §4,8,14 → Data Model (06) retention → `09-Glossary` PDPA term |
| **Ops / SRE** | NFR (04) §2–3, §9 Ops → SRS (02) §4.3 software interfaces → API §14 health/cron → `AGENTS.md` deploy checklist |

---

### Versioning & Change Control

- Documents follow `LEISH-<TYPE>-v2.0` with date. Next increment is `2.1` for studio-native bookings / balance dunning; `3.0` for e-commerce.
- Change requests: open issue with `type: requirement-change`, update BRS first, then SRS/FRS/RTM in same PR; CI must still pass (`typecheck` proves no code drift).
- Trace orphan scan: before merge, confirm `08-Traceability-Matrix.md §4` lists no untraced prod surface.

---

### Quick Link: The Booking Money Trail (The Hardest Part)

```
Customer → POST /api/bookings (price from catalog)
         → Artist POST /api/bookings/[id]/quotation (total via quotationTotal)
         → Customer POST /api/bookings/[id]/pay-fee (deposit = getBookingFeeSen)
         → Billplz POST /api/payments/webhook (HMAC verify) → handlePaymentPaid (deposit → confirmed)
         → Balance due T-3d → POST /api/bookings/[id]/pay-balance (balance = total - deposit)
         → Webhook (balance → quotation=paid + createPayoutForBooking [gross/commission/net])
         → Admin PATCH /api/admin/payouts {settled, notes}
```
See **BRS §5.1**, **FRS §8–9**, **Data Model §5**, **API Spec §5+7** for each hop's full detail.

---

### Next Step

Open `01-BRS-Business-Requirements-Specification.md` to start at business rationale, or jump to `07-API-Specification.md` if you're integrating against a running deployment.
