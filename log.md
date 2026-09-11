# Forge v3 - Development Changelog & Version Log

Comprehensive chronological record of updates, features, architecture decisions, and milestones across Forge v3.

---

## Current Version: v0.3.8

### Status Summary
- **Frontend**: Live on React 19 + TypeScript + Vite (`http://localhost:3000`), featuring Three.js WebGL 3D agent simulation, React Flow visual team configurator, Recharts analytics dashboard, and standalone portals for employers (`/verify/:token`) and training providers (`/provider/:token`).
- **Backend API**: Express.js 5.x on port `8787` (`http://localhost:8787`) with 15 specialized route modules, 12 core services, Prisma ORM v5 with PostgreSQL datasource, Google Gemini API, Sarvam AI, Serper.dev, and PDFKit document compilation.
- **Data & Auth Layer**: Prisma ORM v5 + PostgreSQL schema supporting Trainees, Enrolments, multi-scope DPDP Consent records, Outcome Check-ins, Employer Verifications, Admin RBAC & Audit Trails, Deduplication review, e-Shram/UDYAM Cross-Checks, Course Relevance Scorecards, Provider Access Tokens, and Synthetic Control Group records.
- **Analytics & Impact Engine**: 3-Signal Course Relevance Scoring, Government Analytics Dashboard with paired placement/response rates and labor migration tracking, and Stratified Propensity Matching engine for impact uplift estimation.

---

## Version History & Milestones

### [v0.3.8] - 2026-09-11
### Added
- **LinkedIn Integration (Trainee UI)**: Added `src/interface/LinkedInIntegrationView.tsx` enabling trainee-facing LinkedIn OIDC identity verification and inline `pdf-parse` extraction of PDF profiles, replacing the legacy GitHub integration view.
- **Backend OIDC Handlers**: Implemented `server/routes/linkedinAuth.js` to process LinkedIn OAuth flows and handle direct PDF uploads for work history extraction.
- **Impact Estimation Engine (`computeImpact`)**: Implemented simplified stratified matching `(ageBand, district, priorQualification)` to compare trainee placement rates against a synthetic control group, calculating a weighted average uplift.
- **Control Group Database**: Added `ControlGroupRecord` schema for synthetic comparison population data.
- **Data Seeding**: Created `server/scripts/seedControlGroup.js` with deterministic PRNG (`mulberry32`) to generate an illustrative non-trainee population. Includes `npm run db:seed-control` command and `POST /api/admin/seed-control-group` endpoint.
- **Trainee Qualification Field**: Added optional `priorQualification` field to `Trainee` model and onboarding UI to act as the third stratification signal.
- **Impact UI**: Added distinct amber-styled "Impact Estimate (Illustrative)" section to the admin `AnalyticsDashboard` with permanently visible methodology disclaimers, aggregate metrics, and a collapsible per-stratum breakdown table.

## [v0.3.7] - 2026-09-11 — Government Analytics Dashboard & Standalone Provider Portal

Built the complete frontend analytics dashboard and standalone public provider portal consuming the aggregation endpoints from v0.3.6, with Recharts data visualizations, paired placement and response rates, migration stream tracking, and token-gated provider views.

#### 1. Dependencies & State Management
- Added **`recharts`** (^2.15) for responsive SVG charting (BarChart, ResponsiveContainer, Tooltip, Legend, Bar, XAxis, YAxis), verified fully compatible with React 19.
- Extended `src/types.ts` and `src/integration/store/uiStore.ts` with `isAnalyticsDashboardOpen` and `setAnalyticsDashboardOpen`.

#### 2. Admin Analytics Dashboard (`src/interface/admin/AnalyticsDashboard.tsx`)
- **Access Control**: Gated via `useIsAdmin()`; renders an informative Access Denied notice if the caller lacks an administrative role (`ANALYST`, `REVIEWER`, `SUPER_ADMIN`).
- **Interactive Query Filters**: Reactive scheme dropdown (`All Schemes`, `PMKVY 4.0`, `DDU-GKY`, `ITI`) and date range pickers (`from`/`to`) wired to all five dashboard API calls.
- **Top Overview Cards**:
  - Scale card: Total unique trainees and total course enrolments.
  - Paired Placement & Response Integrity card: Prominently displays placement percentage **directly alongside** response rate in the same visual element (e.g. `87.5% Placement Rate (based on 62.5% response rate)`).
  - Status breakdown pills: Live counts for `EMPLOYED`, `SELF_EMPLOYED`, `SEARCHING`, `IN_TRAINING`, `OTHER`.
- **District Attribution & Labor Migration**:
  - Interactive tab toggle switching between **Home District** (`Trainee.district`) and **Placement District** (`OutcomeCheckIn.placementDistrict`).
  - Recharts bar chart showing placement rate and response rate per district.
  - Inbound migration origin breakdown (`topHomeDistricts`) showing talent flow from rural districts to industrial centers.
- **Training Cohort Performance**:
  - Recharts bar chart showing cohort-level placement rates paired with response rates.
- **Provider Performance & Relevance Table**:
  - Columns: Provider Name, Enrolled Candidates, Placement Rate (with response rate), and Relevance Score.
  - Sortable by any column; default sorted **worst-relevance-score first** (ascending, nulls last) for targeted curriculum intervention.
  - Expandable drill-down: Shows `topMissingSkills` chips and visually separated cards for employer denial reasons vs. trainee search reasons (never merged).
