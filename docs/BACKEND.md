# Backend API Reference

Base URL: `http://localhost:8787/api`

## Overview

The Forge v3 backend is built with Express.js 5.x and Prisma ORM v5, exposing 16 specialized route modules backed by 12 core services.

---

## Route Modules & Endpoints

### 1. Health

#### `GET /api/health`
Checks backend and service connectivity.
**Response:** `{ "ok": true }`

---

### 2. Resume Forge

#### `POST /api/resume/extract`
Upload candidate PDF resume for raw text parsing via `pdf-parse`.
- **Content-Type**: `multipart/form-data`
- **Body**: `resumePdf` (File)
- **Response**: `{ "fileName": "resume.pdf", "pages": 2, "text": "..." }`

#### `POST /api/resume/tailor`
Optimizes resume against target JD using Sarvam / Gemini.
- **Body**: `{ "resume": "...", "jd": "...", "keys": { ... } }`
- **Response**: `{ "tailoredResume": "...", "structuredResume": { ... }, "analysis": { "atsCompatibility": 85, "skillGaps": [...] } }`

#### `POST /api/resume/render-pdf`
Generates printable A4 PDF from structured resume data using PDFKit.
- **Response**: Binary stream (`application/pdf`)

---

### 3. Nexus-Hunter (Autonomous Job Discovery)

#### `POST /api/jobs/discover`
Searches or autonomously synthesizes high-fit vocational and tech career opportunities.
- **Body**:
  ```json
  {
    "resume": "Candidate resume text...",
    "targetRole": "Electrician / AI Engineer",
    "key": "optional-gemini-key",
    "serperKey": "optional-serper-key"
  }
  ```
- **Execution Modes**:
  - `gemini-serper`: Live Google search via Serper.dev with Gemini alignment scoring.
  - `gemini-autonomous`: Autonomous opportunity synthesis by Google Gemini tailored to actual role/resume when Serper key is missing or results are empty.
  - `adaptive-fallback`: Dynamic vocational search fallbacks tailored to the role.
- **Response**:
  ```json
  {
    "items": [
      {
        "job_title": "...",
        "company_name": "...",
        "application_link": "https://...",
        "nexus_match_reason": "...",
        "alignment_score": 92,
        "blue_ocean_score": 88,
        "source": "company-careers",
        "competition_level": "Low"
      }
    ],
    "mode": "gemini-autonomous"
  }
  ```

---

### 4. Nexus-Mirror (Interview Simulator)

#### `POST /api/interview/generate`
Generates role-specific technical and behavioral questions.
- **Body**: `{ "resume": "...", "jd": "...", "key": "..." }`
- **Response**: `{ "items": [{ "id": "...", "question": "...", "category": "technical" }] }`

#### `POST /api/interview/cross-question`
Interactive recursive cross-questioning with real-time pressure scoring.
- **Body**: `{ "question": "...", "answer": "...", "category": "technical" }`
- **Response**: `{ "phaseA": { ... }, "phaseB": { "followUpQuestion": "..." }, "pressureDelta": 7 }`

---

### 5. Mobile OTP Authentication

#### `POST /api/otp/send`
Generates and dispatches a 6-digit OTP to a mobile number.
- **Body**: `{ "phoneNumber": "+919876543210" }`
- **Dev Mode**: Prints code to backend console (`[OTP Service] Code: XXXXXX`).
- **Prod Mode**: Dispatches via MSG91 SMS gateway using TRAI DLT template.
- **Response**: `{ "ok": true, "message": "OTP sent successfully" }`

#### `POST /api/otp/verify`
Verifies submitted OTP code and returns signed verification token.
- **Body**: `{ "phoneNumber": "+919876543210", "otp": "123456" }`
- **Response**: `{ "ok": true, "verificationToken": "..." }`

---

### 6. Trainee Profile & Schemes

