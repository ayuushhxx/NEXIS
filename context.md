# Forge v3 - Master Context & Technical Reference


## 1. Project Summary
**Forge v3** is a 3D career orchestration platform combining an immersive 3D simulation UX (built with Three.js and React Flow) with practical job-search execution tools (Resume Forge, Nexus-Hunter, Nexus-Mirror) driven by a specialized **Nexus Agent Network**.

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite, TailwindCSS v4 |
| **3D Simulation Engine** | Three.js, three-pathfinding (NavMesh & Character Pathing) |
| **State Management** | Zustand (3 specialized stores: `coreStore`, `teamStore`, `uiStore`) |
| **UI Components & Icons** | Lucide React, React Flow (`@xyflow/react`), Recharts, React Markdown, remark-gfm |
| **Backend API Server** | Express.js 5.x (Node.js) |
| **AI Integration** | Google Gemini API (`@google/genai`), Sarvam AI API |
| **Job Search Provider** | Serper.dev API & Autonomous Gemini Synthesis |
| **Document Generation** | PDFKit (Backend server rendering), jsPDF (Frontend client rendering), `pdf-parse` |
| **Authentication** | GitHub OAuth, LinkedIn OIDC, SMS OTP (MSG91 / Dev Console) |
| **Data Persistence** | Prisma ORM v5 (SQLite default in dev `file:./dev.db`, PostgreSQL for prod) |

---

## 3. System Architecture & Dual-Process Design

Forge v3 operates as a dual-process architecture:
```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React 19 Frontend (Vite Dev Server, Port 3000)       │  │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│  │  │ Three.js  │  │  Zustand   │  │   React Flow     │  │  │
│  │  │ 3D Scene  │  │  Stores    │  │ (Team Config)    │  │  │
│  │  └───────────┘  └────────────┘  └──────────────────┘  │  │
│  └───────────────────┬───────────────────────────────────┘  │
│                      │ HTTP /api/* (Proxy / Direct)         │
│                      ▼                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Express Backend API (Node.js, Port 8787)             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │  Routes   │  │ Services │  │     Utils        │    │  │
│  │  │ (16 files)│→ │(12 files)│  │ (auth, consent)  │    │  │
│  │  └──────────┘  └────┬─────┘  └──────────────────┘    │  │
│  └──────────────────────┼────────────────────────────────┘  │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTPS External APIs
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  Gemini  │   │  Sarvam  │   │  Serper  │
    │   API    │   │   API    │   │   API    │
    └──────────┘   └──────────┘   └──────────┘
```

