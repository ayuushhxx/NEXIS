import React, { useState } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  FileCode2,
  Lock,
  MessageSquare,
  Sparkles,
  Zap,
} from 'lucide-react';
import { getAllCharacters } from '../data/agents';
import { useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { useCoreStore } from '../integration/store/coreStore';
import { useChatAvailability } from '../integration/hooks/useChatAvailability';
import { useSceneManager } from '../simulation/SceneContext';
import { Avatar } from './components/Avatar';
import ChatPanel from './ChatPanel';
import { USER_COLOR, USER_COLOR_LIGHT } from '../theme/brand';

const AGENT_ROLE_MAP: Record<string, { mission: string; outputPlaceholder: string }> = {
  'Nexus-Director': {
    mission: 'Executive orchestration across strategy, tailoring, discovery, and interview simulation pipelines.',
    outputPlaceholder:
      'Executive Orchestration Plan\n- Pipeline status: Synchronized with active career profile\n- Active workstreams: Intent mining, achievement quantification, market indexing\n- Next deliverable: End-to-end verified career package for target submission',
  },
  'Nexus-Vision': {
    mission: 'Visual UX auditor analyzing recruiter scan-flow, readability density, and layout balance.',
    outputPlaceholder:
      'Visual UX Audit\n- First-scan eye path: Optimal top-third distribution\n- Readability index: 94/100 (clean ATS typography hierarchy)\n- Section spacing: Balanced whitespace across Experience & Projects',
  },
  'Nexus-Strategist': {
    mission: 'Hiring intent miner extracting prerequisite technologies, risk gaps, and credential weights.',
    outputPlaceholder:
      'JD Intent & Skill Matrix\n- Key Priorities: Distributed systems, API resiliency, latency engineering\n- Claimed Strengths: Production delivery, system ownership, pipeline scaling\n- Verification Target: Quantitative metrics for high-throughput messaging',
  },
  'Nexus-Writer': {
    mission: 'STAR-metric engineer rewriting experiences into quantifiable, high-impact bullet points.',
    outputPlaceholder:
      'Quantified Impact Bullets\n- Engineered distributed ingestion layer processing 12M+ daily events with 99.98% reliability.\n- Reduced critical API latency by 42% via Redis cluster caching and async event batching.\n- Automated CI/CD regression suites cutting deployment lead times from 45m to 8m.',
  },
  'Nexus-Hunter': {
    mission: 'Autonomous discovery engine ranking direct career listings with Blue Ocean advantage.',
    outputPlaceholder:
      'Blue Ocean Search Stream\n- Searched: site:workatastartup.com, Greenhouse boards, Lever pipelines\n- Filtered out: Crowded multi-applicant LinkedIn boards\n- Prime Target candidates: 3 high-affinity startup roles identified',
  },
  'Nexus-Mirror': {
    mission: 'Recursive interview simulator stress-testing answers with real-time pressure scoring.',
    outputPlaceholder:
      'Interview Question Matrix\n- Technical Claim: Latency optimization & caching tradeoffs\n- Cross-Question: "Walk me through what failed first when cache invalidation hit peak load."\n- Pressure Delta: +12 (stress-testing operational edge cases)',
  },
};

export const AgentDetailDrawer: React.FC = () => {
  const { selectedNpcIndex, setSelectedNpc, agentStatuses, isChatting, setChatting } = useUiStore();
  const { tasks, nexusActivityLog } = useCoreStore();
  const system = useActiveTeam();
  const scene = useSceneManager();
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');

  const allCharacters = getAllCharacters(system);
  const agent = selectedNpcIndex !== null ? allCharacters.find((a) => a.index === selectedNpcIndex) ?? null : null;
  const isOpen = selectedNpcIndex !== null && agent !== null && agent.index !== system.user.index;

  const { canChat, reason } = useChatAvailability(selectedNpcIndex);

  // Live status mapping
  const rawStatus = (selectedNpcIndex !== null ? agentStatuses[selectedNpcIndex] : null) || 'idle';
  const activeTask = tasks.find(
    (t) => t.assignedAgentId === selectedNpcIndex && t.status === 'in_progress'
  );
  const holdTask = tasks.find(
    (t) => t.assignedAgentId === selectedNpcIndex && t.status === 'on_hold'
  );

  let statusLabel = 'Idle / Standby';
  let statusColor = 'text-zinc-500 bg-zinc-100 border-zinc-200';
  let pulseColor = 'bg-zinc-400';

  if (activeTask || rawStatus === 'working') {
    statusLabel = 'Working / Generating';
    statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    pulseColor = 'bg-emerald-500';
  } else if (holdTask || rawStatus === 'on_hold') {
    statusLabel = 'Review Needed';
    statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
    pulseColor = 'bg-blue-500';
  } else if (rawStatus === 'talking') {
    statusLabel = 'In Discussion';
    statusColor = 'text-indigo-700 bg-indigo-50 border-indigo-200';
    pulseColor = 'bg-indigo-500';
  } else if (rawStatus === 'moving') {
    statusLabel = 'Moving to Desk';
    statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    pulseColor = 'bg-amber-500';
  }

  // Agent output: real output if available in tasks, or placeholder state
  const latestFinishedTask = tasks
    .filter((t) => t.assignedAgentId === selectedNpcIndex && (t.output || t.draftOutput))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const agentConfig = agent ? AGENT_ROLE_MAP[agent.name] : null;
  const realOutput = latestFinishedTask?.output || latestFinishedTask?.draftOutput || null;
  const displayOutput = realOutput || agentConfig?.outputPlaceholder || 'Output pipeline ready. Real deliverables will stream here upon pipeline run.';

  // Agent activity logs
  const agentLogs = nexusActivityLog
    .filter((entry) => {
      if (!agent) return false;
      const lower = agent.name.toLowerCase();
      return lower.includes(entry.agentType);
    })
    .slice(-4)
    .reverse();

  const handleClose = () => {
    setSelectedNpc(null);
    if (isChatting) setChatting(false);
  };

  const handleStartChat = () => {
    if (canChat && selectedNpcIndex !== null) {
      setActiveTab('chat');
      scene?.startChat(selectedNpcIndex);
    }
  };

  return (
    <aside
      className={`fixed top-14 right-0 bottom-0 w-96 max-w-[90vw] bg-white border-l border-zinc-200/80 shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out select-none ${
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
      aria-label="Agent Details Drawer"
    >
      {agent && (
        <>
          {/* Header */}
          <div className="p-4 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 p-1 bg-white rounded-xl border border-zinc-200 shadow-xs">
                <Avatar
                  type={agent.index === system.leadAgent.index ? 'lead' : 'sub'}
                  color={agent.color}
                  size={42}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-darkDelegation tracking-tight truncate">
                    {agent.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border shadow-xs"
                    style={{
                      backgroundColor: `${agent.color}15`,
                      color: agent.color,
                      borderColor: `${agent.color}30`,
                    }}
                  >
                    {agent.index === system.leadAgent.index ? 'Lead Agent' : 'Subagent'}
                  </span>

                  <span className="text-[9px] font-mono text-zinc-400 truncate">
                    {agent.model}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="p-1.5 text-zinc-400 hover:text-darkDelegation hover:bg-zinc-200/60 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Close Drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Navigation if chatting */}
          <div className="flex border-b border-zinc-100 bg-white text-xs font-bold">
            <button
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-2.5 text-center uppercase tracking-wider text-[10px] transition-colors border-b-2 ${
                activeTab === 'details'
                  ? 'border-darkDelegation text-darkDelegation font-black'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Agent Details & Output
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-center uppercase tracking-wider text-[10px] transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'border-darkDelegation text-darkDelegation font-black'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <MessageSquare size={12} />
              Discussion
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {activeTab === 'chat' ? (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-[350px]">
                  <ChatPanel />
                </div>
              </div>
            ) : (
              <>
                {/* 1. Live Status Card */}
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                      <Activity size={12} />
                      Live Status
                    </span>

                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pulseColor} animate-pulse`} />
                      {statusLabel}
                    </div>
                  </div>

                  {activeTask ? (
                    <div>
                      <p className="text-xs font-bold text-darkDelegation">
                        Current Mission: "{activeTask.title}"
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {activeTask.description}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500 font-medium">
                      {agentConfig?.mission || agent.description}
                    </p>
                  )}
                </div>

                {/* 2. Real Output Section (Wired to placeholder/real state) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                      <FileCode2 size={12} />
                      Agent Output
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      realOutput ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {realOutput ? 'Real Deliverable' : 'Placeholder Preview'}
                    </span>
                  </div>

                  <div className="bg-zinc-900 text-zinc-100 rounded-xl p-3.5 text-xs font-mono border border-zinc-800 shadow-inner">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-[10px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Sparkles size={11} className="text-yellow-400" />
                        {realOutput ? 'Generated Artifact' : 'Expected Schema'}
                      </span>
                      <span>{agent.model}</span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300">
                      {displayOutput}
                    </pre>
                  </div>
                </div>

                {/* 3. Recent Activity Log for this Agent */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                    <Clock size={12} />
                    Recent Actions
                  </span>

                  {agentLogs.length > 0 ? (
                    <div className="space-y-1.5">
                      {agentLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-lg border border-zinc-100 bg-zinc-50/70 text-xs flex items-start justify-between gap-2"
                        >
                          <div>
                            <p className="font-bold text-darkDelegation">{log.action}</p>
                            <p className="text-[11px] text-zinc-500 line-clamp-2">
                              {typeof log.result === 'string' ? log.result : JSON.stringify(log.result)}
                            </p>
                          </div>
                          <span className="text-[9px] font-mono text-zinc-400 shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center rounded-lg border border-zinc-100 bg-zinc-50 text-[11px] text-zinc-400 font-medium">
                      No standalone actions logged yet for this agent.
                    </div>
                  )}
                </div>

                {/* 4. Action Button */}
                <div className="pt-2">
                  <button
                    onClick={handleStartChat}
                    disabled={!canChat}
                    className="w-full py-2.5 px-4 rounded-xl bg-darkDelegation hover:bg-black text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {canChat ? (
                      <>
                        <MessageSquare size={13} />
                        Consult with {agent.name}
                      </>
                    ) : (
                      <>
                        <Lock size={12} />
                        {reason || 'Agent Busy'}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
};

export default AgentDetailDrawer;