- **Longitudinal Wage Progression**:
  - Headline advancement percentage with full raw counts (`movedUp`, `stayedSame`, `movedDown`, `insufficientData`) and discrete transition tags (e.g. `10-20k -> 20k+`).
- **Provider Access Link Generator**:
  - Integrated form input calling `POST /api/admin/generate-provider-token`.
  - Displays generated public portal URL (`/provider/<token>`) with one-click copy button, live external link, and expiry date.

#### 3. Standalone Public Provider Portal (`src/interface/provider/ProviderViewPage.tsx`)
- Lightweight, standalone portal mounted at `/provider/:token` in `src/App.tsx`.
- Bypasses 3D WebGL office simulation, left navigation sidebar, and trainee GitHub login.
- Fetches `GET /api/provider-view/:token` on load.
- Validates token status: renders loading spinner, expired notice (403), or invalid notice (404).
- Strictly isolates aggregate placement metrics and course scorecards to that specific provider.
- Full privacy compliance: Candidate personal data (names, Aadhaar hashes, mobile numbers) and competing providers' data are strictly inaccessible.

#### 4. Navigation & App Integration
- **`src/interface/Header.tsx`**: Added blue `Analytics` button (BarChart3 icon) next to Admin Dedup when `isAdmin` is true.
- **`src/interface/Sidebar.tsx`**: Added dedicated `Admin Console` section in the permanent left sidebar for authorized admins.
- **`src/App.tsx`**: Added URL pathname prefix branching for `/provider/:token` and rendered `AnalyticsDashboard` modal overlay.

#### 5. Verification
- `npx tsc --noEmit` passed with 0 errors.
- Visual verification confirmed via browser subagent with screenshot `provider_portal_1789116869003.png`.

---

### [v0.3.6] - 2026-09-11 — Government & Provider Analytics Dashboard Aggregations

Implemented comprehensive analytics aggregation endpoints for the government and training provider dashboard, folding in critical gap fixes for response-rate pairing, home vs. placement district migration tracking, and token-gated provider-isolated scorecards.

#### 1. Schema & Data Model Extensions
- **`OutcomeCheckIn.placementDistrict`** (`prisma/schema.prisma`): Added nullable string field representing the district where the trainee is actually employed/placed, distinct from `Trainee.district`. Applied via `npx prisma db push`.
- **`ProviderAccessToken`** (`prisma/schema.prisma`): New model (`id`, `providerName`, `token` unique, `createdAt`, `expiresAt`) for secure token-based provider access.
- **Frontend & Types Integration**:
  - Added `placementDistrict?: string | null` to `OutcomeCheckInRecord` in `src/types.ts`.
  - Updated `POST /api/trainee/status-update` in `server/routes/outcomes.js` to persist `placementDistrict`.
  - Updated `src/interface/OutcomeStatusView.tsx` with a responsive `Placement / Work District` input field for `EMPLOYED` and `SELF_EMPLOYED` statuses, and added placement district badges to milestone cards in the outcome history timeline.

#### 2. Core Aggregation Endpoints (`server/routes/analytics.js`)
All administrative aggregation endpoints are secured via `requireAdmin('ANALYST')` and support standardized query filtering (`?scheme=...` and `?from=...&to=...` / `?startDate=...&endDate=...`):
- **`GET /api/analytics/overview`**: Computes total enrolments, unique trainees, response rate, placement rate, and full employment status breakdown (`EMPLOYED`, `SELF_EMPLOYED`, `SEARCHING`, `IN_TRAINING`, `OTHER`).
  - **Mandatory Response Rate Pairing**: Placement rate is NEVER returned alone. Because non-responding trainees are not a random sample, presenting placement rate without response rate overstates confidence.
  - $\text{responseRate} = \text{non-pending check-ins} / \text{trainees due check-in}$ ($\text{enrolmentDate} \le \text{now} - 90\text{d}$).
  - $\text{placementRate} = (\text{employed} + \text{self-employed}) / \text{reported trainees}$ (using the most recent check-in per trainee to prevent double-counting).
- **`GET /api/analytics/by-district`**: Crucially decouples candidate origin from workplace destination, returning two distinct breakdowns:
  - `homeDistrictBreakdown`: Grouped by `Trainee.district` with paired response and placement rates.
  - `placementDistrictBreakdown`: Grouped by `OutcomeCheckIn.placementDistrict`, enriched with `topHomeDistricts` tracking origin migration streams into that district.
- **`GET /api/analytics/by-cohort`**: Performance breakdown by `cohortName` with schemes, providers, and paired placement and response rates.
- **`GET /api/analytics/by-provider`**: Provider-level aggregation joined with `CourseRelevanceScore` averages and course scorecards.
- **`GET /api/analytics/wage-progression`**: Evaluates trainees with $\ge 2$ check-ins with reported wage bands across standardized ordinals (`0-10k` $\to$ `10-20k` $\to$ `20k+`), reporting `percentageMovedUp`, `percentageStayedSame`, `percentageMovedDown`, and discrete band transition counts.

