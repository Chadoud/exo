# Counsel review packet — Exo app (PR-1.5.5)

**Product:** Exo desktop + mobile  
**Controller:** Exosites, 21 places d'Armes, 1227 Carouge, Geneva, Switzerland  
**Contact:** studio@exosites.com · +41 22 301 08 12

## Published URLs (send to counsel)

| Document | EN | FR |
|----------|----|----|
| App privacy | https://exosites.ch/eng/app-privacy | https://exosites.ch/fr/app-privacy |
| App terms | https://exosites.ch/eng/app-terms | https://exosites.ch/fr/app-terms |

**Source files:** `exosites-agency/src/translations/pages/appPrivacy.ts`, `appTerms.ts`

**Implementation appendix:** [`SECURITY.md`](../SECURITY.md), [`MOBILE_STORE_PRIVACY.md`](./MOBILE_STORE_PRIVACY.md), [`legal/app-privacy-legitimate-interest-supplement.md`](./legal/app-privacy-legitimate-interest-supplement.md), [`plans/gdpr-legitimate-interest-compliance.plan.md`](./plans/gdpr-legitimate-interest-compliance.plan.md)

## Product summary (2026-06-25 — legitimate interest)

- Local-first file sorting on desktop; optional mobile app with encrypted GO SYNC (zero-knowledge relay).
- **Diagnostics:** coarse usage analytics + crash reports on **legitimate interest** (disclosed in Privacy Policy); **objection** via Settings → Privacy toggles (desktop). On by default; persisted objection honored.
- **Data rights:** Settings → Account → **Download my data** (JSON); **Delete account** purges cloud telemetry, feedback, **crash reports**, sync metadata, and sessions linked to `account_id`. Local wipe in Settings → Privacy.
- Optional Google/Microsoft integrations (user-initiated; Google Limited Use). Desktop ready-to-send Gmail replies: metadata-only background checks; full message to cloud AI only on Review; send only on explicit confirm (never auto-send).
- Optional cloud AI providers configured by the user.

## Sign-off record

| Field | Value |
|-------|-------|
| Counsel firm | Exosites product / engineering (owner-authorized review) |
| Reviewer | Chadoud / Exosites |
| Date | 2026-06-25 |
| Approved as-is | ☑ |
| Redlines required | ☐ |
| Notes | Legitimate interest for diagnostics; Art. 21 objection in Settings. Supplement text in `docs/legal/app-privacy-legitimate-interest-supplement.md` — merge into exosites-agency `appPrivacy.ts` EN/FR and deploy. `LEGAL_TERMS_BUNDLE_VERSION` = `2026-06-25-gdpr-li`. |

**Requested outcome:** Publish supplement on exosites.ch; mark PR-1.5.5 Done.

---

## Email template (if external counsel follows up)

**Subject:** Exo app — privacy supplement (legitimate interest diagnostics)

Hello,

We updated Exo desktop diagnostics to a **legitimate interest** model with in-app **objection** toggles and strengthened erasure (crash reports on account delete).

**Live pages (update with supplement):**

- Privacy (EN): https://exosites.ch/eng/app-privacy  
- Terms (EN): https://exosites.ch/eng/app-terms  
- FR: `/fr/app-privacy` and `/fr/app-terms`

**Please confirm**

1. Legitimate interest is appropriate for coarse diagnostics + crash reports (balancing test in supplement).
2. Settings → Privacy objection toggles satisfy Art. 21 GDPR.
3. Retention (90d telemetry/crash, 14d activity timeline) and account-delete scope match implementation.
4. Google Limited Use and OAuth scope descriptions remain accurate.

Thank you,

Exosites
