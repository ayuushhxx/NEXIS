import type * as THREE from 'three/webgpu';

import { LLMConfig } from './core/llm/types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  timestamp: string;
}

// ── Store state (pure data + simple setters) ─────────────────
export type AgentState = 'idle' | 'moving' | 'working' | 'on_hold' | 'talking';

export type ActiveSidebarTab =
  | 'dashboard'
  | 'skill-gaps'
  | 'job-matches'
  | 'recommended-programs'
  | 'interview-prep'
  | 'new-cv'
  | 'my-outcome'
  | 'linkedin-integration';

export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  url: string;
  alignmentScore: number;
  blueOceanScore: number;
  nexusMatchReason: string;
  competitionLevel: 'Low' | 'Medium' | 'High';
  discoveredAt: number;
  source: 'linkedin' | 'company-careers' | 'hidden';
}

export interface RecommendedProgram {
  title: string;
  provider: string;
  isFree: boolean;
  url: string;
}

export interface CandidateSkill {
  skill: string;
  demonstrated: boolean;
}

export interface SkillProfile {
  jd_role_title: string;
  jd_seniority: string;
  jd_required_skills: string[];
  jd_nice_to_have_skills: string[];
  candidate_skills: CandidateSkill[];
  candidate_experience_summary: {
    level: string;
    years: number;
    domains: string[];
  };
  match_pct: number | null;
  matched_required: string[];
}

export interface CharacterState {
  isThinking: boolean;
  instanceCount: number;
  selectedNpcIndex: number | null;
  selectedPosition: { x: number; y: number } | null;
  hoveredNpcIndex: number | null;
  hoveredPoiId: string | null;
  hoveredPoiLabel: string | null;
  hoverPosition: { x: number; y: number } | null;
  npcScreenPositions: Record<number, { x: number; y: number }>;
  isChatting: boolean;
  isTyping: boolean;
  chatMessages: ChatMessage[];
  inspectorTab: 'info' | 'chat';
  activeSidebarTab: ActiveSidebarTab;
  setActiveSidebarTab: (tab: ActiveSidebarTab) => void;

  skillProfile: SkillProfile | null;
  setSkillProfile: (profile: SkillProfile | null) => void;

  jobMatchesCurrent: DiscoveredJob[];
  jobMatchesReachable: DiscoveredJob[];
  setJobMatches: (mode: 'current' | 'reachable', jobs: DiscoveredJob[]) => void;

  recommendedPrograms: Record<string, RecommendedProgram[]>;
  setRecommendedPrograms: (programs: Record<string, RecommendedProgram[]>) => void;

  // Real-time agent statuses for 3D synchronization
  agentStatuses: Record<number, AgentState>;
  setAgentStatus: (index: number, status: AgentState) => void;

  isBYOKOpen: boolean;
  byokError: string | null;
  setBYOKOpen: (open: boolean, error?: string | null) => void;

  isDedupReviewOpen: boolean;
  setDedupReviewOpen: (open: boolean) => void;

  isAnalyticsDashboardOpen: boolean;
  setAnalyticsDashboardOpen: (open: boolean) => void;

  activeAuditTaskId: string | null;
  setActiveAuditTaskId: (taskId: string | null) => void;

  // BYOK LLM Configuration
  llmConfig: LLMConfig;

  setThinking: (isThinking: boolean) => void;
  setIsTyping: (isTyping: boolean) => void;
  setInspectorTab: (tab: 'info' | 'chat') => void;
  setInstanceCount: (count: number) => void;
  setSelectedNpc: (index: number | null) => void;
  setSelectedPosition: (pos: { x: number; y: number } | null) => void;
  setHoveredNpc: (index: number | null, pos: { x: number; y: number } | null) => void;
  setHoveredPoi: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => void;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setChatting: (isChatting: boolean) => void;
}

export enum AnimationName {
  IDLE = 'Idle',
  WALK = 'Walk',
  TALK = 'Talk',
  LISTEN = 'Listen',
  SIT_DOWN = 'Sit',      // one-shot sit-down entry animation
  SIT_IDLE = 'Sit_Idle', // loop: seated idle
  SIT_WORK = 'Sit_Work', // loop: seated working
  LOOK_AROUND = 'LookAround',
  HAPPY = 'Happy',
  SAD = 'Sad',
  PICK = 'Pick',
  WAVE = 'Wave'
}

/** Stored as a float in the GPU agent buffer (.w component). */
export enum AgentBehavior {
  IDLE   = 0, // position locked, velocity zero, facing follows waypoint field (if non-zero)
  GOTO   = 1, // moves toward target waypoint (.x/.z of agent buffer)
  SEATED = 2, // position locked, velocity zero — character is seated, treated like IDLE on GPU
}

// ── Character State Machine ───────────────────────────────────

/**
 * High-level character state keys understood by the state machine.
 * Each maps declaratively to an animation + optional expression.
 */
export type CharacterStateKey =
  | 'idle'
  | 'walk'
  | 'talk'
  | 'listen'
  | 'sit_down'   // one-shot entry animation; auto-transitions to sit_idle
  | 'sit_idle'   // looping: seated at rest
  | 'sit_work'   // looping: seated working
  | 'look_around'
  | 'happy'
  | 'happy_loop' // looping version of happy, no auto-transition
  | 'sad'
  | 'pick'
  | 'wave'
  | 'wave_loop'; // looping version of wave, no auto-transition

