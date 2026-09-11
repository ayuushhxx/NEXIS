import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, Sparkles, Briefcase, GraduationCap, ChevronRight, Target } from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import EmptySectionView from './EmptySectionView';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';
import { CandidateSkill } from '../types';

// ─── Match Ring ──────────────────────────────────────────────────────────────
function MatchRing({ pct }: { pct: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? '#22c55e' : pct >= 50 ? USER_COLOR : '#f59e0b';
  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width={120} height={120} viewBox="0 0 120 120" className="-rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
        <circle
          cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={String(dash) + ' ' + String(circ - dash)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-zinc-900 leading-none">{pct}%</span>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Match</span>
      </div>
    </div>
  );
}

// ─── Skill Pill ──────────────────────────────────────────────────────────────
type PillVariant = 'matched' | 'gap-required' | 'gap-nice' | 'demonstrated' | 'listed';
interface PillStyle { bg: string; text: string; icon: React.ReactNode; border: string }

function SkillPill({ skill, variant }: { skill: string; variant: PillVariant }) {
  const styles: Record<PillVariant, PillStyle> = {
    matched: {
      bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0',
      icon: <CheckCircle2 size={12} strokeWidth={2.5} style={{ color: '#22c55e' }} />,
    },
    'gap-required': {
      bg: '#fff7ed', text: '#c2410c', border: '#fed7aa',
      icon: <XCircle size={12} strokeWidth={2.5} style={{ color: '#f97316' }} />,
    },
    'gap-nice': {
      bg: '#fefce8', text: '#92400e', border: '#fde68a',
      icon: <AlertCircle size={12} strokeWidth={2.5} style={{ color: '#f59e0b' }} />,
    },
    demonstrated: {
      bg: USER_COLOR_LIGHT, text: '#1e40af', border: USER_COLOR_SOFT,
      icon: <Sparkles size={12} strokeWidth={2.5} style={{ color: USER_COLOR }} />,
    },
    listed: {
      bg: '#f8fafc', text: '#64748b', border: '#e2e8f0',
      icon: <ChevronRight size={12} strokeWidth={2.5} style={{ color: '#94a3b8' }} />,
    },
  };
  const s = styles[variant];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold select-none"
      style={{ background: s.bg, color: s.text, border: '1px solid ' + s.border }}
    >
      {s.icon}{skill}
    </span>
  );
}