#### 3. Token-Gated Provider View & Audit Logging
- **`POST /api/admin/generate-provider-token`**:
  - Generates cryptographically secure token (`pvt_<hex>`) with configurable expiration (default 30 days).
  - Writes audit record to `AdminActionLog` with action `GENERATE_PROVIDER_TOKEN`.
  - Returns `token`, `expiresAt`, `shareableLink`, and `fullUrl`.
- **`GET /api/provider-view/:token`**:
  - Public, unauthenticated endpoint requiring no session cookie.
  - Validates token existence and expiry (returns 404 for invalid, 403 for expired).
  - Strictly isolates aggregate metrics and course scorecards to that specific provider.
  - Zero PII exposure: candidate names, Aadhaar hashes, mobile hashes, and other providers' data are never leaked.
- **Root URL Redirect** in `server/index.js`: Mounted root route `/provider-view/:token` redirecting to `/api/provider-view/:token`.

#### 4. Verification
- 45 automated assertions in `scratch/test_analytics_endpoints.mjs` passed with 0 failures:
  - Verified overview response rate and placement rate pairing.
  - Verified distinct home (`Satara`) vs placement (`Pune`) migration attribution with `topHomeDistricts`.
  - Verified cohort and provider groupings joined with course relevance scores.
  - Verified wage progression calculation on candidates with $\ge 2$ check-ins.
  - Verified query filtering on schemes.
  - Verified provider token generation and `AdminActionLog` recording.
  - Verified public provider view token authentication, data isolation, and absence of PII leaks.
  - Verified rejection of invalid and expired tokens.
- Zero TypeScript compilation errors (`npx tsc --noEmit`).

---

### [v0.3.5] - 2026-09-11 — Course & Provider Relevance Scoring (Three-Signal Model)

Introduced labor-market relevance scoring for vocational courses and training providers by synthesizing three independent signals: employer verification denials, trainee non-placement reasons, and aggregated Resume Forge skill gaps.

#### 1. Individual Skill-Gap Persistence (Signal 3)
- **`SkillGapSnapshot` model** (`prisma/schema.prisma`): `id` (cuid), `traineeId` (FK, required), `jdTitle` (string), `missingSkills` (JSON string array), `atsScore` (float, nullable), `createdAt`.
- **Extended `POST /api/resume/tailor`** (`server/routes/resume.js`):
  - Optionally accepts `traineeId` in the request body.
  - If a valid `traineeId` is provided, creates a `SkillGapSnapshot` record capturing `jdTitle`, unique missing skills (from `skillProfile` required/nice gaps or `analysis.skillGaps`), and `atsScore`.
  - If `traineeId` is omitted or null (anonymous usage), DB persistence is completely skipped and the endpoint functions identically to before (100% backward-compatible).
  - Persistence errors are caught safely and non-blocking.
- **Frontend Integration** (`src/interface/PhaseOneControlPanel.tsx`):
  - Destructured `traineeProfile` from `useCoreStore()`.
  - Passes `traineeId: traineeProfile?.trainee?.id || undefined` in the tailoring request body if a verified profile exists. Anonymous users continue unhindered.

#### 2. Course Relevance Scorecard Model & Engine
- **`CourseRelevanceScore` model** (`prisma/schema.prisma`): `id` (cuid), `courseName`, `providerName`, `totalClaims` (int), `confirmedCount` (int), `deniedCount` (int), `employerReasonBreakdown` (JSON string), `traineeReasonBreakdown` (JSON string), `topMissingSkills` (JSON string), `relevanceScore` (float, nullable), `computedAt`. Unique constraint on `(courseName, providerName)`.
- **`server/services/relevanceScoringService.js`** — `computeRelevanceScores()`:
  - **Attribution Convention**: Attributes each `EmployerVerification`, `OutcomeCheckIn` (SEARCHING with non-placement reason), and `SkillGapSnapshot` to a `(courseName, providerName)` via the trainee's most recent `Enrolment` as of the record's timestamp (or most recent by `enrolmentDate` if ambiguous, matching `server/routes/employer.js`).
  - **Separation of Confidence Levels**: Employer-reported reasons (`EmployerVerification.reasonCode`) and trainee-reported reasons (`OutcomeCheckIn.nonPlacementReason`) are tracked in strictly distinct dictionaries (`employerReasonBreakdown` vs `traineeReasonBreakdown`). They are never conflated into a single count because verified employer determinations and candidate self-perceptions represent fundamentally different confidence levels.
  - **Top Missing Skills**: Computes frequency of all missing-skill strings across attributed snapshots, persisting the top 10 most frequent.
  - **Relevance Scoring**:
    - `totalClaims = confirmedCount + deniedCount`
    - When `totalClaims > 0`: `baseScore = confirmedCount / totalClaims`.
    - Penalty: `-0.1` penalty (floor `0.0`) applied if `SKILL_GAP` is uniquely the most common reason across combined employer + trainee reasons.
    - When `totalClaims === 0`: `relevanceScore = null` (representing insufficient data, not zero).
  - **Idempotent Upsert**: Upserts one `CourseRelevanceScore` row per `(courseName, providerName)` pair.

