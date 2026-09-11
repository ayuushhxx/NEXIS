# Frontend Guide

## Overview

The Forge v3 frontend is a React 19 + TypeScript application built with Vite and TailwindCSS v4. It delivers a 3D agent simulation workspace rendered with Three.js alongside a suite of career orchestration and vocational tracking views.

---

## Layout Architecture

The application uses a full-height fixed viewport layout anchored by a permanent left `Sidebar.tsx`:

```
┌──────┬────────────────────────────────────────────────────────┐
│      │ PhaseOneControlPanel (Resume upload & target JD input) │
│      ├────────────────────────────────────────────────────────┤
│      │                                                        │
│ Side │ SimulationView (3D Three.js WebGL Canvas)              │
│ bar  │                                                        │
│      │ Active View Overlay (Skill Gaps, Jobs, Outcome, etc.)  │
│ (8   │                                                        │
│ Views│                                                        │
│ +    ├────────────────────────────────────────────────────────┤
│ Admin│ KanbanPanel (Resizable bottom application pipeline)    │
│ +    │                                                        │
│ Tools│                                                        │
└──────┴────────────────────────────────────────────────────────┘
```

---

## Navigation & Views (`src/interface/`)

### 1. Permanent Left Navigation (`Sidebar.tsx`)
Hosts all primary navigation, active state badges, administrative console triggers, and bottom utility toolbar:
- **Dashboard**: Default 3D simulation canvas with active agent avatars.
- **Skill Gaps Matrix** (`SkillGapsView.tsx`): ATS match score breakdown and missing keyword analysis.
- **Job Matches** (`JobMatchesView.tsx`): Blue ocean opportunities with match rationale and direct application links.
- **Recommended Programs** (`RecommendedProgramsView.tsx`): Context-aware upskilling roadmaps.
- **Interview Prep** (`InterviewPrepView.tsx`): Mock technical/behavioral simulator with real-time pressure scoring.
- **New CV** (`NewCVView.tsx`): Tailored resume preview with client-side & server-side PDF export.
- **My Outcome** (`OutcomeStatusView.tsx`): Post-certification longitudinal employment tracking, employer verification status, and registry corroboration signals.
- **LinkedIn Integration** (`LinkedInIntegrationView.tsx`): LinkedIn OIDC candidate verification and inline PDF profile parsing.

### 2. Admin Surfaces (RBAC-Gated)
- **Government Analytics Dashboard** (`interface/admin/AnalyticsDashboard.tsx`):
  - Recharts visualizations for paired placement and response rates.
  - Labor migration attribution (Home District vs. Placement District).
  - Sortable course relevance scorecards with top missing skills chips.
  - Longitudinal wage band progression tracking.
  - Shareable token generator (`POST /api/admin/generate-provider-token`).
  - Illustrative impact uplift estimation against synthetic control groups.
- **Deduplication Review Panel** (`interface/admin/DedupReviewPanel.tsx`):
  - Side-by-side comparison of duplicate candidate profiles.
  - Jaro-Winkler match score and signal breakdown.
  - OTP-gated atomic merge execution.

### 3. Standalone Public Portals (Prefix-Based Routing in `src/App.tsx`)
- **Employer Verification Portal** (`/verify/:token` → `EmployerVerificationPage.tsx`):
  - Lightweight public page for corporate HR to confirm or deny placement claims.
  - Bypasses 3D scene, sidebar, and platform login.
- **Provider Analytics Portal** (`/provider/:token` → `ProviderViewPage.tsx`):
  - Isolated read-only metrics and course scorecards for training partners.
  - Strict candidate PII redaction.

### 4. DPDP Onboarding Overlay (`src/interface/onboarding/`)
- **`ConsentScreen.tsx`**:
  - Non-blocking multi-scope consent dialog (`JOB_SEARCH_DATA`, `EMPLOYER_SHARING`, `ANALYTICS`, `GOVT_CROSS_CHECK`).
  - Top-right close button (`X`), backdrop dismissal, and "Skip for now" demo mode.
  - Inline "Continue Anyway" recovery action in error state.
- **`TraineeProfileSetup.tsx`**:
  - OTP-gated vocational profile builder capturing trade scheme and prior qualification.

---

## State Management Architecture

State is managed via three specialized Zustand stores (`src/integration/store/`):

| Store | Purpose |
|---|---|
| **`coreStore.ts`** | Resume text, parsed analysis, ATS score, job discovery results, interview sessions, active trainee profile, and check-in history. |
| **`teamStore.ts`** | Multi-agent network topologies, node connections, custom team architectures, and execution mode (Autonomous vs. HITL). |
| **`uiStore.ts`** | Active sidebar navigation tab (`activeSidebarTab`), selected agent inspector state, modal open/close flags, and BYOK API keys. |

---

## 3D Simulation Engine (`src/simulation/`)

- **`SceneManager.ts`**: Three.js scene lifecycle, perspective camera, ambient/directional lights, and render loop.
- **`CharacterManager.ts`**: 3D agent avatars with skeletal animation state machines (idle, walking, typing).
- **`NavMeshManager.ts`**: Navigation grid using `three-pathfinding` for collision-free agent locomotion.
- **`DriverManager.ts`**: Agent behavior drivers routing specialists between workstations based on pipeline stage.