#### `POST /api/trainee/profile`
Creates or updates a durable Trainee record and appends a vocational Enrolment.
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "name": "...", "phoneNumber": "...", "preferredLanguage": "en", "enrolment": { "scheme": "PMKVY 4.0", "courseName": "...", "providerName": "..." } }`

#### `GET /api/trainee/profile`
Returns caller's Trainee profile with all Enrolments and resolved consent state.
- **Headers**: `Authorization: Bearer <token>`

---

### 7. DPDP Consent Architecture

#### `POST /api/consent`
Appends a new consent grant or revocation event to the immutable audit log.
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "scope": "JOB_SEARCH_DATA" | "EMPLOYER_SHARING" | "ANALYTICS" | "GOVT_CROSS_CHECK", "granted": true, "version": "1.0" }`

#### `GET /api/consent`
Retrieves the caller's current resolved consent state across all 4 scopes.

#### `GET /api/consent/:traineeId`
Public lookup of resolved consent state for a given trainee ID.

---

### 8. LinkedIn Integration & Identity

#### `GET /api/linkedin/auth`
Initiates LinkedIn OIDC authorization flow.

#### `GET /api/linkedin/callback`
Exchanges authorization code for access token and redirects to client.

#### `POST /api/linkedin/extract-pdf`
Extracts work history and generates STAR-method bullet points directly from uploaded LinkedIn profile PDF.
- **Content-Type**: `multipart/form-data`
- **Body**: `profilePdf` (File)

---

### 9. Outcomes Tracking & Verification

#### `POST /api/trainee/status-update`
Self-reports employment milestone (`EMPLOYED`, `SELF_EMPLOYED`, `SEARCHING`) with training relevance and wage band.
- **Headers**: `Authorization: Bearer <token>`

#### `POST /api/trainee/request-employer-verification`
Triggers verification request email to employer. Gated by `EMPLOYER_SHARING` consent.
- **Headers**: `Authorization: Bearer <token>`

#### `GET /api/verify/:token`
Public privacy-preserving verification metadata lookup (trainee first name and scheme only).

#### `POST /api/verify/:token`
Public employer confirmation or denial with structured reason code (`SKILL_GAP`, `WAGE_MISMATCH`, etc.).

---

### 10. Government Registry Cross-Checks

#### `POST /api/admin/trigger-govt-crosscheck`
Triggers simulated e-Shram and UDYAM registry checks. Gated by `GOVT_CROSS_CHECK` consent and `ANALYST` role.
- **Headers**: `Authorization: Bearer <admin_token>`

#### `GET /api/trainee/govt-crosscheck-history/:traineeId`
Retrieves immutable registry cross-check history.

---

### 11. Government & Provider Analytics

All admin endpoints require `ANALYST` role or higher.

| Endpoint | Method | Description |
|---|---|---|
| `/api/analytics/overview` | `GET` | Headline metrics with mandatory paired placement and response rates |
| `/api/analytics/by-district` | `GET` | Home vs. placement district labor migration tracking |
| `/api/analytics/by-cohort` | `GET` | Cohort-level performance breakdown |
| `/api/analytics/by-provider` | `GET` | Provider-level outcomes and course relevance averages |
| `/api/analytics/wage-progression` | `GET` | Longitudinal wage band movement |
| `/api/analytics/course-relevance` | `GET` | 3-signal course relevance scorecards (worst-first) |
| `/api/admin/compute-relevance-scores` | `POST` | Triggers batch relevance recalculation |
| `/api/admin/generate-provider-token` | `POST` | Issues tokenized provider link (`/provider/:token`) |
| `/api/provider-view/:token` | `GET` | Public token-gated provider scorecard (zero trainee PII) |
| `/api/analytics/impact` | `GET` | Stratified propensity matching placement uplift estimation |
| `/api/admin/seed-control-group` | `POST` | Seeds synthetic comparison population data |

---

### 12. Candidate Deduplication & RBAC

#### `GET /api/admin/whoami`
Resolves caller's token to AdminUser role (`SUPER_ADMIN`, `REVIEWER`, `ANALYST`).

#### `POST /api/admin/run-dedup-scan`
Runs Jaro-Winkler similarity matching scan across trainees.

#### `GET /api/admin/dedup-candidates`
Returns pending duplicate candidate pairs for human review.

#### `POST /api/admin/dedup-candidates/:id/resolve`
Resolves candidate pair with atomic Prisma merge (`action: "MERGE"`) or rejection (`action: "REJECT"`).