#### 3. Analytics API Endpoints (`server/routes/analytics.js`)
Mounted under `/api` in `server/index.js`, all protected with `requireAdmin('ANALYST')`:
- **`POST /api/admin/compute-relevance-scores`**: Executes `computeRelevanceScores()`, writes an audit log to `AdminActionLog` with action `COMPUTE_RELEVANCE_SCORES`, and returns computation summary.
- **`GET /api/analytics/course-relevance`**: Returns all scorecards sorted by `relevanceScore` ascending (worst-first / most actionable for curriculum intervention), with unscored null-claims courses grouped at the end.
- **`GET /api/analytics/course-relevance/:courseName/:providerName`**: Returns the single scorecard drill-down with parsed `employerReasonBreakdown`, `traineeReasonBreakdown`, and `topMissingSkills`.

#### 4. Verification
- All 17 automated integration assertions passed in `scratch/test_relevance_scoring.mjs` verifying:
  - Enrolment attribution logic (prior vs most recent fallback)
  - `SkillGapSnapshot` persistence
  - Distinct employer vs trainee breakdown storage
  - `topMissingSkills` frequency aggregation
  - Dominant `SKILL_GAP` `-0.1` score penalty calculation
  - Anonymous vs trainee-linked tailoring backward compatibility
  - Live HTTP endpoints on port 8787 including RBAC authorization and `AdminActionLog` recording.

---

### [v0.3.4] - 2026-09-11 — Audit Closure: RBAC, Dedup Matching & Merge, OTP Gating

This entry documents work that was genuinely built and verified complete across prior sessions but never recorded in this changelog. Confirmed as complete via direct filesystem audit, source code tracing, and a live integration test run on 2026-09-11.

#### RBAC & Admin Access System (confirmed complete)

- **`AdminUser` model** (`prisma/schema.prisma`): `id`, `githubUsername` (unique), `role` (`SUPER_ADMIN | REVIEWER | ANALYST`), `createdAt`.
- **`AdminActionLog` model** (`prisma/schema.prisma`): `id`, `adminUserId` (FK), `action`, `targetType`, `targetId`, `details` (JSON string), `createdAt`.
- **`server/utils/adminAuth.js`**: Exports `requireAdmin(minRole)` Express middleware (resolves GitHub identity via `resolveGithubIdentity`, looks up `AdminUser`, validates role using `SUPER_ADMIN > REVIEWER > ANALYST` ordering, attaches `req.adminUser`, rejects with 403 on failure) and `logAdminAction(adminUserId, action, targetType, targetId, details)` which inserts one `AdminActionLog` row (non-fatal on error).
- **`server/lib/seedAdminUser.js`**: Runs at server startup via `server/index.js`. Creates one `SUPER_ADMIN` from `ADMIN_GITHUB_USERNAME` env var if `AdminUser` table has zero rows; logs a warning if env var is missing; non-fatal (server continues).
- **`GET /api/admin/whoami`**: Resolves caller's GitHub identity, returns their `AdminUser` record or 404 — used by the frontend `useIsAdmin()` hook.

#### Unified Trainee ID Matching & Merge (confirmed complete)

- **Extended `Trainee` model**: `dateOfBirth` (nullable DateTime), `district` (nullable String), `aadhaarLast4Hash` (nullable String — SHA-256 hash of last 4 Aadhaar digits only, weak passive matching signal), `mergedIntoId` (nullable String — self-referencing soft-delete marker).
- **`DedupCandidate` model**: `id`, `traineeIdA` (FK, always lexicographically smaller), `traineeIdB` (FK), `matchScore` (Float), `matchReasons` (JSON string), `status` (`PENDING | CONFIRMED_MERGE | REJECTED`), `reviewedByAdminId` (nullable FK), `reviewedAt` (nullable DateTime), `createdAt`. Unique constraint on `(traineeIdA, traineeIdB)`.
- **`server/services/matchingService.js`** — `findPotentialDuplicates()`: Jaro-Winkler similarity on full name (weight 0.35), exact match on last-6 digits of phone (0.20), exact match on dateOfBirth (0.25), exact match on district (0.10), exact match on aadhaarLast4Hash (0.10). Missing-signal weight redistributed proportionally among available signals. Candidates created only when score > 0.60. Safe to call repeatedly.
- **`server/services/mergeService.js`** — `mergeTrainees(traineeIdA, traineeIdB, adminUserId)`: Runs inside a single `prisma.$transaction`. Reassigns all `Enrolment`, `ConsentRecord`, and `OutcomeCheckIn` rows from traineeIdB → traineeIdA. Sets `traineeB.mergedIntoId = traineeIdA` (soft delete; never hard-deletes). Returns `{ reassignedEnrolments, reassignedConsentRecords, reassignedOutcomeCheckIns }`.
- **`POST /api/admin/run-dedup-scan`**: `requireAdmin('ANALYST')`. Calls `findPotentialDuplicates()`, logs to `AdminActionLog`.
- **`GET /api/admin/dedup-candidates`**: `requireAdmin('REVIEWER')`. Returns all `PENDING` candidates with both Trainees' full details side-by-side.
- **`POST /api/admin/dedup-candidates/:id/resolve`**: `requireAdmin('REVIEWER')`. REJECT: updates status, logs action. MERGE: validates OTP verification token against canonical trainee's phone, calls `mergeTrainees()` in transaction, updates candidate to `CONFIRMED_MERGE`, logs before/after state.

