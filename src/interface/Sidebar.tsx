import {
  Briefcase,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Target,
  Award,
  Linkedin,
  KeyRound,
  Maximize2,
  Settings,
  BarChart3,
  LucideIcon,
} from 'lucide-react';
import React from 'react';
import { ActiveSidebarTab } from '../types';
import { useUiStore } from '../integration/store/uiStore';
import { useActiveTeam } from '../integration/store/teamStore';
import { useCoreStore } from '../integration/store/coreStore';
import { USER_COLOR } from '../theme/brand';
import { useIsAdmin } from './admin/useIsAdmin';

interface NavItem {
  id: ActiveSidebarTab;
  label: string;
  icon: LucideIcon;
  tag?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'skill-gaps',
    label: 'Skill Gaps',
    icon: Target,
  },
  {
    id: 'job-matches',
    label: 'Job Matches',
    icon: Briefcase,
  },
  {
    id: 'recommended-programs',
    label: 'Recommended Programs',
    icon: GraduationCap,
  },
  {
    id: 'interview-prep',
    label: 'Interview Prep',
    icon: MessageSquare,
  },
  {
    id: 'new-cv',
    label: 'New CV',
    icon: FileText,
  },
  {
    id: 'my-outcome',
    label: 'My Outcome',
    icon: Award,
  },
  {
    id: 'linkedin-integration',
    label: 'LinkedIn Integration',
    icon: Linkedin,
  },
];

export const Sidebar: React.FC = () => {
  const { activeSidebarTab, setActiveSidebarTab, llmConfig, setBYOKOpen, setDedupReviewOpen, setAnalyticsDashboardOpen } = useUiStore();
  const { isAdmin } = useIsAdmin();
  const { setViewMode } = useCoreStore();
  const activeTeam = useActiveTeam();
  const hasKey = Boolean(llmConfig.apiKey);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <aside className="w-60 h-screen min-h-screen bg-white border-r border-zinc-100 flex flex-col shrink-0 select-none z-30">
      {/* Brand Header */}
      <div className="h-14 px-3.5 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-2">
          {/* Symbol of NEXIS */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-sm shadow-blue-500/25 ring-1 ring-white/20 select-none shrink-0">
            <svg
              className="w-3.5 h-3.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 21V3l14 18V3" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black tracking-[0.22em] text-darkDelegation">
              NEXIS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Navigation section */}
      <div className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Navigation (8 Views)
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSidebarTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveSidebarTab(item.id)}
              className={`group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer relative ${
                isActive
                  ? 'bg-zinc-100 text-darkDelegation font-black shadow-xs'
                  : 'text-zinc-500 hover:text-darkDelegation hover:bg-zinc-50 font-bold'
              }`}
            >
              {/* Active Indicator Strip */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-darkDelegation" />
              )}

              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  isActive
                    ? 'bg-white text-darkDelegation shadow-xs'
                    : 'text-zinc-400 group-hover:text-darkDelegation'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              </div>

              <span className="text-xs tracking-tight truncate flex-1">{item.label}</span>

              {item.id === 'dashboard' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="3D Simulation Live" />
              )}
            </button>
          );
        })}

        {isAdmin && (
          <div className="pt-3 mt-2 border-t border-zinc-100 flex flex-col gap-1">
            <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Admin Console
            </div>
            <button
              onClick={() => setAnalyticsDashboardOpen(true)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left bg-blue-50/70 hover:bg-blue-100/70 text-blue-900 font-bold transition-all cursor-pointer text-xs group"
              title="Open Analytics Dashboard"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                <BarChart3 size={15} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-black truncate">Analytics Dashboard</span>
            </button>
            <button
              onClick={() => setDedupReviewOpen(true)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left bg-orange-50/70 hover:bg-orange-100/70 text-orange-900 font-bold transition-all cursor-pointer text-xs group"
              title="Open Trainee Deduplication Panel"
            >
              <div className="w-7 h-7 rounded-lg bg-orange-600/10 text-orange-600 flex items-center justify-center shrink-0">
                <Settings size={15} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-black truncate">Trainee Dedup</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Network Status summary & Quick Controls */}
      <div className="p-3 border-t border-zinc-100 bg-zinc-50/40 space-y-2">
        {/* Team indicator */}
        <div
          onClick={() => setViewMode('design')}
          className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-zinc-200/60 shadow-xs hover:border-zinc-300 transition-colors cursor-pointer group"
          title="Open Nexus Teams Designer"
        >
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: activeTeam.color || USER_COLOR }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-darkDelegation uppercase tracking-wider truncate group-hover:text-blue-600 transition-colors">
              {activeTeam.teamName}
            </p>
            <p className="text-[9px] text-zinc-400 font-mono truncate">
              {activeTeam.teamType}
            </p>
          </div>
          <Settings size={13} className="text-zinc-400 group-hover:rotate-45 transition-transform" />
        </div>

        {/* Quick Utilities: BYOK Key, Fullscreen, Nexus Teams */}
        <div className="flex items-center justify-between px-1 text-zinc-400">
          <button
            onClick={() => setBYOKOpen(true)}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-darkDelegation transition-colors cursor-pointer py-1"
            title="Configure API Keys (BYOK)"
          >
            <KeyRound size={13} className={hasKey ? 'text-emerald-500' : ''} />
            <span>{hasKey ? 'BYOK Active' : 'Set API Key'}</span>
          </button>

          <button
            onClick={handleFullscreen}
            className="p-1 hover:text-darkDelegation transition-colors cursor-pointer rounded"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
