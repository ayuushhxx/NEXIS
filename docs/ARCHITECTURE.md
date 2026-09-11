# Architecture

## High-Level Overview

Forge v3 is a **dual-process** career orchestration platform:

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React 19 Frontend (Vite, port 3000)                  │  │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐   │  │
│  │  │ Three.js │  │  Zustand  │  │    React Flow      │   │  │
│  │  │   3D     │  │  Stores   │  │  (Team Designer)   │   │  │
│  │  │  Scene   │  │ (3 stores)│  │                    │   │  │
│  │  └─────────┘  └──────────┘  └────────────────────┘   │  │
│  └───────────────────┬───────────────────────────────────┘  │
│                      │ fetch /api/*                          │
│                      ▼                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Express Backend (Node.js, port 8787)                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │  Routes   │  │ Services │  │  Prisma ORM v5   │    │  │
│  │  │ (16 files)│→ │(12 files)│  │ (SQLite / Postgres)  │
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

## Data Flow

### 1. Resume Optimization Flow
1. User uploads PDF → `POST /api/resume/extract` → text extraction via `pdf-parse`
2. User pastes JD → `POST /api/resume/tailor` → Sarvam AI single-pass optimization
3. AI returns strategist analysis + structured resume JSON
4. Frontend renders analysis (ATS score, skill gaps, interview readiness)
5. User requests PDF → `POST /api/resume/render-pdf` → PDFKit generates A4 PDF

### 2. Autonomous Job Discovery Flow (`Nexus-Hunter`)
1. User triggers Nexus-Hunter → `POST /api/jobs/discover`
2. Multi-mode execution:
   - **Mode 1 (`gemini-serper`)**: Queries Serper.dev with precision queries and filters through Gemini for alignment scoring.
   - **Mode 2 (`gemini-autonomous`)**: When `SERPER_API_KEY` is omitted or returns 0 results, Google Gemini autonomously generates 3 hyper-realistic, role-tailored opportunities.
   - **Mode 3 (`adaptive-fallback`)**: Dynamic, trade-aligned search heuristics matching candidate vocational profile.
3. Blue Ocean scoring applied (favors direct career pages over aggregators).
4. Top prime targets returned to frontend with match rationale and direct application links.

### 3. Interview Simulation Flow (`Nexus-Mirror`)
1. `POST /api/interview/generate` → Sarvam generates role-specific Q&A pairs
2. User answers questions in interactive simulator
3. `POST /api/interview/cross-question` → recursive cross-questioning with real-time pressure scoring
4. Heuristic fallback engine activates if API quota or connectivity is exhausted

### 4. Verification & Outcome Tracking Flow
1. Trainee self-reports status → `POST /api/trainee/status-update`
2. Trainee requests employer verification → `POST /api/trainee/request-employer-verification` (gated by DPDP `EMPLOYER_SHARING` consent)
3. Employer opens standalone token link (`/verify/:token`) → Confirms or Denies with structured reason code
4. Scheduled triggers (`POST /api/admin/trigger-checkins`) track 90/180/365-day longitudinal employment milestones

## Frontend Architecture

### State Management (3 Zustand Stores)

| Store | File | Purpose |
|-------|------|---------|
| `coreStore` | `src/integration/store/coreStore.ts` | Project state, tasks, logs, career data, resume analysis, trainee profile & outcomes |
| `teamStore` | `src/integration/store/teamStore.ts` | Agent team configurations, custom topologies, HITL modes |
| `uiStore` | `src/integration/store/uiStore.ts` | Active sidebar view, modal visibility, selected agent, BYOK keys |

### 3D Simulation Engine

The simulation layer (`src/simulation/`) manages:
- **SceneManager** — Three.js scene lifecycle, camera, renderer
- **CharacterManager** — 3D character avatars with animation state machines
- **NavMeshManager** — Three-pathfinding navigation grid
- **DriverManager** — Per-agent behavior drivers (NPC AI vs Player input)

### Component Hierarchy

```
App
├── Standalone Routes:
│   ├── /verify/:token → EmployerVerificationPage (Lightweight public portal)
│   └── /provider/:token → ProviderViewPage (PII-redacted provider metrics)
│
└── Main Workspace:
    ├── Sidebar (Permanent left navigation: 8 views + admin + utilities)
    ├── PhaseOneControlPanel (Resume upload & target JD input)
    ├── SimulationView (3D Three.js WebGL canvas)
    ├── KanbanPanel (Resizable bottom application pipeline)
    ├── Active View Container:
    │   ├── SkillGapsView
    │   ├── JobMatchesView
    │   ├── RecommendedProgramsView
    │   ├── InterviewPrepView
    │   ├── NewCVView
    │   ├── OutcomeStatusView
    │   └── LinkedInIntegrationView
    ├── Admin Views (RBAC-gated):
    │   ├── AnalyticsDashboard (Recharts governance console)
    │   └── DedupReviewPanel (Fuzzy duplicate identity review)
    ├── AgentDetailDrawer (Slide-in inspector)
    ├── DPDP Onboarding Overlay:
    │   ├── ConsentScreen (Non-blocking multi-scope consent dialog)
    │   └── TraineeProfileSetup (OTP-gated vocational record modal)
    └── VisualConfigurator (React Flow team designer modal)
```

## Backend Architecture

### Service Layer (12 Core Services)

| Service | Purpose |
|---------|---------|
| `gemini.js` | Gemini API client with model failover chain & autonomous synthesis |
| `sarvam.js` | Sarvam API client with retry + Gemini failover |
| `serper.js` | Serper.dev precision job search client |
| `pdfGenerator.js` | PDFKit-based A4 resume builder |
| `interviewEngine.js` | Cross-questioning heuristics & pressure scoring |
| `matchingService.js` | Jaro-Winkler trainee similarity scoring & DedupCandidate creation |
| `mergeService.js` | Atomic Prisma `$transaction` profile merge |
| `otpService.js` | Dual-mode OTP generation (dev console log / production MSG91 SMS) |
| `notificationService.js` | Provider-agnostic check-in messaging stub |
| `govtVerificationService.js` | Swappable e-Shram & UDYAM registry checks |
| `relevanceScoringService.js` | 3-signal course and provider relevance scoring engine |
| `impactMeasurementService.js` | Stratified propensity matching engine for impact uplift estimation |

### Data Persistence Layer

- **Prisma ORM v5**
- **Default (Dev)**: SQLite (`file:./dev.db`) — zero external database dependencies for local development.
- **Production**: PostgreSQL (Neon, Supabase, AWS RDS, self-hosted) configured via `DATABASE_URL`.
- **RBAC**: Super admin auto-seeding of `dev_trainee` on boot ensuring immediate zero-latency local development access.