// ─── Card shell ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5">
      <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-3">{title}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
      <span className="text-[11px] font-black text-zinc-700">{value}</span>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export const SkillGapsView: React.FC = () => {
  const { skillProfile } = useUiStore();
  if (!skillProfile) return <EmptySectionView tab="skill-gaps" />;

  const {
    jd_role_title, jd_seniority,
    jd_required_skills, jd_nice_to_have_skills,
    candidate_skills, candidate_experience_summary,
    match_pct, matched_required,
  } = skillProfile;

  const candidateNames = new Set(candidate_skills.map((s: CandidateSkill) => s.skill.toLowerCase()));
  const requiredGaps  = jd_required_skills.filter((s) => !candidateNames.has(s.toLowerCase()));
  const niceGaps      = jd_nice_to_have_skills.filter((s) => !candidateNames.has(s.toLowerCase()));
  const demonstrated  = candidate_skills.filter((s: CandidateSkill) => s.demonstrated);
  const listedOnly    = candidate_skills.filter((s: CandidateSkill) => !s.demonstrated);
  const pct           = match_pct ?? 0;
  const matchLabel    = pct >= 75 ? 'Strong Match' : pct >= 50 ? 'Partial Match' : 'Needs Work';
  const matchColor    = pct >= 75 ? '#15803d' : pct >= 50 ? '#1e40af' : '#92400e';
  const niceMatched   = jd_nice_to_have_skills.length - niceGaps.length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: USER_COLOR_LIGHT }}>
          <Target size={16} strokeWidth={2.5} style={{ color: USER_COLOR }} />
        </div>
        <div>
          <h1 className="text-base font-black text-zinc-900 leading-tight">Skill Gaps Analysis</h1>
          <p className="text-[11px] text-zinc-400 font-medium">
            {jd_role_title}&nbsp;&middot;&nbsp;{jd_seniority}
          </p>
        </div>
        <span className="ml-auto text-[11px] font-black px-2.5 py-1 rounded-full"
          style={{ background: USER_COLOR_LIGHT, color: USER_COLOR }}>NEXUS-STRATEGIST</span>
      </div>

      {/* Match score */}
      <Section title="Overall Match">
        <div className="flex items-center gap-6">
          <MatchRing pct={pct} />
          <div className="flex flex-col gap-2 flex-1">
            <span className="text-base font-black" style={{ color: matchColor }}>{matchLabel}</span>
            <Stat label="Required matched"
              value={matched_required.length + ' / ' + jd_required_skills.length} />
            <Stat label="Nice-to-have covered"
              value={niceMatched + ' / ' + jd_nice_to_have_skills.length} />
            <Stat label="Skills w/ evidence"
              value={demonstrated.length + ' of ' + candidate_skills.length} />
            <Stat label="Experience level"
              value={candidate_experience_summary.level +
                (candidate_experience_summary.years > 0
                  ? ' \u00b7 ' + String(candidate_experience_summary.years) + 'y' : '')} />
          </div>
        </div>
      </Section>

      {/* Required gaps */}
      {requiredGaps.length > 0 && (
        <Section title={'Required gaps (' + requiredGaps.length + ')'}>
          <div className="flex flex-wrap gap-1.5">
            {requiredGaps.map((s) => <SkillPill key={s} skill={s} variant="gap-required" />)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-2 font-medium">
            Listed as required by the JD but absent from your resume. Add concrete proof.
          </p>
        </Section>
      )}

      {/* Matched */}
      {matched_required.length > 0 && (
        <Section title={'Matched required (' + matched_required.length + ')'}>
          <div className="flex flex-wrap gap-1.5">
            {matched_required.map((s) => <SkillPill key={s} skill={s} variant="matched" />)}
          </div>
        </Section>
      )}

      {/* Nice-to-have gaps */}
      {niceGaps.length > 0 && (
        <Section title={'Nice-to-have gaps (' + niceGaps.length + ')'}>
          <div className="flex flex-wrap gap-1.5">
            {niceGaps.map((s) => <SkillPill key={s} skill={s} variant="gap-nice" />)}
          </div>
        </Section>
      )}

      {/* Skills breakdown */}
      {candidate_skills.length > 0 && (
        <Section title="Your skills breakdown">
          {demonstrated.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1.5">
                Demonstrated with evidence
              </p>
              <div className="flex flex-wrap gap-1.5">
                {demonstrated.map((s: CandidateSkill) =>
                  <SkillPill key={s.skill} skill={s.skill} variant="demonstrated" />
                )}
              </div>
            </div>
          )}
          {listedOnly.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1.5">
                Listed only &#8212; no supporting evidence
              </p>
              <div className="flex flex-wrap gap-1.5">
                {listedOnly.map((s: CandidateSkill) =>
                  <SkillPill key={s.skill} skill={s.skill} variant="listed" />
                )}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Domains */}
      {candidate_experience_summary.domains.length > 0 && (
        <Section title="Experience domains">
          <div className="flex flex-wrap gap-1.5">
            {candidate_experience_summary.domains.map((d) => (
              <span key={d}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                style={{ background: USER_COLOR_LIGHT, color: USER_COLOR, border: '1px solid ' + USER_COLOR_SOFT }}>
                <Briefcase size={11} />{d}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Hint */}
      <div className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: USER_COLOR_LIGHT, border: '1px solid ' + USER_COLOR_SOFT }}>
        <GraduationCap size={18} style={{ color: USER_COLOR }} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black text-zinc-800 mb-0.5">Next step</p>
          <p className="text-[11px] text-zinc-600 font-medium leading-relaxed">
            Visit <strong>Recommended Programs</strong> to upskill for your {requiredGaps.length} required
            {' '}gaps, or head to <strong>Interview Prep</strong> to practise what you already know.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SkillGapsView;