/**
 * Declarative definition of a character state.
 * Adding a new state = adding one entry to STATE_MAP, no logic changes required.
 */
export interface CharacterStateDef {
  /** GPU animation to play. */
  animation: AnimationName;
  /** Facial expression to set when entering this state. Undefined = keep current. */
  expression?: ExpressionKey;
  /** True = animation loops forever. False = plays once then auto-transitions. */
  loop: boolean;
  /** Override the clip duration (seconds). Only used when loop=false. */
  durationOverride?: number;
  /** State to enter automatically after a non-looping animation finishes. */
  nextState?: CharacterStateKey;
  /**
   * Whether external callers can interrupt this state with a new one.
   * Non-interruptible states (e.g. 'sit_down' entry) must finish before new commands apply.
   */
  interruptible: boolean;
}

// ── POI System ────────────────────────────────────────────────

export interface PoiDef {
  id: string;
  /** World-space position to walk toward. */
  position: THREE.Vector3;
  /** World-space quaternion for orientation. */
  quaternion: THREE.Quaternion;
  /** State to enter upon arrival. */
  arrivalState: CharacterStateKey;
  /** Agent index currently occupying this POI, or null if free. */
  occupiedBy: number | null;
  /** Optional label to show on hover (e.g. "Sit down"). */
  label?: string;
}

// ── Driver interfaces ─────────────────────────────────────────

/**
 * Low-level rendering/GPU interface that behavior drivers call.
 * Decouples BehaviorManager and StateMachine from concrete CharacterManager.
 */
export interface ICharacterDriver {
  setPhysicsMode(index: number, mode: AgentBehavior): void;
  setAnimation(index: number, name: AnimationName, loop?: boolean): void;
  setExpression(index: number, key: ExpressionKey): void;
  setSpeaking(index: number, isSpeaking: boolean): void;
  getAgentState(index: number): AgentBehavior;
  getAnimationDuration(name: AnimationName): number;
  getCPUPositions(): Float32Array | null;
}

/**
 * High-level interface for per-agent behavior drivers
 * (PlayerInputDriver, NpcAgentDriver, etc.)
 */
export interface IAgentDriver {
  readonly agentIndex: number;
  update(positions: Float32Array, delta: number): void;
  dispose(): void;
}

// ── Misc ─────────────────────────────────────────────────────

export type ExpressionKey = 'idle' | 'listening' | 'neutral' | 'surprised' | 'happy' | 'sick' | 'wink' | 'doubtful' | 'sad';

export interface AtlasCoords {
  col: number;
  row: number;
}

export interface ExpressionConfig {
  eyes: AtlasCoords;
  mouth: AtlasCoords;
}

// ── Trainee Identity, Consent & Outcomes ─────────────────────

export type ConsentScope = 'JOB_SEARCH_DATA' | 'EMPLOYER_SHARING' | 'ANALYTICS' | 'GOVT_CROSS_CHECK';

export interface ConsentItem {
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  version: string;
}

export type ConsentStateMap = Record<string, ConsentItem>;

export interface TraineeRecord {
  id: string;
  phoneNumber: string;
  name: string;
  preferredLanguage: string;
  githubId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrolmentRecord {
  id: string;
  traineeId: string;
  scheme: string;
  courseName: string;
  providerName: string;
  cohortName: string;
  enrolmentDate: string;
  certificationDate: string | null;
  createdAt: string;
}

export interface TraineeProfileData {
  trainee: TraineeRecord;
  enrolments: EnrolmentRecord[];
  consent?: ConsentStateMap;
}

export interface EmployerVerificationRecord {
  id: string;
  outcomeCheckInId: string;
  traineeId: string;
  employerNameClaimed: string;
  employerContactEmail: string;
  contactDomainFlag: boolean;
  verificationToken: string;
  tokenExpiresAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'DENIED' | string;
  reasonCode: 'SKILL_GAP' | 'WAGE_MISMATCH' | 'LOCATION' | 'NO_SHOW' | 'ROLE_MISMATCH' | 'OTHER' | string | null;
  reasonNotes: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface OutcomeCheckInRecord {
  id: string;
  traineeId: string;
  checkinType: 'SELF_INITIATED' | '90_DAY' | '180_DAY' | '365_DAY' | string;
  status: 'PENDING' | 'COMPLETED' | 'NO_RESPONSE' | string;
  employmentStatus: 'EMPLOYED' | 'SELF_EMPLOYED' | 'SEARCHING' | 'IN_TRAINING' | 'OTHER' | null;
  employerName: string | null;
  wageBand: string | null;
  notes: string | null;
  scheduledFor: string | null;
  respondedAt: string | null;
  createdAt: string;
  roleRelevance?: 'DIRECTLY_RELATED' | 'SOMEWHAT_RELATED' | 'UNRELATED' | string | null;
  selfEmploymentType?: string | null;
  apprenticeshipEmployer?: string | null;
  nonPlacementReason?: 'SKILL_GAP' | 'WAGE_EXPECTATION' | 'LOCATION' | 'NO_RESPONSE_FROM_EMPLOYERS' | 'OTHER' | string | null;
  placementDistrict?: string | null;
  employerVerification?: EmployerVerificationRecord | null;
}

export interface GovtCrossCheckRecord {
  id: string;
  traineeId: string;
  source: 'ESHRAM' | 'UDYAM' | string;
  matchFound: boolean;
  matchConfidence: number | null;
  matchedRecordSummary: string | null;
  checkedAt: string;
}