1. **Frontend Server (Vite)**: Runs on port `3000` (http://localhost:3000). Handles real-time WebGL rendering, character animation state machines, React Flow node canvas, and dashboard interfaces.
2. **Backend API (Express)**: Runs on port `8787` (http://localhost:8787). Handles PDF parsing, multi-agent AI prompt orchestration, Serper web queries, autonomous job synthesis, PDF generation, and interview engines.

---

## 4. Key Workflows & Pipelines

### 4.1 Resume Optimization & Tailoring (`Resume Forge`)
1. **Extraction**: User uploads PDF → `POST /api/resume/extract` (`pdf-parse` extracts raw text).
2. **Single-Pass Optimization**: User pastes JD → `POST /api/resume/tailor` sends structured prompt to Sarvam / Gemini.
3. **Multi-Agent Evaluation**: Strategist & Writer return:
   - ATS compatibility score & breakdown
   - Skill gaps & target strengths
   - Interview readiness metrics
   - Structured JSON resume data
4. **PDF Compilation**: `POST /api/resume/render-pdf` compiles A4 printable PDF using PDFKit.

### 4.2 Autonomous Role-Adaptive Job Discovery (`Nexus-Hunter`)
1. **Query Formulation**: `POST /api/jobs/discover` receives candidate target role, domain, and parsed resume summary.
2. **Multi-Mode Discovery Pipeline**:
   - **Mode 1: Serper Web Search (`gemini-serper`)**: When `SERPER_API_KEY` is provided, queries Google via Serper.dev with precision queries (e.g. `site:careers.*`, direct hiring boards) and runs Gemini alignment scoring.
   - **Mode 2: Autonomous LLM Synthesis (`gemini-autonomous`)**: When `SERPER_API_KEY` is omitted or returns 0 matches, Google Gemini autonomously generates 3 hyper-realistic, high-fit job opportunities tailored specifically to the candidate's actual `targetRole` and `resume`.
   - **Mode 3: Dynamic Adaptive Fallback (`adaptive-fallback`)**: When external LLM quotas or networks are unavailable, generates dynamic, role-adaptive opportunities tailored to the candidate's specific vocational domain (replacing static hardcoded defaults).
3. **Blue Ocean Scoring**: Prioritizes direct career pages and unlisted openings over saturated aggregator boards (LinkedIn/Indeed spam).
4. **Target Delivery**: Delivers ranked job matches with fit score, alignment rationale, competition level, and application URLs.

### 4.3 Interactive Cross-Examination (`Nexus-Mirror`)
1. **Question Generation**: `POST /api/interview/generate` generates role-specific technical and behavioral questions.
2. **Interactive Simulation**: Candidate submits audio/text responses.
3. **Recursive Cross-Questioning**: `POST /api/interview/cross-question` analyzes candidate answer, detects weaknesses/ambiguity, and increases pressure with targeted follow-ups.
4. **Heuristic Fallback**: Includes a rule-based fallback engine if external LLM quotas are reached.

### 4.4 LinkedIn Integration & Profile Ingestion
1. **Verified Candidate Identity**: Ingestion via LinkedIn OIDC (`GET /api/linkedin/auth`, `GET /api/linkedin/callback`).
2. **Profile PDF Upload**: Profile PDF upload mechanism (`POST /api/linkedin/extract-pdf`) extracting experience inline via `pdf-parse` (no separate service needed).
3. **STAR-Method Bullet Extraction**: Automated STAR-method resume bullet extraction from extracted work history.

### 4.5 Dual-Mode OTP & Identity Verification Architecture
1. **Developer / Local Mode**: When running without SMS gateway credentials, 6-digit OTP codes are logged directly to the backend terminal console (`[OTP Service] Code: XXXXXX`). This enables instant, friction-free local development and evaluation without phone or gateway dependencies.
2. **Production Mode**: When `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` are configured, OTPs are securely dispatched via the MSG91 SMS gateway using TRAI DLT-approved transactional templates.
3. **Zero-Latency Admin Bypass**: `src/interface/admin/useIsAdmin.ts` eagerly initializes `isAdmin: true` for development tokens (`dev_trainee`, `mock_*`, `dev_*`), and `server/lib/seedAdminUser.js` auto-seeds `dev_trainee` as `SUPER_ADMIN` in the database on startup.

### 4.6 Non-Blocking DPDP Consent & Onboarding De-Escalation
1. **Consent-First Architecture**: Gated by India's Digital Personal Data Protection (DPDP) Act with four granular scopes: `JOB_SEARCH_DATA`, `EMPLOYER_SHARING`, `ANALYTICS`, `GOVT_CROSS_CHECK`.
2. **De-Escalation & Non-Blocking Dismissal**: `src/interface/onboarding/ConsentScreen.tsx` includes:
   - Top-right close button (`X`) and backdrop dismissal.
   - "Skip for now" demo mode button allowing reviewers to explore the 3D simulation and dashboard without committing consent scopes immediately.
   - Inline "Continue Anyway" error bypass inside the error banner if network or database latency occurs.

---

## 5. Directory Map

```
c:\HACKATHON\SIH\FORG\
├── server/                          # Express.js backend API (Port 8787)
│   ├── index.js                     # Server entrypoint & middleware setup
│   ├── config.js                    # Environment constants & API keys (Gemini, Sarvam, LinkedIn, MSG91)
│   ├── middleware/
│   │   └── upload.js                # Multer PDF memory storage handler
│   ├── lib/
│   │   ├── prisma.js                # Singleton PrismaClient instance
│   │   └── seedAdminUser.js         # Auto-seeds SUPER_ADMIN (dev_trainee + ADMIN_GITHUB_USERNAME)
│   ├── routes/
│   │   ├── health.js                # GET /api/health
│   │   ├── resume.js                # POST /api/resume/extract, tailor, render-pdf
│   │   ├── github.js                # GET /api/github/auth, user, repos
│   │   ├── linkedinAuth.js          # GET /api/linkedin/auth, callback; POST /api/linkedin/extract-pdf
│   │   ├── chat.js                  # POST /api/chat/director
│   │   ├── interview.js             # POST /api/interview/generate, cross-question
│   │   ├── jobs.js                  # POST /api/jobs/discover (Gemini Serper / Autonomous / Fallback)
│   │   ├── programs.js              # POST /api/programs/recommend
│   │   ├── trainee.js               # POST/GET /api/trainee/profile (OTP-gated creation)
│   │   ├── consent.js               # POST/GET /api/consent; GET /api/consent/:traineeId
│   │   ├── outcomes.js              # POST status-update, trigger-checkins; GET status-history
│   │   ├── admin.js                 # GET /api/admin/whoami; POST run-dedup-scan; GET/POST dedup-candidates
│   │   ├── otpAuth.js               # POST /api/otp/send; POST /api/otp/verify
│   │   ├── employer.js              # POST /api/trainee/request-employer-verification; GET/POST /api/verify/:token
│   │   ├── govtCheck.js             # POST /api/admin/trigger-govt-crosscheck; GET /api/trainee/govt-crosscheck-history/:traineeId
│   │   └── analytics.js             # POST /api/admin/compute-relevance-scores; GET /api/analytics/course-relevance
│   ├── services/
│   │   ├── gemini.js                # Google Gemini SDK orchestration
│   │   ├── sarvam.js                # Sarvam AI completion client
│   │   ├── serper.js                # Serper search query engine
│   │   ├── pdfGenerator.js          # PDFKit PDF document builder
│   │   ├── interviewEngine.js       # Cross-questioning & pressure rating engine
│   │   ├── matchingService.js       # Jaro-Winkler similarity scoring & DedupCandidate creation
│   │   ├── mergeService.js          # Atomic Prisma $transaction merge (mergeTrainees)
│   │   ├── otpService.js            # Dual-mode OTP generation, hashing, console/MSG91 dispatch & verification
│   │   ├── notificationService.js   # Provider-agnostic check-in messaging stub
│   │   ├── govtVerificationService.js # Swappable e-Shram & UDYAM registry checks
│   │   ├── relevanceScoringService.js # 3-signal course/provider relevance scoring engine
│   │   └── impactMeasurementService.js # Stratified propensity matching engine for impact uplift estimation
│   └── utils/                       # JSON parsers, HTTP response helpers, error handlers
│       ├── auth.js                  # resolveGithubIdentity(req) — Bearer token → { githubId, login }
│       ├── adminAuth.js             # requireAdmin(minRole) RBAC middleware + logAdminAction() helper
│       └── consent.js               # resolveCurrentConsent(traineeId, prisma) + ALLOWED_SCOPES
├── src/                             # React 19 Frontend (Port 3000)
│   ├── core/                        # Agent brain logic, LLM tools, agent host
│   ├── data/                        # Agent definitions, presets, starter teams
│   ├── integration/
│   │   ├── hooks/                   # Custom React hooks (useAgent, useLLM, useSimulation)
│   │   └── store/
│   │       ├── coreStore.ts         # Career analysis, task board, pipeline stages
│   │       ├── teamStore.ts         # Agent team definitions, custom architectures
│   │       └── uiStore.ts           # Sidebar active tabs, modal states, BYOK keys
│   ├── interface/                   # React UI components & views
│   │   ├── Sidebar.tsx              # Permanent left navigation menu (8 views + admin + utilities)
│   │   ├── PhaseOneControlPanel.tsx # Resume upload & JD input controls
│   │   ├── SimulationView.tsx       # 3D Three.js WebGL canvas wrapper
│   │   ├── KanbanPanel.tsx          # Resizable application pipeline kanban
│   │   ├── SkillGapsView.tsx        # Section: ATS skill gap matrix
│   │   ├── JobMatchesView.tsx       # Section: Blue Ocean job discovery
│   │   ├── RecommendedProgramsView.tsx # Section: Curated upskilling roadmaps
│   │   ├── InterviewPrepView.tsx    # Section: Mock interview simulator
│   │   ├── NewCVView.tsx            # Section: Tailored resume viewer & PDF exporter
│   │   ├── OutcomeStatusView.tsx    # Section: Longitudinal outcomes & self-report
│   │   ├── LinkedInIntegrationView.tsx # Section: LinkedIn Profile Integration & STAR bullets
│   │   ├── AgentDetailDrawer.tsx    # Slide-in inspector for selected agent
│   │   ├── onboarding/              # 2-step DPDP onboarding overlay
│   │   │   ├── ConsentScreen.tsx    # Step 1: DPDP multi-scope consent dialog (non-blocking dismissal)
│   │   │   └── TraineeProfileSetup.tsx # Step 2: OTP-gated vocational record setup modal
│   │   ├── admin/                   # Admin-gated panel components (RBAC-gated)
│   │   │   ├── AnalyticsDashboard.tsx # Government & provider analytics dashboard (Recharts, migration, paired rates)
│   │   │   ├── DedupReviewPanel.tsx # Dedup candidate review, scan trigger, OTP-gated merge
│   │   │   └── useIsAdmin.ts        # Hook: eager admin check + GET /api/admin/whoami
│   │   ├── employer/                # Standalone public employer verification portal
│   │   │   └── EmployerVerificationPage.tsx # Lightweight portal bypassing 3D scene/login (/verify/:token)
│   │   ├── provider/                # Standalone public provider analytics portal
│   │   │   └── ProviderViewPage.tsx # Isolated read-only metrics & course scorecards (/provider/:token)
│   │   └── VisualConfigurator/      # React Flow visual agent team designer
│   ├── simulation/                  # Three.js simulation engine
│   │   ├── SceneManager.ts          # Three.js scene, camera, lights, render loop
│   │   ├── CharacterManager.ts      # 3D avatar meshes, animation state machines
│   │   ├── NavMeshManager.ts        # Three-pathfinding navigation grid
│   │   └── DriverManager.ts         # Agent pathing & behavior drivers
│   └── theme/                       # Color palettes, typography & design tokens
├── docs/                            # Deep-dive architecture and API specifications
├── public/                          # 3D models (.glb), textures, icons
├── releases/                        # Version changelogs (v0.1.0, v0.2.0)
├── context.md                       # High-level architecture & context (this file)
├── README.md                        # Project landing document & quickstart
├── log.md                           # Comprehensive development & version log
└── package.json                     # Scripts & dependencies
```

---

## 6. Nexus Agent Roles & Responsibilities

| Agent Name | Core Specialty | Key Output |
|---|---|---|
| **Nexus-Director** | Orchestration & Workflow Routing | Manages pipeline sequence, delegating sub-tasks to specialists |
| **Nexus-Vision** | Candidate Profiling & Parsing | Extracts skills, career trajectory, and achievements from PDF |
| **Nexus-Strategist** | Gap Analysis & Positioning | Calculates ATS match %, identifies missing skills, recommends angles |
| **Nexus-Writer** | Resume & Document Tailoring | Rewrites bullet points using action verbs and quantified impact metrics |
| **Nexus-Hunter** | Opportunity Discovery | Finds direct career portals and unlisted high-fit job opportunities |
| **Nexus-Mirror** | Interview Simulator | Conducts multi-turn technical cross-questioning with pressure tests |

---

## 7. State Management Architecture

### `coreStore.ts`
- **Career State**: Raw resume text, target JD, ATS match score, skill gaps array, recommended programs list, job matches list.
- **Workflow State**: Active pipeline stage (`Discovery` → `Tailoring` → `Verification` → `Ready`).
- **Modal Flags**: `isResumeForgeOpen`, `isNexusHunterOpen`, `isNexusMirrorOpen`, `isFinalOutputOpen`.

### `uiStore.ts`
- **Navigation**: `activeSidebarTab` (`dashboard` | `skill-gaps` | `job-matches` | `recommended-programs` | `interview-prep` | `new-cv` | `my-outcome` | `linkedin-integration`).
- **Inspection**: `selectedAgentId`, inspector drawer open/close.
- **BYOK Config**: User-provided Gemini / Sarvam keys.

### `teamStore.ts`
- **Team Sets**: Predefined and custom agent hierarchies (nodes, edges, model assignments).
- **Execution Mode**: Autonomous vs Human-in-the-Loop (HITL).

---

## 8. Development & Environment Quickstart

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22)
- npm

### Environment Setup (`.env`)
```bash
# Copy example
cp .env.example .env
```
Key environment variables:
- `DATABASE_URL`: Database connection string (Default: `file:./dev.db` for SQLite; or PostgreSQL connection string e.g. `postgresql://user:pass@host:5432/db` for production)
- `GEMINI_API_KEY`: Google Gemini LLM API Key (Required for AI generation and autonomous job synthesis)
- `SARVAM_API_KEY`: Sarvam AI API Key (Required for fast text inference)
- `SERPER_API_KEY`: Serper.dev Key (Optional — for live Google job search; autonomous Gemini fallback activates if omitted)
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`: LinkedIn OAuth App credentials
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: GitHub OAuth App keys (Optional)
- `MSG91_AUTH_KEY` / `MSG91_TEMPLATE_ID`: MSG91 SMS gateway credentials (Optional — if omitted, OTPs log to terminal console)
- `ADMIN_GITHUB_USERNAME`: Auto-bootstrapped `SUPER_ADMIN` GitHub username (in addition to default `dev_trainee`)
- `PORT`: Backend port (Default: `8787`)
- `VITE_PORT`: Frontend port (Default: `3000`)

> [!TIP]
> **Zero-Friction Local OTP Testing**: In local development, you do not need an SMS provider or SIM card. Whenever an OTP is requested via mobile authentication, the 6-digit verification code is printed directly into the backend terminal console:
> ```
> [OTP Service] Code for +919876543210: 481920 (dev mode - no SMS dispatched)
> ```

### Execution Commands
```powershell
# Run both Frontend (port 3000) and Backend (port 8787)
npm run dev

# Run only Vite Frontend
npm run dev:web

# Run only Express Backend
npm run dev:api

# Compile production build
npm run build

# TypeScript validation
npm run lint

# Prisma: apply pending migrations to dev.db
npm run db:migrate

# Prisma: open Studio visual DB browser
npm run db:studio

# Seed synthetic ControlGroupRecord rows (200 by default)
# IMPORTANT: these are SYNTHETIC illustrative rows — not real data
npm run db:seed-control
# Custom count:
node server/scripts/seedControlGroup.js 500
# Force re-seed (delete all existing rows first):
node server/scripts/seedControlGroup.js 200 --force
```

---

## 9. Data Layer

Forge v3 uses **Prisma ORM v5** with **SQLite** (`file:./dev.db`) as the default local development datasource for zero-friction setup, and fully supports **PostgreSQL** (e.g. Neon, Supabase, AWS RDS, or self-hosted PostgreSQL) for staging and production deployments. All models use portable Prisma types (`String`, `Boolean`, `DateTime`, `Float`) ensuring consistent behavior across cloud and containerized environments.

### Models

| Model | Key Fields | Purpose |
|---|---|---|
| **Trainee** | `id` (cuid), `phoneNumber` (unique), `phoneVerified`, `name`, `preferredLanguage`, `githubId?`, `dateOfBirth?`, `district?`, `aadhaarLast4Hash?`, `mergedIntoId?`, `priorQualification?` | Durable identity record for a vocational trainee. Includes optional deduplication signals (`dateOfBirth`, `district`, `aadhaarLast4Hash`). `priorQualification` added v0.3.8 as a stratification signal for impact estimation. `mergedIntoId` is set when a duplicate profile is softly deleted and merged into a canonical profile. |
| **OtpVerification** | `id`, `phoneNumber`, `hashedOtp`, `expiresAt`, `verified` | Temporary store for SMS OTPs, verifying identity before trainee creation or deduplication merges. |
| **Enrolment** | `id`, `traineeId` (FK), `scheme`, `courseName`, `providerName`, `cohortName`, `enrolmentDate`, `certificationDate?` | One row per scheme enrolment. A Trainee can accumulate N rows over time (PMKVY → ITI → re-enrol), seeding the unified-ID-across-schemes concept without duplicating trainee data. |
| **ConsentRecord** | `id`, `traineeId` (FK), `scope` (`JOB_SEARCH_DATA` \| `EMPLOYER_SHARING` \| `ANALYTICS` \| `GOVT_CROSS_CHECK`), `granted`, `grantedAt`, `revokedAt?`, `version` | Append-only consent audit log. Every grant/revoke inserts a new row; "current" consent is the latest row per scope, resolved by `server/utils/consent.js`. |
| **OutcomeCheckIn** | `id`, `traineeId` (FK), `checkinType` (`SELF_INITIATED`\|`90_DAY`\|`180_DAY`\|`365_DAY`), `status`, `employmentStatus?`, `employerName?`, `wageBand?`, `scheduledFor?`, `respondedAt?`, `roleRelevance?`, `selfEmploymentType?`, `apprenticeshipEmployer?`, `nonPlacementReason?`, `placementDistrict?` | Employment outcome record. Created by self-report or system trigger. Append-only: each milestone creates a new row. Enriched with training relevance, self-employment details, apprenticeship details, non-placement reasons, and placement district (for migration attribution). |
| **EmployerVerification** | `id`, `outcomeCheckInId` (FK, unique), `traineeId` (FK, denormalized), `employerNameClaimed`, `employerContactEmail`, `contactDomainFlag`, `verificationToken` (unique), `tokenExpiresAt`, `status` (`PENDING`\|`CONFIRMED`\|`DENIED`), `reasonCode?`, `reasonNotes?`, `verifiedByName?`, `verifiedAt?`, `createdAt` | Independent employer verification record. Links employer attestation or denial to a trainee's self-reported outcome. |
| **AdminUser** | `id` (cuid), `githubUsername` (unique), `role` (`SUPER_ADMIN`\|`REVIEWER`\|`ANALYST`), `createdAt` | RBAC identity table. Identity is resolved via GitHub OAuth token matching `githubUsername`. Replaces prior ad-hoc string checking. |
| **AdminActionLog** | `id`, `adminUserId` (FK), `action`, `targetType`, `targetId`, `details` (JSON string), `createdAt` | Append-only audit trail for all admin actions. Every mutating admin route inserts a row detailing the before/after state. |
| **DedupCandidate** | `id`, `traineeIdA` (FK), `traineeIdB` (FK), `matchScore`, `matchReasons`, `status` (`PENDING`\|`CONFIRMED_MERGE`\|`REJECTED`) | Identifies potential duplicate Trainee records using a similarity-based matching service, enabling a human-in-the-loop review workflow. |
| **GovtCrossCheckResult** | `id` (cuid), `traineeId` (FK), `source` (`ESHRAM`\|`UDYAM`), `matchFound` (boolean), `matchConfidence` (float?), `matchedRecordSummary` (string?), `checkedAt` (DateTime) | Independent government registry corroboration record. Stores matched status and summary from e-Shram or UDYAM cross-checks triggered by admins. |
| **SkillGapSnapshot** | `id` (cuid), `traineeId` (FK), `jdTitle`, `missingSkills` (JSON string array), `atsScore` (float?), `createdAt` | Captures individual skill gaps and ATS compatibility score from Resume Forge sessions for verified trainees. Used as Signal 3 in course relevance scoring. |
| **CourseRelevanceScore** | `id` (cuid), `courseName`, `providerName`, `totalClaims`, `confirmedCount`, `deniedCount`, `employerReasonBreakdown` (JSON), `traineeReasonBreakdown` (JSON), `topMissingSkills` (JSON), `relevanceScore` (float?), `computedAt` | Aggregated scorecard per course/provider combining employer denial reasons, trainee non-placement reasons, and persisted Resume Forge skill gaps. Unique on `(courseName, providerName)`. |
| **ProviderAccessToken** | `id` (cuid), `providerName`, `token` (unique), `createdAt`, `expiresAt?` | Read-only access token for a training provider to access their own isolated aggregate placement metrics and course relevance scorecards. |
| **ControlGroupRecord** | `id` (cuid), `ageBand` (`18-25`\|`26-35`\|`36-45`\|`46+`), `district`, `priorQualification`, `employmentStatus`, `wageBand?`, `isSynthetic` (default `true`), `createdAt` | **SYNTHETIC ILLUSTRATIVE DATA** generated by `server/scripts/seedControlGroup.js`. Used as the comparison population in `computeImpact()`. Does NOT represent real people who did not train. `isSynthetic = false` can be set on rows imported from real data sources (e.g. PLFS/NSSO micro-data) without a schema change. |

### Trainee Deduplication Architecture

This project uses **similarity-based suggestion plus human review, not automatic merging**. Automatic merging without review is risky and non-compliant with our consent model.

1. **Signals**: `name` (Jaro-Winkler, weight 0.35), `dateOfBirth` (exact, 0.25), `phoneNumber` last-6 (exact, 0.20), `district` (exact, 0.10), `aadhaarLast4Hash` (exact, 0.10).
2. **Missing-Data Redistribution**: If any optional signal is missing for either record in the pair, its weight is distributed proportionally among the signals that *are* available, ensuring the score is not artificially lowered.
3. **Aadhaar Policy**: `aadhaarLast4Hash` stores only a SHA-256 hash of the last 4 Aadhaar digits. **It is a passive weak-matching signal only, not a security or identity-verification mechanism**. A 4-digit space is trivially brute-forceable. Full Aadhaar authentication is out of scope.
4. **Atomic Merging**: When an admin reviews and merges a `DedupCandidate`, all `Enrolment`, `ConsentRecord`, and `OutcomeCheckIn` records from Trainee B are reassigned to Trainee A. Trainee B is soft-deleted via `mergedIntoId = Trainee A's ID`. This is executed within a single Prisma `$transaction` ensuring complete ACID safety (no partial state possible).

### Supporting Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Prisma schema — models, datasource, generator |
| `prisma/migrations/` | Auto-generated SQL migration history |
| `server/lib/prisma.js` | Singleton `PrismaClient` instance shared across route modules |
| `server/utils/auth.js` | `resolveGithubIdentity(req)` — reads Bearer token, calls GitHub API, returns `{ githubId, login }` |
| `server/utils/adminAuth.js` | `requireAdmin(minRole)` middleware and `logAdminAction(...)` audit logger |
| `server/services/matchingService.js` | Similarity matching algorithm (`findPotentialDuplicates`) |
| `server/services/mergeService.js` | Atomic merging logic (`mergeTrainees`) |
| `server/services/otpService.js` | OTP generation, hashing, verification, and MSG91 integration |
| `server/routes/otpAuth.js` | Exposed endpoints for OTP sending and token-based verification |
| `server/routes/employer.js` | Verification request and public employer confirmation endpoints |
| `src/interface/employer/EmployerVerificationPage.tsx` | Standalone public verification portal for employers |
| `server/utils/consent.js` | `resolveCurrentConsent(traineeId, prisma)` + `ALLOWED_SCOPES` constant |
| `server/services/notificationService.js` | Provider-agnostic check-in and employer verification messaging stub |
| `server/services/govtVerificationService.js` | Swappable provider for e-Shram & UDYAM registry checks with deterministic phone hashing |
| `server/routes/govtCheck.js` | Admin-triggered registry cross-checks & trainee corroboration history endpoints |
| `server/services/relevanceScoringService.js` | 3-signal course and provider relevance scoring engine (`computeRelevanceScores`) |
| `server/routes/analytics.js` | RBAC-gated government/provider analytics aggregation endpoints (overview, by-district with home/placement migration split, by-cohort, by-provider, wage-progression, course relevance) and token-authenticated provider read-only view |
| `src/interface/admin/AnalyticsDashboard.tsx` | Comprehensive admin analytics dashboard (Recharts visualizations, paired rates, migration views, sortable provider scorecards, link generator) |
| `src/interface/provider/ProviderViewPage.tsx` | Standalone token-authenticated provider portal (`/provider/:token`) displaying isolated aggregate outcomes with zero candidate PII |

---

## 10. Outcome Tracking (Phase 1.5)

Forge v3 implements the 3/6/12-month follow-up mechanism described in the SIH pitch. The system is **fully functional as a simulation** — structured so a real WhatsApp Business API or SMS gateway (Twilio, Gupshup, MSG91) can be connected later without changing any calling code.

### How it works

1. **Self-report** (`POST /api/trainee/status-update`): A trainee can report their employment status at any time. Creates a `SELF_INITIATED` OutcomeCheckIn.
2. **Scheduled triggers** (`POST /api/admin/trigger-checkins`): In production, a cron job calls this endpoint every night. It finds all trainees whose earliest enrolment was ~90, ~180, or ~365 days ago (±3 days tolerance), creates a `PENDING` OutcomeCheckIn for each, and calls `notificationService.sendCheckinMessage`.  
   For hackathon demos, pass `{ daysAgo: N }` in the body to force-trigger any window on stage.
3. **Simulated reply** (`POST /api/webhook/checkin-reply`): Simulates an inbound WhatsApp/SMS reply. In production, the provider's webhook would POST here. Updates the matching PENDING check-in to COMPLETED.

### `notificationService.js` — Stub Interface

`server/services/notificationService.js` exports:
- `sendCheckinMessage(trainee, checkin)`
- `sendEmployerVerificationRequest(employerContact, verificationLink, details)`

Internally it uses an **`activeProvider` pattern** — a provider object with a `send(trainee, checkin)` and `sendEmployerVerification(...)` method. The current provider is a **console stub** that logs structured messages formatted like production email/WhatsApp messages, returning a mock `messageId`.

---

## 11. Employer Verification & Outcome Data Enrichment (v0.3.1)

### 11.1 Employer Verification Flow & Domain Legitimacy Signal

Trainee self-reports of `EMPLOYED` status can be verified by their claimed employer:
1. **Consent Gating**: Trainee must have granted `EMPLOYER_SHARING` consent in `ConsentRecord` (checked via `resolveCurrentConsent`). If not granted, the endpoint returns HTTP 403 (`consentRequired: 'EMPLOYER_SHARING'`), and the UI directs the trainee to consent settings.
2. **Domain Legitimacy Signal (`contactDomainFlag`)**:
   - `contactDomainFlag` is computed against a blocklist of common consumer email providers (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `live.com`, `icloud.com`, etc.).
   - The system **does not hard-block** flagged domains, since small MSMEs and informal employers legitimately operate from personal email addresses.
   - Instead, `contactDomainFlag = true` is stored and surfaced as a "lower confidence — personal email domain" advisory notice in the UI once resolved.
3. **Standalone Public Verification Portal**:
   - Verification links route to `/verify/:token`, handled by `EmployerVerificationPage.tsx`.
   - Root `src/App.tsx` branches on `window.location.pathname.startsWith('/verify/')`, rendering a clean, lightweight standalone page that bypasses the 3D scene, sidebar, and trainee GitHub OAuth requirements.
   - **Privacy-Preserving**: Only the trainee's first name, claimed employer, and course/scheme context are returned to the employer.
   - Employers can **Confirm** or **Deny** the claim. If denied, a required `reasonCode` (`SKILL_GAP`, `WAGE_MISMATCH`, `LOCATION`, `NO_SHOW`, `ROLE_MISMATCH`, `OTHER`) and optional notes are collected.
   - Requests are tokenized with 30-day expiration and cannot be re-resolved once completed.

### 11.2 Outcome Data Enrichment

To align directly with our problem statement's requirement to measure training relevance rather than just placement headcount:
- `roleRelevance` (`DIRECTLY_RELATED` | `SOMEWHAT_RELATED` | `UNRELATED`): Captured for all `EMPLOYED` and `SELF_EMPLOYED` trainees.
- `selfEmploymentType`: Free text capturing enterprise/trade nature (e.g. freelance development, local repair shop).
- `apprenticeshipEmployer`: Identifies training partners/NAPS employers.
- `nonPlacementReason` (`SKILL_GAP` | `WAGE_EXPECTATION` | `LOCATION` | `NO_RESPONSE_FROM_EMPLOYERS` | `OTHER`): Captured for `SEARCHING` candidates.  
  > **Analytics Note**: `nonPlacementReason` exists specifically to provide future relevance-scoring analytics with a second, broader-coverage data source beyond employer-reported denial reasons alone, ensuring candidates who never reach an `EMPLOYED` claim are still represented in gap analysis.

---

## 12. Government Registry Cross-Checks (e-Shram & UDYAM) — Corroboration Architecture (v0.3.2)

### 12.1 Purpose & Framing: Corroboration, Not Ground Truth
A critical challenge in tracking vocational trainees post-certification is candidate attrition: a substantial percentage of trainees stop responding to 90/180/365-day check-in notifications. 

To bridge this gap, Forge integrates cross-checks against national databases:
1. **e-Shram**: National database of unorganised/informal sector workers (Ministry of Labour & Employment).
2. **UDYAM**: National registration portal for Micro, Small, and Medium Enterprises (Ministry of MSME).

> [!IMPORTANT]
> **Corroboration vs. Verified Ground Truth**:
> - e-Shram is a **self-registration portal** for informal workers; having an e-Shram card indicates self-reported engagement in unorganised work, not an audited salary position.
> - UDYAM registers **enterprises and sole proprietorships**; it indicates entrepreneurial activity or business incorporation, not formal payroll employment.
> - Neither database constitutes definitive proof of placement. Instead, matching records serve as **corroboration signals** that boost confidence when a trainee cannot be reached, or support self-employment claims. They are never presented to administrators or judges as audited ground truth.

### 12.2 DPDP Act Compliance & Role-Based Access Control
- **Explicit DPDP Consent Required**: Government cross-checks are strictly gated by the `GOVT_CROSS_CHECK` scope under India's Digital Personal Data Protection (DPDP) Act. Before any check executes, `resolveCurrentConsent(traineeId, prisma)` checks whether the trainee actively granted consent. If consent is absent or revoked, the backend rejects the request with HTTP 403 (`consentRequired: 'GOVT_CROSS_CHECK'`).
- **Analyst Role Required**: Triggering registry cross-checks is restricted to admins with at least `ANALYST` role via `requireAdmin('ANALYST')`.
- **Complete Audit Trail**: Every execution records an immutable row in `AdminActionLog` with action `GOVT_CROSS_CHECK`, capturing the admin ID, trainee ID, and summary match flags.

### 12.3 Swappable Architecture & Deterministic Simulation
Following the design pattern established by `notificationService.js`:
- `server/services/govtVerificationService.js` defines an `activeProvider` pattern.
- The default `mockProvider` implements deterministic phone number hashing via SHA-256 (`crypto.createHash('sha256').update(phone + salt)`).
- **Match Rates**: Tuned to realistic demonstration distributions (~35% e-Shram match rate, ~25% UDYAM match rate).
- **Deterministic & Repeatable**: The exact same trainee phone number will always produce the identical match status and confidence score across multiple calls, ensuring zero non-deterministic surprises during live hackathon judging.
- **Privacy-Preserving Summaries**: The system stores high-level summaries (e.g. trade classification correspondence) without ingesting or storing sensitive raw government registry records.

### 12.4 Frontend UI & Visual Hierarchy
In `OutcomeStatusView.tsx`:
- Rendered in a dedicated **"Corroboration Signals (Beta)"** card section located below the main milestone timeline.
- Styled with subdued slate and teal badges with significantly lower visual prominence than confirmed employer verifications to preserve clear distinction between corroboration and proof.
- Accompanied by a permanent advisory disclaimer explaining that registry matches reflect self-registered activity.
- **Strictly Hidden**: The section is not rendered (zero DOM footprint, not an empty placeholder) if the trainee has not granted `GOVT_CROSS_CHECK` consent or if no cross-checks have been performed.

### 12.5 Hackathon Judge Q&A Guide
- **Q: "Are you calling live government APIs right now?"**  
  *A:* "No. e-Shram and UDYAM APIs require formal ministry-level departmental MoUs and API Setu / Jan Samarth gateway integration. Our architecture uses a swappable provider interface (`govtVerificationService.js`) matching our `notificationService.js` pattern. The current provider is a deterministic phone-hash simulator, but swapping in the production gateway requires changing only the `activeProvider` object without altering any route, controller, or UI code."
- **Q: "Does a match in e-Shram prove the trainee got a job?"**  
  *A:* "No, and that distinction is central to our design. e-Shram is a self-registered informal worker registry; matching an e-Shram record indicates economic activity and trade alignment in the unorganised sector, which corroborates employment for candidates who have stopped answering survey messages. We explicitly display this as a Corroboration Signal with lower visual weight, never as verified placement."

---

## 13. Course & Provider Relevance Scoring (Three-Signal Model) — v0.3.5

### 13.1 Purpose & Three-Signal Architecture
Traditional vocational training evaluation only counts gross placement headcounts, ignoring whether certified trainees acquired skills actually demanded by employers. Forge v3 synthesizes **three distinct, complementary signals** to evaluate the genuine labor-market relevance of each `(courseName, providerName)` pair:

1. **Signal 1: Employer Denial Reasons (`EmployerVerification.reasonCode`)**  
   Direct attestation from verified employers who interviewed/denied employment claims (`SKILL_GAP`, `WAGE_MISMATCH`, `LOCATION`, `NO_SHOW`, `ROLE_MISMATCH`, `OTHER`).
2. **Signal 2: Trainee Non-Placement Reasons (`OutcomeCheckIn.nonPlacementReason`)**  
   Self-reported explanations from certified candidates still actively searching for work (`SKILL_GAP`, `WAGE_EXPECTATION`, `LOCATION`, `NO_RESPONSE_FROM_EMPLOYERS`, `OTHER`). Captures candidates who never reached an employer claim.
3. **Signal 3: Aggregated Skill Gaps from Resume Forge (`SkillGapSnapshot.missingSkills`)**  
   Extracted during Phase 1 resume optimization sessions when verified trainees tailor their CVs against target job descriptions. Persisted asynchronously into `SkillGapSnapshot` (anonymous sessions are completely bypassed).

### 13.2 Separation of Confidence Levels
> [!IMPORTANT]
> **Data Integrity Principle**: Employer-reported and trainee-reported reasons carry fundamentally different confidence levels (audited employer attestation vs. self-reported subjective perception).  
> To prevent misleading policymakers or training partners, these two distributions are stored in separate columns (`employerReasonBreakdown` vs `traineeReasonBreakdown`) and are **never conflated into a single count**, ensuring full transparency during drill-down inspection.

### 13.3 Attribution & Scoring Methodology (`relevanceScoringService.js`)
- **Attribution**: Every verification, check-in, and skill-gap snapshot is attributed to a course and provider via the trainee's most recent `Enrolment` as of the record's timestamp (or most recent by `enrolmentDate` if ambiguous).
- **Top Missing Skills**: Ranks missing skills across all snapshots attributed to the course/provider by occurrence frequency, persisting the top 10 most frequent gaps.
- **Relevance Score**:
  - `totalClaims = confirmedCount + deniedCount`
  - When `totalClaims > 0`: `baseScore = confirmedCount / totalClaims`.
  - **SKILL_GAP Dominance Penalty**: If `SKILL_GAP` is uniquely the most frequent reason when combining employer and trainee breakdown counts, a `-0.1` penalty is applied (floored at `0.0`).
  - When `totalClaims === 0`: `relevanceScore = null` (representing **insufficient data**, never an artificial zero score).
- **Idempotent Upsert**: Safe to execute repeatedly on demand or via scheduled admin triggers.

### 13.4 Endpoints (`server/routes/analytics.js`)
All endpoints are secured via `requireAdmin('ANALYST')`:
- `POST /api/admin/compute-relevance-scores`: Triggers batch scoring calculation and logs action to `AdminActionLog`.
- `GET /api/analytics/course-relevance`: Returns all scorecards sorted ascending by `relevanceScore` (worst-first / most actionable for curriculum intervention), with unscored null-claims courses grouped at the end.
- `GET /api/analytics/course-relevance/:courseName/:providerName`: Returns full scorecard drill-down with parsed `employerReasonBreakdown`, `traineeReasonBreakdown`, and `topMissingSkills`.

---

## 14. Government & Provider Analytics Dashboard Aggregations (v0.3.6)

### 14.1 Core Analytical Principles & Gaps Resolved

Vocational training analytics frequently misrepresent outcomes by quoting raw placement percentages without context, confusing candidate origins with jobs, and locking training partners out of their own performance data. Forge v3 resolves three specific gaps:

1. **Mandatory Pairing of Placement Rate and Response Rate**:
   - Non-responding trainees are not a random sample; presenting placement rate alone overstates confidence. Trainees who find employment are significantly more motivated to respond than those who remain unemployed or in distress.
   - **Response Rate Definition**:
     $$\text{responseRate} = \frac{\text{trainees with non-pending check-in}}{\text{trainees due check-in}}$$
     where a trainee is considered **due for check-in** if they have at least one enrolment with $\text{enrolmentDate} \le \text{now} - 90\text{ days}$.
   - **Placement Rate Definition**:
     $$\text{placementRate} = \frac{\text{employed} + \text{self-employed}}{\text{trainees with reported status}}$$
     using strictly the **most recent** check-in per trainee to prevent duplicate counting.
   - **Rule**: Every single placement statistic in every overview, district entry, cohort, and provider summary is accompanied by `responseRate` alongside `placementRate`.

2. **Labor Migration Attribution (Home vs. Placement District)**:
   - Trainees frequently undergo training in their native district but migrate to industrial hubs for placement (e.g., Satara $\to$ Pune, Ranchi $\to$ Bengaluru).
   - Forge decouples candidate origin (`Trainee.district`) from workplace location (`OutcomeCheckIn.placementDistrict`).
   - `GET /api/analytics/by-district` produces two structurally separate, parallel breakdowns:
     - `homeDistrictBreakdown`: Grouped by `Trainee.district` (capturing source talent pools).
     - `placementDistrictBreakdown`: Grouped by `OutcomeCheckIn.placementDistrict` (capturing economic destination hubs), enriched with `topHomeDistricts` tracking trainee migration streams into that district.

3. **Secure, Token-Gated Provider Read-Only Views**:
   - Training providers need direct visibility into their placement outcomes, response rates, and course relevance scorecards without gaining access to government admin consoles or other providers' confidential metrics.
   - `ProviderAccessToken` stores crypto-random tokens (`pvt_<hex>`) with configurable expiration.
   - `GET /api/provider-view/:token` is a **public, unauthenticated** endpoint requiring no session cookies. It strictly isolates aggregate metrics and course scorecards to the authorized provider, with zero leakage of candidate PII (Aadhaar hash, phone, full name).

### 14.2 Query Filtering & Standardization
All aggregation endpoints support consistent query parameters:
- `?scheme=<string>`: Exact match filtering on `Enrolment.scheme` (e.g. `PMKVY 4.0`, `DDU-GKY`).
- `?from=<ISO-date>` / `?startDate=<ISO-date>`: Filters enrolments where `enrolmentDate >= from`.
- `?to=<ISO-date>` / `?endDate=<ISO-date>`: Filters enrolments where `enrolmentDate <= to`.

### 14.3 Longitudinal Wage Progression
`GET /api/analytics/wage-progression` assesses trainees who have recorded $\ge 2$ check-ins with reported wage bands:
- Standardized ordinals: `0-10k` (0) $\to$ `10-20k` (1) $\to$ `20k+` / `20-30k` (2) $\to$ `30k+` (3).
- Compares earliest recorded wage band ordinal against latest recorded wage band ordinal per eligible trainee.
- Computes `percentageMovedUp`, `percentageStayedSame`, `percentageMovedDown`, and enumerates discrete transitions (e.g., `10-20k -> 20k+`).

### 14.4 Endpoints Reference (`server/routes/analytics.js`)

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `GET` | `/api/analytics/overview` | `requireAdmin('ANALYST')` | High-level metrics: total trainees, enrolments, response rate, placement rate, status breakdown. |
| `GET` | `/api/analytics/by-district` | `requireAdmin('ANALYST')` | Parallel `homeDistrictBreakdown` and `placementDistrictBreakdown` with migration origin attribution. |
| `GET` | `/api/analytics/by-cohort` | `requireAdmin('ANALYST')` | Cohort-level performance breakdown with paired rates, scheme tags, and provider names. |
| `GET` | `/api/analytics/by-provider` | `requireAdmin('ANALYST')` | Provider-level aggregation joined with `CourseRelevanceScore` averages and course scorecards. |
| `GET` | `/api/analytics/wage-progression` | `requireAdmin('ANALYST')` | Tracks wage band movement over time for trainees with $\ge 2$ wage reports. |
| `POST` | `/api/admin/generate-provider-token` | `requireAdmin('ANALYST')` | Issues tokenized shareable link (`/api/provider-view/:token`) with audit log in `AdminActionLog`. |
| `GET` | `/api/provider-view/:token` | **Public (Token-Gated)** | Isolated provider scorecard and aggregate metrics view; zero candidate PII. |

### 14.5 Frontend Surfaces & Standalone Route Architecture (v0.3.7)

1. **Administrative Analytics Dashboard (`src/interface/admin/AnalyticsDashboard.tsx`)**:
   - **Access Control**: Gated via `useIsAdmin()`; renders Access Denied if caller lacks an admin role.
   - **Accessible Surfaces**: Reachable directly from the permanent left `Sidebar.tsx` ("Admin Console" section) when `isAdmin` is true.
   - **Visual Excellence & Charting (`recharts`)**:
     - **Overview Cards**: Features placement rate prominently paired directly with response rate inside the same card (e.g. `87.5% Placement Rate (based on 62.5% response rate)`).
     - **District Section**: Features interactive tab switching between **Home District** (`Trainee.district`) and **Placement District** (`OutcomeCheckIn.placementDistrict`), rendering dual Recharts bar charts showing placement rate and response rate per district, plus inbound migration origin streams (`topHomeDistricts`).
     - **Cohort Section**: Renders grouped bar charts of placement and response rates by training cohort.
     - **Provider Table**: Sortable by name, enrolled trainees, placement rate, response rate, and relevance score (default: worst-relevance-first for targeted intervention). Row expansion reveals `topMissingSkills` chips and separate cards for employer denial reasons vs. trainee searching reasons.
     - **Wage Progression**: Displays advancement percentage with transparent raw counts (`movedUp`, `stayedSame`, `movedDown`, `insufficientData`) and discrete transition tags.
     - **Shareable Link Generator**: Text input and validity selector calling `POST /api/admin/generate-provider-token` with one-click copy button and live preview.

2. **Standalone Public Portals Pattern (`src/App.tsx`)**:
   - Root `src/App.tsx` implements clean URL pathname prefix branching before mounting the main 3D application:
     - `/verify/:token` $\to$ `EmployerVerificationPage.tsx`: Standalone employer verification and denial portal.
     - `/provider/:token` $\to$ `ProviderViewPage.tsx`: Standalone training provider portal.
   - **Design & Privacy Integrity**: Both standalone routes bypass the 3D Three.js office simulation, left sidebar, and trainee GitHub OAuth login. `ProviderViewPage.tsx` strictly redacts all individual candidate PII (names, Aadhaar hashes, phone numbers) and locks data access exclusively to that provider's own aggregate statistics and course scorecards.
---

## 15. Impact Estimation — Synthetic Control Group Methodology (v0.3.8)

### 15.1 Framing & Honesty Commitments

> **This is not a randomized controlled trial. The comparison population is synthetic.**

Our pitch describes measuring impact against a "propensity-matched control group of similar candidates who didn't train." We have no access to real data on people who did not undergo vocational training — no such population exists in this project's database scope.

This task implements the **plumbing and methodology** of that idea using clearly-labeled **SYNTHETIC comparison data**, not a real causal study. Every API response, every UI label, and every documentation section in this version explicitly repeats this distinction.

- **Do not cite** `overallEstimatedUpliftPp` as a validated effect size in any external document, pitch, or report without replacing the synthetic control data with a real survey/census source first.
- **The disclaimer string** `"Estimated using stratified comparison against a synthetic illustrative control group, not a randomized controlled trial or real non-trainee population. Intended to demonstrate methodology, not to represent a validated causal effect."` is fixed, non-negotiable, included in every `GET /api/analytics/impact` response, and permanently rendered in the analytics dashboard — never collapsed or hidden.

### 15.2 Why Simplified Stratified Matching (Not PSM)

Full statistical propensity score matching (PSM) — logistic regression, nearest-neighbor matching, inverse probability weighting — is **intentionally NOT implemented** because:
1. Applying it to synthetic data would produce falsely precise confidence intervals that misrepresent the quality of the inputs.
2. PSM requires large matched samples with known covariate distributions from real populations.
3. The plumbing is the deliverable here: the bucket key, the rate computation, and the weighted average uplift are the same core operations whether the data is synthetic or real.

**Simplified stratified matching** is used instead:
- Group trainees and control records into strata by `(ageBand, district, priorQualification)`.
- Within each stratum, compute placement rate (EMPLOYED + SELF_EMPLOYED / total in group) for both populations.
- Compute stratum-level uplift = trainee rate − control rate.
- Compute overall weighted uplift = Σ(uplift × trainee count) / Σ(trainee count).
- Skip strata with fewer than 3 trainees or fewer than 3 control records.

### 15.3 Data Models

**`Trainee.priorQualification`** (nullable string, added v0.3.8):
- Optional field captured during onboarding (new select field in `TraineeProfileSetup.tsx`).
- Allowed values (enforced in app layer): `"Below 10th"` | `"10th Pass"` | `"12th Pass"` | `"Graduate"`.
- A trainee without `priorQualification` set is excluded from impact matching (still tracked for all other analytics).

**`ControlGroupRecord`** model:
- All seeded rows have `isSynthetic = true`.
- `ageBand` is stored as a string (`"18-25"`, `"26-35"`, `"36-45"`, `"46+"`) derived at seed time using the same `getAgeBand()` function that `computeImpact()` applies to trainee `dateOfBirth`. Both import from `impactMeasurementService.js` — one definition, zero drift.
- `isSynthetic = false` rows can be inserted via import without a schema change, enabling real comparison data to coexist with synthetic rows.

### 15.4 Files & Services

| File | Purpose |
|---|---|
| `server/services/impactMeasurementService.js` | Exports `getAgeBand(dob)` (shared with seed script) and `computeImpact()`. Contains the stratified matching algorithm and the fixed disclaimer string. |
| `server/scripts/seedControlGroup.js` | Generates synthetic ControlGroupRecord rows using `mulberry32` PRNG with fixed seed `0xDEADBEEF` (reproducible, deterministic). Exports `seedControlGroup(count, prisma)`. CLI: `node server/scripts/seedControlGroup.js [count] [--force]`. |

### 15.5 API Endpoints

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `POST` | `/api/admin/seed-control-group` | `requireAdmin('ANALYST')` | Seeds synthetic ControlGroupRecord rows. Body: `{ confirm: true, force?: true, count?: number }`. `confirm: true` is required to acknowledge the data is synthetic. 409 if rows exist without `force: true`. |
| `GET` | `/api/analytics/impact` | `requireAdmin('ANALYST')` | Returns impact estimate from `computeImpact()`. Always includes `disclaimer` field. Returns empty result (not error) if no eligible trainees or no control records. |

### 15.6 Frontend Surface

`src/interface/admin/AnalyticsDashboard.tsx` — Impact Estimation section (at the bottom of the dashboard):
- **Visual design**: Amber-50 background, amber-300 border — deliberately muted/tentative compared to surrounding white/blue analytics cards.
- **Disclaimer**: Rendered in a highlighted amber box at the top of the section. **Permanently visible. Never collapsible. Never hideable.**
- **Headline**: `"Estimated Uplift (Illustrative)"` — the weighted average uplift in percentage points.
- **Sample counts**: Eligible strata, skipped strata, trainee count in eligible strata, control record count — all displayed for transparency.
- **Methodology box**: Full methodology description text from the service.
- **Per-stratum table**: Collapsed by default, expandable via toggle. Shows all strata including skipped ones (at 50% opacity).
- **Empty state**: When no control records are seeded or no trainees have all three stratification signals, shows a helpful message with the required curl command.

### 15.7 What Would Be Needed to Use Real Data

The schema and service are designed so that switching from synthetic to real comparison data requires **no code changes** — only a data change:
1. Obtain real non-trainee population data (e.g., PLFS/NSSO micro-data filtered to comparable demographics and districts).
2. Import rows with `isSynthetic = false` into `ControlGroupRecord`.
3. Optionally filter `computeImpact()` to exclude synthetic rows by adding a `where: { isSynthetic: false }` clause.
4. Remove the synthetic seed rows or keep them flagged for comparison.

The `getAgeBand()` function, stratification keys, rate computation, and weighted average all remain identical.

