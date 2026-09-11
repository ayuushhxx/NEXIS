# Forge v3

> **Forge v3** is an immersive 3D career orchestration platform powered by an autonomous **Nexus Agent Network**. It combines real-time WebGL 3D simulation UX with practical job search execution tools: resume optimization, blue ocean job hunting, and interactive mock interview simulation.

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Nexus Agent Network](#nexus-agent-network)
- [Directory Structure](#directory-structure)
- [Quickstart & Local Development](#quickstart--local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Navigation & Views](#frontend-navigation--views)
- [License & Authors](#license--authors)

---

## Features

- 🎮 **3D Agent Simulation Workspace**: Real-time WebGL office simulation powered by Three.js with NavMesh pathfinding and character state machines.
- 📄 **Resume Forge**: Ingest candidate PDF resumes, extract structured text, and run single-pass AI tailoring against target Job Descriptions with printable A4 PDF export.
- 🎯 **Skill Gap Matrix**: In-depth ATS compatibility analysis, missing technical/soft skills identification, and keyword matching.
- 🧭 **Nexus-Hunter (Autonomous Job Discovery)**: Multi-mode job discovery supporting live Google searches via Serper, autonomous role-tailored opportunity synthesis via Google Gemini (`mode: "gemini-autonomous"`), and dynamic vocational fallbacks.
- 🪞 **Nexus-Mirror (Interview Simulator)**: Adaptive technical and behavioral interview practice with real-time pressure scoring and recursive cross-questioning.
- 📚 **Recommended Programs**: Context-aware upskilling growth tracks tailored to detected skill gaps.
- 🌐 **Visual Team Configurator**: Interactive React Flow node canvas to inspect, modify, and build custom multi-agent collaboration topologies.
- 📊 **Application Pipeline**: Resizable Kanban board tracking jobs across stages from discovery to submission.
- 🔐 **DPDP Consent & Trainee Profiles**: Multi-scope consent modal (`JOB_SEARCH_DATA`, `EMPLOYER_SHARING`, `ANALYTICS`, `GOVT_CROSS_CHECK`) with non-blocking dismissal controls, "Skip for now" demo mode, and inline recovery bypass.
- 📱 **Dual-Mode OTP Verification**: Instant developer console OTP logging for zero-friction local testing, with production dispatch via MSG91 SMS gateway.
- 💼 **LinkedIn Integration**: Verified candidate profile ingestion via LinkedIn OIDC and inline PDF resume parsing with automated STAR-method bullet generation.
- 🏛️ **Government Registry Cross-Checks**: Swappable corroboration system cross-referencing candidates against simulated e-Shram & UDYAM registries with confidence scoring and audit logs.
- 🏢 **Employer Verification Portal**: Tokenized direct employer verification (`/verify/:token`) allowing corporate HR to confirm or deny placement claims with structured denial reason codes.
- 🔄 **Candidate Deduplication Engine**: Multi-signal similarity matching (Jaro-Winkler name, exact DOB, district, Aadhaar hash, phone) with administrative review panel and atomic Prisma transaction merge capability.
- 📈 **Government Analytics Dashboard**: Full-screen Recharts governance interface displaying mandatory paired placement and response rates, home vs. placement labor migration streams, cohort performance, and 3-signal course relevance scorecards.
- 🔗 **Standalone Token-Gated Provider Portal**: Lightweight public portal (`/provider/:token`) allowing training providers to view isolated aggregate outcome metrics and missing syllabus skills with zero candidate PII exposure.
- 📉 **Impact Estimation Engine**: Simplified stratified propensity matching engine (`computeImpact`) calculating weighted average placement uplift against illustrative synthetic control populations.

---

## Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS v4 |
| **3D Simulation** | Three.js, `three-pathfinding` (NavMesh) |
| **State Management** | Zustand (`coreStore`, `teamStore`, `uiStore`) |
| **UI & Visual Canvas** | Lucide React, React Flow (`@xyflow/react`), Recharts, React Markdown, remark-gfm |
| **Backend API** | Express.js 5.x (Node.js) |
| **AI Providers** | Google Gemini API (`@google/genai`), Sarvam AI API |
| **Search Integration** | Serper.dev API & Autonomous Gemini Synthesis |
| **Document Processing** | PDFKit (Backend generation), jsPDF (Client export), `pdf-parse` (Extraction) |
| **Auth & Deployment** | GitHub OAuth, LinkedIn OIDC, SMS OTP (MSG91 / Dev Console) |
| **Data Persistence** | Prisma ORM v5 (SQLite `file:./dev.db` dev default, PostgreSQL for prod) |

---

## System Architecture

Forge v3 operates as a dual-process system:
```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React Frontend (Vite Dev Server, Port 3000)          │  │
│  │  • Three.js 3D Simulation • Zustand Global Stores     │  │
│  │  • React Flow Visual Configurator • View Router       │  │
│  └───────────────────┬───────────────────────────────────┘  │
│                      │ HTTP /api/*                           │
│                      ▼                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Express API Server (Node.js, Port 8787)              │  │
│  │  • PDF Parsing & Generation • Multi-Agent AI Pipes    │  │
│  │  • Serper Search Aggregator • Interview Engine        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Nexus Agent Network

| Agent | Role | Responsibility |
|---|---|---|
| **Nexus-Director** | Lead Orchestrator | Coordinates workflow execution and routes data between agents |
| **Nexus-Vision** | Candidate Profiler | Parses resume PDF structure, extracting skills and experience |
| **Nexus-Strategist** | Gap & Fit Analyst | Evaluates candidate fit against JD, calculating ATS readiness |
| **Nexus-Writer** | Resume Architect | Rewrites bullet points with quantified impact and target keywords |
| **Nexus-Hunter** | Career Scout | Discovers unlisted and direct hiring opportunities via Serper |
| **Nexus-Mirror** | Interview Engine | Conducts deep cross-questioning simulation with pressure scoring |

---

## Directory Structure

```
FORG/
├── prisma/                          # Prisma ORM schema & migrations (PostgreSQL)
│   ├── schema.prisma                # Full database models & relations
│   └── migrations/                  # Versioned PostgreSQL schema migrations
├── server/                          # Express.js backend API (Port 8787)
│   ├── index.js                     # Server entry point & middleware mounting
│   ├── config.js                    # Server configuration & environment keys
│   ├── lib/
│   │   ├── prisma.js                # Singleton PrismaClient instance
│   │   └── seedAdminUser.js         # Bootstrap SUPER_ADMIN from ADMIN_GITHUB_USERNAME env var on startup
│   ├── middleware/                  # Express middleware (multer upload handling)
│   ├── routes/                      # API endpoint definitions
│   │   ├── health.js                # GET  /api/health
│   │   ├── resume.js                # POST /api/resume/extract, tailor, render-pdf
│   │   ├── github.js                # GET  /api/github/auth, user, repos
│   │   ├── chat.js                  # POST /api/chat/director
│   │   ├── interview.js             # POST /api/interview/generate, cross-question
│   │   ├── jobs.js                  # POST /api/jobs/discover (Autonomous Gemini / Serper / Fallback)
│   │   ├── linkedinAuth.js          # GET /api/linkedin/auth, callback; POST /api/linkedin/extract-pdf
│   │   ├── programs.js              # POST /api/programs/recommend
│   │   ├── trainee.js               # POST, GET /api/trainee/profile (OTP-gated)
│   │   ├── consent.js               # POST, GET /api/consent, GET /api/consent/:traineeId
│   │   ├── outcomes.js              # POST status-update, trigger-checkins, checkin-reply; GET status-history
│   │   ├── admin.js                 # GET /api/admin/whoami, POST run-dedup-scan, GET/POST dedup-candidates
│   │   ├── otpAuth.js               # POST /api/otp/send, POST /api/otp/verify (dual-mode: console/MSG91)
│   │   ├── employer.js              # POST /api/trainee/request-employer-verification, GET/POST /api/verify/:token
│   │   ├── govtCheck.js             # POST /api/admin/trigger-govt-crosscheck, GET /api/trainee/govt-crosscheck-history/:traineeId
│   │   └── analytics.js             # POST /api/admin/compute-relevance-scores, GET /api/analytics/course-relevance
│   ├── scripts/                     # Seed scripts & DB utilities
│   │   └── seedControlGroup.js      # PRNG script seeding synthetic ControlGroupRecord comparison rows (npm run db:seed-control)
│   ├── services/                    # Core business logic & AI connectors
│   │   ├── gemini.js                # Google Gemini LLM handler
│   │   ├── sarvam.js                # Sarvam AI completion handler
│   │   ├── serper.js                # Serper job search client
│   │   ├── pdfGenerator.js          # PDFKit document generator
│   │   ├── interviewEngine.js       # Interview logic & pressure scoring
│   │   ├── matchingService.js       # Trainee similarity scoring & DedupCandidate creation (findPotentialDuplicates)
│   │   ├── mergeService.js          # Atomic Prisma transaction merge (mergeTrainees)
│   │   ├── otpService.js            # Dual-mode OTP generation, hashing, console/MSG91 dispatch & verification
│   │   ├── notificationService.js   # Provider-agnostic check-in messaging stub
│   │   ├── govtVerificationService.js # Swappable e-Shram & UDYAM registry checks with deterministic phone hashing
│   │   ├── relevanceScoringService.js # 3-signal course and provider relevance scoring engine (computeRelevanceScores)
│   │   └── impactMeasurementService.js # Stratified propensity matching engine for impact uplift estimation (computeImpact)
│   └── utils/                       # Shared helpers, auth resolver, consent resolver
│       ├── auth.js                  # resolveGithubIdentity(req) — GitHub token → { githubId, login }
│       ├── adminAuth.js             # requireAdmin(minRole) RBAC middleware + logAdminAction() audit helper
│       └── consent.js               # resolveCurrentConsent(traineeId, prisma) + ALLOWED_SCOPES
├── src/                             # React 19 Frontend (Port 3000)
│   ├── core/                        # Agent brain logic & LLM interfaces
│   ├── data/                        # Preset team topologies & agent defaults
│   ├── integration/                 # Custom React hooks & Zustand stores
│   │   ├── hooks/
│   │   │   └── useTraineeProfile.ts # Onboarding state machine & profile loader
│   │   └── store/
│   │       ├── coreStore.ts         # Career analysis, task board, trainee/outcome slices
│   │       ├── teamStore.ts         # Agent team definitions & graph nodes
│   │       └── uiStore.ts           # Active sidebar navigation & modals
│   ├── interface/                   # React views and interface components
│   │   ├── Sidebar.tsx              # Permanent left navigation menu (8 views + admin + utilities)
│   │   ├── PhaseOneControlPanel.tsx # Resume upload & JD input controls
│   │   ├── SimulationView.tsx       # 3D Three.js WebGL canvas wrapper
│   │   ├── KanbanPanel.tsx          # Resizable application pipeline kanban
│   │   ├── SkillGapsView.tsx        # Section: Skill Gap Matrix
│   │   ├── JobMatchesView.tsx       # Section: Blue Ocean Job Matches
│   │   ├── RecommendedProgramsView.tsx # Section: Curated Upskilling Roadmaps
│   │   ├── InterviewPrepView.tsx    # Section: Mock Interview Simulator
│   │   ├── NewCVView.tsx            # Section: Tailored Resume & PDF Export
│   │   ├── OutcomeStatusView.tsx    # Section: Longitudinal Outcomes & Self-Report
│   │   ├── LinkedInIntegrationView.tsx # Section: LinkedIn Integration & Profile Ingestion
│   │   ├── AgentDetailDrawer.tsx    # Agent detail inspector drawer
│   │   ├── onboarding/              # 2-step DPDP onboarding overlay
│   │   │   ├── ConsentScreen.tsx    # Step 1: DPDP multi-scope consent dialog (non-blocking dismissal)
│   │   │   └── TraineeProfileSetup.tsx # Step 2: OTP-gated vocational record setup modal
│   │   ├── admin/                   # Admin-gated panel components
│   │   │   ├── AnalyticsDashboard.tsx # Government & scheme analytics dashboard (Recharts, paired response rates, migration streams)
│   │   │   ├── DedupReviewPanel.tsx # RBAC-gated dedup candidate review, scan trigger, OTP merge flow
│   │   │   └── useIsAdmin.ts        # Reusable hook: eager admin check + GET /api/admin/whoami
│   │   ├── employer/                # Standalone public employer verification portal
│   │   │   └── EmployerVerificationPage.tsx # Lightweight portal bypassing 3D scene/login
│   │   ├── provider/                # Standalone public provider analytics portal
│   │   │   └── ProviderViewPage.tsx # Read-only provider scorecards & missing skills portal at /provider/:token
│   │   └── VisualConfigurator/      # React Flow Visual Team Designer
│   ├── simulation/                  # Three.js 3D simulation engine
│   │   ├── SceneManager.ts          # Three.js scene, camera, and render loop
│   │   ├── CharacterManager.ts      # 3D avatar characters & animation states
│   │   ├── NavMeshManager.ts        # Three-pathfinding navigation grid
│   │   └── DriverManager.ts         # Agent movement & behavior drivers
│   └── theme/                       # Color palettes, typography & tokens
├── docs/                            # Deep-dive architecture & API docs
├── public/                          # Static assets (3D .glb models, textures)
├── releases/                        # Historical release notes
├── context.md                       # Complete project context reference
├── log.md                           # Development changelog & version history
└── package.json                     # NPM scripts & dependencies
```

---

## Quickstart & Local Development

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22)
- npm

### 1. Installation
```powershell
cd c:\HACKATHON\SIH\FORG
npm install
```

### 2. Configure Environment & Database
```powershell
cp .env.example .env
```
1. Fill in your API keys in `.env` (at minimum `GEMINI_API_KEY` and `SARVAM_API_KEY`).
2. **Zero-Config Database**: By default, `.env.example` configures SQLite (`DATABASE_URL="file:./dev.db"`), allowing Forge to run immediately out-of-the-box with zero external database provisioning.
3. **Production PostgreSQL**: If deploying to staging or production, replace `DATABASE_URL` with your PostgreSQL connection string (Neon, Supabase, AWS RDS, etc.):
   ```env
   DATABASE_URL="postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```

### 3. Initialize Database Schema
Run the Prisma migration to create all tables fresh:
```powershell
npm run db:migrate
```

> [!TIP]
> **Zero-Friction Local Testing**:
> - **OTP Access**: In development mode, you do not need an SMS gateway or real phone. The 6-digit verification code is logged directly to the backend terminal console:
>   `[OTP Service] Code for +919876543210: 481920 (dev mode - no SMS dispatched)`
> - **Admin Access**: `dev_trainee` is automatically bootstrapped as a `SUPER_ADMIN` on startup, giving immediate access to the Government Analytics Dashboard and Deduplication review panel.

### 4. Run Development Servers
```powershell
# Starts both frontend (port 3000) and backend API (port 8787)
npm run dev

# Or run separately:
npm run dev:web   # Vite dev server on http://localhost:3000
npm run dev:api   # Express API on http://localhost:8787
```

### 5. Build & Lint
```powershell
npm run build     # Production compilation
npm run lint      # TypeScript validation
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Database connection string (Default: `file:./dev.db` for local SQLite; PostgreSQL URL for production) |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API Key for multi-agent reasoning & autonomous job synthesis |
| `SARVAM_API_KEY` | **Yes** | Sarvam AI API Key for fast text inference |
| `SERPER_API_KEY` | Optional | Serper.dev API Key for live Google job searches (autonomous Gemini fallback used if omitted) |
| `LINKEDIN_CLIENT_ID` | Optional | LinkedIn OAuth Client ID |
| `LINKEDIN_CLIENT_SECRET` | Optional | LinkedIn OAuth Client Secret |
| `LINKEDIN_REDIRECT_URI` | Optional | LinkedIn OAuth Redirect URI (Default: `http://localhost:8787/api/linkedin/callback`) |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth Client Secret |
| `MSG91_AUTH_KEY` | Optional | MSG91 Auth Key for live SMS OTP dispatch (if omitted, OTPs log to terminal console) |
| `MSG91_TEMPLATE_ID` | Optional | MSG91 approved DLT template ID for OTPs |
| `ADMIN_GITHUB_USERNAME` | Optional | Username bootstrapped as `SUPER_ADMIN` on startup (in addition to default `dev_trainee`) |
| `PORT` | Optional | Backend server port (Default: `8787`) |
| `VITE_PORT` | Optional | Frontend dev server port (Default: `3000`) |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend status and service health check |
| `POST` | `/api/resume/extract` | Upload and extract raw text from PDF resume |
| `POST` | `/api/resume/tailor` | Single-pass AI resume tailoring against target JD |
| `POST` | `/api/resume/render-pdf` | Generates printable A4 PDF from structured resume JSON |
| `POST` | `/api/jobs/discover` | Blue Ocean job query via Serper with Gemini alignment |
| `POST` | `/api/programs/recommend` | Recommends curated upskilling courses/programs for identified skill gaps |
| `POST` | `/api/interview/generate` | Generates role-specific interview Q&A pairs |
| `POST` | `/api/interview/cross-question` | Interactive recursive cross-questioning & pressure test |
| `POST` | `/api/chat/director` | Direct chat message dispatch to Nexus-Director |
| `POST` | `/api/trainee/profile` | Create or update the caller's Trainee record and append a new Enrolment (auth: Bearer token) |
| `GET` | `/api/trainee/profile` | Retrieve the caller's Trainee with all Enrolments and current consent state (auth: Bearer token) |
| `POST` | `/api/consent` | Record a new consent event (grant or revoke) for the caller's Trainee — append-only audit trail (auth: Bearer token) |
| `GET` | `/api/consent` | Retrieve the caller's current consent state across all scopes (auth: Bearer token) |
| `GET` | `/api/consent/:traineeId` | Return current (latest per scope) consent state for a given trainee ID (public) |
| `POST` | `/api/trainee/status-update` | Self-report employment status with training relevance, self-employment type, apprenticeship partner, or non-placement reason (auth: Bearer token) |
| `GET` | `/api/trainee/status-history/:traineeId` | Return all OutcomeCheckIns for a trainee with attached EmployerVerification records, newest first (public) |
| `POST` | `/api/trainee/request-employer-verification` | Trigger verification request to employer email; gated by EMPLOYER_SHARING consent and checks domain legitimacy (auth: Bearer token) |
| `GET` | `/api/verify/:token` | Public privacy-preserving verification metadata lookup (trainee first name only, course/scheme context, claimed employer, status) |
| `POST` | `/api/verify/:token` | Public employer confirmation or denial with required reason code (`SKILL_GAP`, `WAGE_MISMATCH`, `LOCATION`, `NO_SHOW`, `ROLE_MISMATCH`, `OTHER`) |
| `GET` | `/api/admin/whoami` | Resolves caller's GitHub token to an AdminUser and returns their role (auth: Bearer token, minRole: ANALYST) |
| `POST` | `/api/admin/trigger-checkins` | Manually trigger 90/180/365-day check-in cycle; accepts optional `{ daysAgo }` override (auth: Bearer token, minRole: ANALYST) |
| `POST` | `/api/admin/run-dedup-scan` | Triggers the deduplication matching service to find potential duplicates (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/admin/dedup-candidates` | Returns all pending deduplication candidates with side-by-side trainee details (auth: Bearer token, minRole: REVIEWER) |
| `POST` | `/api/admin/dedup-candidates/:id/resolve` | Resolves a candidate with `{ action: 'MERGE' | 'REJECT' }` (auth: Bearer token, minRole: REVIEWER, requires OTP) |
| `POST` | `/api/admin/trigger-govt-crosscheck` | Triggers e-Shram & UDYAM registry checks for a trainee; gated by GOVT_CROSS_CHECK consent and logs to AdminActionLog (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/trainee/govt-crosscheck-history/:traineeId` | Return all government registry cross-check results for a trainee, newest first (public) |
| `POST` | `/api/admin/compute-relevance-scores` | Computes course & provider relevance scorecards from 3 signals (employer denials, trainee check-ins, Resume Forge gaps); logs to AdminActionLog (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/course-relevance` | Returns all course relevance scorecards sorted worst-first (ascending), with unscored nulls at end (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/course-relevance/:courseName/:providerName` | Returns single scorecard drill-down with full employer, trainee, and missing-skills breakdowns (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/overview` | Overall analytics metrics (total enrolments, trainees, response rate, placement rate, status breakdown); pairs response rate alongside placement rate (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/by-district` | Parallel `homeDistrictBreakdown` and `placementDistrictBreakdown` capturing labor migration streams and `topHomeDistricts` (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/by-cohort` | Cohort-level performance breakdown with paired placement and response rates (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/by-provider` | Provider-level breakdown joined with `CourseRelevanceScore` averages and course scorecards (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/wage-progression` | Longitudinal wage progression tracking percentage moved up, stayed same, and discrete band transitions for candidates with $\ge 2$ check-ins (auth: Bearer token, minRole: ANALYST) |
| `POST` | `/api/admin/generate-provider-token` | Generates a secure access token (`pvt_<hex>`) and shareable link for a training provider; logs to AdminActionLog (auth: Bearer token, minRole: ANALYST) |
| `POST` | `/api/admin/seed-control-group` | Seeds synthetic `ControlGroupRecord` rows for impact comparison; requires `{ confirm: true }` body (auth: Bearer token, minRole: ANALYST) |
| `GET` | `/api/analytics/impact` | Calculates stratified propensity matching placement uplift against synthetic control group; returns disclaimer string (auth: Bearer token, minRole: ANALYST) |
| `POST` | `/api/webhook/checkin-reply` | Simulated inbound WhatsApp/SMS reply — updates a PENDING check-in to COMPLETED |
| `POST` | `/api/otp/send` | Triggers a 6-digit SMS OTP to a provided phone number via MSG91 |
| `POST` | `/api/otp/verify` | Verifies the provided 6-digit OTP and returns a signed verification token |

---

## Frontend Navigation & Views

1. **Dashboard** (`/`):
   - Interactive 3D Three.js office simulation showing active agent avatars.
   - Top Phase 1 control panel (Resume upload + JD prompt).
   - Bottom resizable Kanban application pipeline.
2. **Skill Gaps**:
   - ATS score breakdown, missing keywords, hard & soft skill comparison.
3. **Job Matches**:
   - Ranked direct-hire opportunities with fit percentages and direct apply URLs.
4. **Recommended Programs**:
   - Tailored learning modules addressing identified skill gaps.
5. **Interview Prep**:
   - Multi-question mock interview practice with real-time feedback.
6. **New CV**:
   - Tailored resume output with PDF generation & direct download.
7. **My Outcome**:
   - Post-training employment outcome self-reporting and 3/6/12-month milestone follow-up history.
   - Longitudinal tracking with wage band, verified employer attribution, and DPDP-compliant consent auditing.
8. **LinkedIn Integration**:
   - Verified candidate identity ingestion via LinkedIn OIDC.
   - Profile PDF upload mechanism extracting experience inline via `pdf-parse` (no separate `pdfExtractor.js` service needed).
   - Automated STAR-method resume bullet extraction from work history.

> **Note**: **Nexus Teams (Visual Configurator)** (React Flow multi-agent hierarchy designer) and **BYOK Key Manager** are directly accessible via the persistent bottom utility toolbar in the left sidebar.

### Admin Surfaces (RBAC-Gated)
- **Government Analytics Dashboard**: Full-screen governance interface accessible via the permanent left `Sidebar.tsx` for authenticated `ANALYST` / `REVIEWER` / `SUPER_ADMIN` users (and auto-seeded `dev_trainee` in local development).
  - **Paired Confidence Metrics**: Placement rates are never presented alone — always accompanied by active response rates.
  - **District Migration Analytics**: Dual view toggling between Trainee Home District and Actual Placement District with inbound labor migration streams.
  - **Cohort Performance**: Cohort-by-cohort Recharts bar charts tracking outcome milestones.
  - **Provider Scorecards**: Sortable by relevance score (default: worst-performing first) with separated employer denial reasons and trainee searching hurdles.
  - **Wage Progression Tracking**: Upward, horizontal, or downward wage band movement across longitudinal check-in rounds.
  - **Provider Link Generator**: Self-service generator creating time-expiring access tokens (`pvt_<hex>`) for vocational training providers.
  - **Impact Estimation Engine**: Calculates stratified propensity matching placement uplift against synthetic control groups.
- **Trainee Deduplication Review Panel**: Identity resolution interface for fuzzy-matched candidate records with OTP-confirmed atomic merges.

### Standalone Public Portals (Token-Gated, No 3D Scene / Login Required)
- **Employer Verification Portal** (`/verify/:token`): Lightweight, mobile-friendly page allowing corporate HR to confirm employment claims or report denial reason codes without needing a platform account.
- **Provider Analytics Portal** (`/provider/:token`): Dedicated read-only dashboard for training providers to inspect their aggregated course performance, placement response rates, missing syllabus skills, and employer feedback with complete candidate PII isolation.

---

## Repository & License

- **Repository**: [https://github.com/ayuushhxx/NEXIS.git](https://github.com/ayuushhxx/NEXIS.git)
- **License**: MIT
- **Author**: [prkhrexists](https://github.com/prkhrexists) / [ayuushhxx](https://github.com/ayuushhxx)