##### Live Integration Test — 2026-09-11

Test created two `Trainee` records with identical name (`TEST_Priya Kumari`), dateOfBirth (`1998-05-15`), and district (`Jaipur`) but different phone numbers (`+919900000001`, `+919900000002`). Trainee B had 2 enrolments, 1 consentRecord, 1 outcomeCheckIn; Trainee A had 1 enrolment.

- **Dedup scan** (`POST /api/admin/run-dedup-scan`): HTTP 200. Scanned 105 pairs, created 7 new candidates (including the test pair).
- **DedupCandidate created**: `matchScore = 0.7778`, `matchReasons = ["name_similarity:1.000", "dob_exact_match:1998-05-15", "district_exact_match:Jaipur"]`, `status = PENDING`.
- **Merge** (`POST /api/admin/dedup-candidates/:id/resolve`): HTTP 200. `mergeService.mergeTrainees()` returned `{ reassignedEnrolments: 2, reassignedConsentRecords: 1, reassignedOutcomeCheckIns: 1 }`.
- **Database verification after merge**:
  - Canonical Trainee (A): **3 enrolments** (1 own + 2 reassigned from B), **1 consentRecord** (reassigned from B), **1 outcomeCheckIn** (reassigned from B).
  - Merged Trainee (B): **0 enrolments**, **0 consentRecords**, **0 outcomeCheckIns** remaining. Row **still exists** in DB (soft delete confirmed). `mergedIntoId` correctly set to canonical Trainee A's id.
  - `DedupCandidate.status = CONFIRMED_MERGE`.
- **All 9 assertions passed** (`✅ ALL ASSERTIONS PASSED`).

#### OTP Gating (confirmed complete)

- **OTP routes** (`server/routes/otpAuth.js`): `POST /api/otp/send` and `POST /api/otp/verify`. Verified route paths.
- **`POST /api/trainee/profile`**: Handler verified to require `otpVerificationToken` in request body. Returns HTTP 400 if missing, HTTP 401 if invalid/expired or phone mismatch. Token validated via `validateOtpVerificationToken()` before any DB write.
- **`POST /api/admin/dedup-candidates/:id/resolve` (MERGE)**: Requires `otpVerificationToken` in body. Returns HTTP 400 if missing, HTTP 401 if token invalid or phone does not match canonical trainee's phone. Verified in live test above.
- **`TraineeProfileSetup.tsx`**: Two-step flow — Step 1 (form fill) calls `POST /api/otp/send`, Step 2 (OTP entry) calls `POST /api/otp/verify`, passes returned `verificationToken` in profile creation payload. Submit button is disabled until OTP step is reached and 6-digit code entered.
- **`DedupReviewPanel.tsx`**: Merge button triggers OTP send to Trainee A's phone via `POST /api/otp/send`, modal requires 6-digit code entry, calls `POST /api/otp/verify`, passes returned token to the resolve endpoint. No merge possible without a valid, unexpired token.
- **Frontend/backend path consistency**: Both frontend components call `/api/otp/send` and `/api/otp/verify` — exact match to the actual route paths registered in `server/routes/otpAuth.js`.

#### Frontend Admin Panel (confirmed complete)

- **`src/interface/admin/DedupReviewPanel.tsx`**: Gated by `useIsAdmin()` hook — renders Access Denied if not admin. Shows scan-trigger button, side-by-side comparison table of PENDING candidates with matchScore/matchReasons, Reject and Merge buttons. Merge triggers OTP flow (see above). Refreshes candidate list after each action.
- **`src/interface/admin/useIsAdmin.ts`**: Exported reusable hook. Calls `GET /api/admin/whoami` on mount, returns `{ isAdmin, role, loading }`.
- **`src/interface/Header.tsx`**: Admin Dedup button (`setDedupReviewOpen(true)`) rendered conditionally via `isAdmin` from `useIsAdmin()` — only visible to confirmed admin users.

### [v0.3.3] - Database Infrastructure Migration to PostgreSQL

#### Changed / Enhanced
- **Switched Datasource from SQLite to PostgreSQL**:
  - Updated [`prisma/schema.prisma`](file:///c:/HACKATHON/SIH/FORG/prisma/schema.prisma) datasource provider from `sqlite` to `postgresql`.
  - Reset SQLite migration history by purging `prisma/migrations/` in preparation for fresh initial PostgreSQL migrations.
  - Updated [`.env.example`](file:///c:/HACKATHON/SIH/FORG/.env.example) with PostgreSQL connection string format and instructions for Neon and Supabase free-tier databases.
  - Updated [`README.md`](file:///c:/HACKATHON/SIH/FORG/README.md) quickstart workflow and environment variables table to mark `DATABASE_URL` as required.
  - Updated [`context.md`](file:///c:/HACKATHON/SIH/FORG/context.md) to document PostgreSQL as the active datasource.

### [v0.3.2] - Government Registry Cross-Checks (e-Shram & UDYAM)

#### Added / Enhanced
- **Government Registry Cross-Check Corroboration Architecture**:
  - Added `GovtCrossCheckResult` model in [`prisma/schema.prisma`](file:///c:/HACKATHON/SIH/FORG/prisma/schema.prisma) (`id`, `traineeId`, `source`, `matchFound`, `matchConfidence`, `matchedRecordSummary`, `checkedAt`) with relation to `Trainee`.
  - Created and executed Prisma migration `20260910211548_add_govt_cross_check_result`.
  - Created [`server/services/govtVerificationService.js`](file:///c:/HACKATHON/SIH/FORG/server/services/govtVerificationService.js) implementing a provider-agnostic interface (`checkEShram`, `checkUdyam`) with a deterministic phone-hash simulator via SHA-256 for repeatable judge demos (~35% e-Shram match, ~25% UDYAM match).
  - Created [`server/routes/govtCheck.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/govtCheck.js) and mounted at `/api` in [`server/index.js`](file:///c:/HACKATHON/SIH/FORG/server/index.js):
    - `POST /api/admin/trigger-govt-crosscheck`: Protected by `requireAdmin('ANALYST')`. Gated by `GOVT_CROSS_CHECK` consent via `resolveCurrentConsent`. Executes both checks, writes to database in an atomic Prisma transaction, and logs execution to `AdminActionLog`.
    - `GET /api/trainee/govt-crosscheck-history/:traineeId`: Returns chronological list of all corroboration results newest first.
  - Added `GovtCrossCheckRecord` interface in [`src/types.ts`](file:///c:/HACKATHON/SIH/FORG/src/types.ts).
  - Updated [`src/interface/OutcomeStatusView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/OutcomeStatusView.tsx) to render a subdued "Corroboration Signals (Beta)" card section below the milestone timeline with advisory notices. Visually separated from confirmed employer verifications with lower weight; strictly hidden if `GOVT_CROSS_CHECK` consent is not granted or if no checks exist.
  - Created automated integration test [`test-govt-crosscheck.js`](file:///c:/HACKATHON/SIH/FORG/test-govt-crosscheck.js) verifying 6 key assertions (admin RBAC, DPDP consent gating, atomic DB write, determinism, audit logging, and chronological history retrieval).

### [v0.2.1-dev] - Active Iteration

#### Added / Enhanced
- **Employer Verification & Domain Legitimacy Signal**:
  - Added `EmployerVerification` model in `prisma/schema.prisma` and executed database migration.
  - Created [`server/routes/employer.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/employer.js) and mounted at `/api` in `server/index.js`:
    - `POST /api/trainee/request-employer-verification`: Trainee-initiated verification request gated by `EMPLOYER_SHARING` consent. Scans employer email against consumer domain blocklist (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, etc.) to set `contactDomainFlag: true` without hard-blocking.
    - `GET /api/verify/:token`: Public privacy-preserving endpoint returning trainee first name only, claimed employer name, scheme/course context, and expiration status.
    - `POST /api/verify/:token`: Public employer confirmation or denial with required reason code (`SKILL_GAP`, `WAGE_MISMATCH`, `LOCATION`, `NO_SHOW`, `ROLE_MISMATCH`, `OTHER`) and notes.
  - Extended [`server/services/notificationService.js`](file:///c:/HACKATHON/SIH/FORG/server/services/notificationService.js) with `sendEmployerVerificationRequest(employerContact, verificationLink, details)`.
  - Built standalone public portal [`EmployerVerificationPage.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/employer/EmployerVerificationPage.tsx), branched directly in [`src/App.tsx`](file:///c:/HACKATHON/SIH/FORG/src/App.tsx) on `window.location.pathname.startsWith('/verify/')` to completely bypass the 3D scene, sidebar, and trainee login.
- **Outcome Data Enrichment**:
  - Extended `OutcomeCheckIn` model with `roleRelevance`, `selfEmploymentType`, `apprenticeshipEmployer`, and `nonPlacementReason`.
  - Updated [`server/routes/outcomes.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/outcomes.js):
    - `POST /api/trainee/status-update`: Accepts and validates training relevance, self-employment details, apprenticeship partner, and non-placement reason.
    - `GET /api/trainee/status-history/:traineeId`: Includes attached `employerVerification` relation for timeline rendering.
  - Updated [`src/interface/OutcomeStatusView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/OutcomeStatusView.tsx):
    - Added conditional form controls: `roleRelevance` (required for EMPLOYED / SELF_EMPLOYED), `selfEmploymentType` (for SELF_EMPLOYED), `apprenticeshipEmployer` (for EMPLOYED), and `nonPlacementReason` (for SEARCHING).
    - Added "Request Employer Verification" action button on EMPLOYED timeline cards, with consent gating check pointing to consent settings, and lower-confidence domain warning tags once resolved.
  - *Analytics Rationale*: `nonPlacementReason` gives future outcome and relevance-scoring analytics a second, broader-coverage data source beyond employer-reported reasons alone, ensuring trainees who never reached an EMPLOYED claim are still factored into gap analysis.
- **UI/UX Workspace Expansion & Navigation Modernization**:
  - Replaced redundant top header bar with full-height canvas layout, expanding simulation viewport by 56px.
  - Consolidated platform branding (`FORGE v0.2.1`) into the permanent left sidebar header.
  - Upgraded Phase 1 primary action button to high-contrast, bold **`RUN`** trigger with play indicator and hover scale physics.
  - Added Section 8: **GitHub Integration** ([`GitHubIntegrationView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/GitHubIntegrationView.tsx)), enabling candidate repo analysis, OAuth token state management, and quantified resume bullet point extraction directly from the sidebar.
  - Embedded quick utilities (Nexus Teams configurator, BYOK credentials manager, and Fullscreen toggle) directly into the sidebar footer.
  - Consolidated redundant header buttons (Job Hunter & Nexus-Mirror) into their primary sidebar destinations (Job Matches & Interview Prep / Skill Gaps).
- **Persistent Trainee Identity & Consent Layer**:
  - Implemented **real SMS OTP verification** using MSG91, requiring verified phone numbers before profile creation and before canonical merge operations in the admin panel.
  - Added **Prisma ORM v5 + SQLite** as the dev data layer (`prisma/schema.prisma`, `prisma/migrations/`).
  - Models: `Trainee`, `Enrolment`, `ConsentRecord`, `OtpVerification`.
  - New route [`server/routes/trainee.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/trainee.js): `POST /api/trainee/profile` (upsert Trainee + append Enrolment) and `GET /api/trainee/profile` (full profile with enrolments + consent).
  - New route [`server/routes/consent.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/consent.js): `POST /api/consent` (append consent event), `GET /api/consent` (caller consent), `GET /api/consent/:traineeId` (public current-state query for employer/govt portals).
  - New utils: [`server/utils/auth.js`](file:///c:/HACKATHON/SIH/FORG/server/utils/auth.js) (`resolveGithubIdentity`), [`server/utils/consent.js`](file:///c:/HACKATHON/SIH/FORG/server/utils/consent.js) (`resolveCurrentConsent`, `ALLOWED_SCOPES`).
  - Added `db:migrate` and `db:studio` npm scripts.
- **Outcome & Milestone Check-In Architecture**:
  - Added `OutcomeCheckIn` model to [`prisma/schema.prisma`](file:///c:/HACKATHON/SIH/FORG/prisma/schema.prisma) (`traineeId`, `checkinType`, `status`, `employmentStatus`, `employerName`, `wageBand`, `notes`, `scheduledFor`, `respondedAt`, `createdAt`).
  - Added swappable, provider-agnostic notification service [`server/services/notificationService.js`](file:///c:/HACKATHON/SIH/FORG/server/services/notificationService.js) exporting `sendCheckinMessage(trainee, checkin)` with structured console stub logging and bilingual message templates (`en`, `hi`).
  - New route module [`server/routes/outcomes.js`](file:///c:/HACKATHON/SIH/FORG/server/routes/outcomes.js) mounted at `/api` in [`server/index.js`](file:///c:/HACKATHON/SIH/FORG/server/index.js):
    - `POST /api/trainee/status-update`: Immediate self-reporting of employment status, employer name, wage band, and notes (`SELF_INITIATED`, `COMPLETED`).
    - `GET /api/trainee/status-history/:traineeId`: Chronological history of all check-ins (newest first) for trainee outcome timeline.
    - `POST /api/admin/trigger-checkins`: Milestone batch trigger simulating cron execution for 90/180/365-day check-in cycles, with optional `daysAgo` override and automatic deduplication against existing `PENDING` check-ins.
    - `POST /api/webhook/checkin-reply`: Inbound messaging reply webhook to transition `PENDING` check-ins to `COMPLETED` with timestamp and payload details.
- **Onboarding Flow & Outcome UI (Frontend)**:
  - Added two-step onboarding overlay integrated in root [`src/App.tsx`](file:///c:/HACKATHON/SIH/FORG/src/App.tsx):
    - [`ConsentScreen.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/onboarding/ConsentScreen.tsx): Step 1 DPDP compliance dialog with granular consent switches (`JOB_SEARCH_DATA`, `EMPLOYER_SHARING`, `ANALYTICS`, `GOVT_CROSS_CHECK`).
    - [`TraineeProfileSetup.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/onboarding/TraineeProfileSetup.tsx): Step 2 vocational record setup capturing candidate phone, scheme, course, provider, cohort, and enrolment date.
  - Added [`useTraineeProfile.ts`](file:///c:/HACKATHON/SIH/FORG/src/integration/hooks/useTraineeProfile.ts) hook managing onboarding state machine, authentication headers, profile refreshes, and multi-scope consent submissions.
  - Resolved wiring defect where auto-created consent-stub trainee records (`temp_*` phone, zero enrolments) prematurely bypassed `TraineeProfileSetup`.
  - Added View 7: `My Outcome` ([`OutcomeStatusView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/OutcomeStatusView.tsx)): Full post-placement self-reporting interface and reactive milestone timeline with live zero-reload updates.
  - Extended [`coreStore.ts`](file:///c:/HACKATHON/SIH/FORG/src/integration/store/coreStore.ts) with `traineeProfile`, `consentState`, and `outcomeHistory` state slices and reactive setters.
- **Structured Left Sidebar Navigation**:
  - `Dashboard`: 3D Three.js office simulation with Kanban pipeline and Phase 1 upload bar.
  - `Skill Gaps` ([`SkillGapsView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/SkillGapsView.tsx)): ATS score breakdown, matched vs missing skills, keyword frequency, and impact weighting.
  - `Job Matches` ([`JobMatchesView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/JobMatchesView.tsx)): Direct career board discovery via Nexus-Hunter scoring.
  - `Recommended Programs` ([`RecommendedProgramsView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/RecommendedProgramsView.tsx)): Target upskilling roadmaps tailored to missing candidate skills.
  - `Interview Prep` ([`InterviewPrepView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/InterviewPrepView.tsx)): Nexus-Mirror mock interview simulator with answer cross-questioning.
  - `New CV` ([`NewCVView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/NewCVView.tsx)): Single-pass tailored resume preview with client and server PDF export.
  - `My Outcome` ([`OutcomeStatusView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/OutcomeStatusView.tsx)): Longitudinal placement and verification status tracking.
  - `GitHub Integration` ([`GitHubIntegrationView.tsx`](file:///c:/HACKATHON/SIH/FORG/src/interface/GitHubIntegrationView.tsx)): Verified code activity ingestion and automated STAR resume bullet generation.
- **Persistent Scene Context**:
  - Implemented `SceneContext.Provider` around the application root to keep the WebGL canvas and Three.js manager mounted smoothly when switching between sidebar tabs.
- **Empty State & Resilience**:
  - Integrated `EmptySectionView` fallback across all tabs when data has not yet been processed by Phase 1.
- **Visual Team Configurator**:
  - Embedded modal overlay for React Flow multi-agent hierarchy editor.

---

### [v0.2.0] - Multi-Agent Architecture & React Flow Visual Configurator

#### Added
- **Team Editor (React Flow)**: Node-based visual canvas for designing custom multi-agent collaboration graphs and execution pipelines.
- **Predefined Agentic Teams**:
  - `Career Acceleration Squad` (Director, Vision, Strategist, Writer, Hunter, Mirror)
  - `Creative Agency`
  - `Nano Banana Lab` (Visual generation)
  - `Lyria Factory` (Audio & music generation)
  - `Veo Studio` (Video synthesis)
- **Multimodal Generation Capabilities**:
  - Image generation via Nano Banana
  - Audio generation via Lyria 3
  - Video synthesis via Veo 3.1 (720p / 16:9)
- **Human-in-the-Loop (HITL) Workflow**:
  - Simulated Pull Request & Review approval gates for agent tasks.
  - Auto-approve output guardrail toggle in header.
- **Cost & Token Tracking**:
  - Real-time token usage estimation and cost metrics displayed per agent interaction.
- **Per-Agent LLM Model Assignment**:
  - Ability to independently configure Gemini 3.8 Flash, Gemini 3 Pro, or Sarvam models per agent role.

#### Refactoring & Technical Fixes
- **Decoupled Agent Brain**: Separated `AgentBrain` reasoning logic from `AgentHost` 3D simulation wrappers for cleaner modularity.
- **Unified Zustand Store**: Centralized reactive state across `coreStore` (pipeline/career data), `teamStore` (nodes & team graphs), and `uiStore` (active navigation, modals, BYOK).
- **Design System Polish**: Standardized Tailwind CSS v4 styling tokens, border-radius consistency (4px/12px), and clean zinc aesthetic.

---

### [v0.1.0] - Core Foundation & 3D Simulation Engine

#### Added
- **3D World Environment**:
  - Fixed isometric 3D office scene (`office.glb`) rendered with Three.js.
  - Points of Interest (POI) embedded for agent desk assignments and movement destinations.
- **Character Controller & Animation State Machine**:
  - GPU-instanced 3D character meshes rigged in Blender.
  - Dynamic pathfinding across walkable floor polygons using `three-pathfinding` (NavMesh).
  - State machine animations: `idle`, `walking`, `typing`, `conversing`, `thinking`.
- **Dual Logging & Debugging**:
  - User-facing activity log for high-level agent actions.
  - Technical inspector panel showing raw LLM prompts, tool execution arguments, and model JSON responses.
  - Debug pause mode to step through LLM invocations one by one.
- **Kanban Application Pipeline**:
  - Resizable bottom task board tracking jobs through stages: `Job Discovery` → `Resume Tailoring` → `Verification` → `Ready to Submit`.
- **BYOK (Bring Your Own Key)**:
  - Client-side configuration modal allowing users to enter custom Gemini and Sarvam API credentials.

---

## Technical Decisions & Architecture Log

| Date | Topic | Decision & Rationale |
|---|---|---|
| **2026-03** | **Dual-Process Architecture** | Separated Vite (port 3000) for fast HMR & 3D rendering from Express (port 8787) for heavy PDF parsing and AI API handling to prevent frontend UI lag during document processing. |
| **2026-03** | **Navigation & Canvas Mounting** | Used CSS visibility toggling (`display: none / flex`) for the 3D canvas instead of unmounting `SceneManager` on tab change, preserving WebGL context and GPU resources. |
| **2026-03** | **Single-Pass Optimization** | Combined ATS scoring, gap analysis, and tailored bullet-point generation into a single structured AI prompt to minimize token costs and eliminate latency from cascading LLM calls. |
| **2026-03** | **Blue Ocean Search Filter** | Configured Serper job search queries with domain filters (`site:careers.*`, direct portal keywords) to bypass saturated aggregators like LinkedIn/Indeed. |
| **2026-03** | **Recursive Cross-Questioning** | Built Nexus-Mirror with an adaptive pressure engine that parses candidate answers for missing STAR-method metrics and triggers targeted follow-ups. |
