import { BarChart3, FileText, Info, KeyRound, Maximize2, MessageSquare, Search, Settings } from 'lucide-react';
import React, { useState } from 'react';
import packageJson from '../../package.json';
import { useCoreStore } from '../integration/store/coreStore';
import { useUiStore } from '../integration/store/uiStore';
import BYOKModal from './BYOKModal';
import InfoModal from './InfoModal';
import { useIsAdmin } from './admin/useIsAdmin';

const version = packageJson.version;

const Header: React.FC = () => {
  const { llmConfig, isBYOKOpen, setBYOKOpen, setDedupReviewOpen, setAnalyticsDashboardOpen } = useUiStore();
  const { isAdmin } = useIsAdmin();
  const {
    setViewMode,
    setForgeMode,
    setResumeForgeOpen,
    setNexusMirrorOpen,
    setNexusHunterOpen,
  } = useCoreStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [forgeNotice, setForgeNotice] = useState<string | null>(null);
  const hasKey = !!llmConfig.apiKey;

  const showForgeNotice = (message: string) => {
    setForgeNotice(message);
    window.setTimeout(() => setForgeNotice(null), 2500);
  };

  const handleForgeMode = (mode: 'resume-builder' | 'job-hunter' | 'interview-sim') => {
    setForgeMode(mode);
    console.log(`[Forge] Mode switched to: ${mode}`);
    showForgeNotice('Feature coming soon: backend integration in progress.');
  };

  const handleResumeForge = () => {
    setForgeMode('resume-builder');
    setResumeForgeOpen(true);
    console.log('[Forge] Resume Forge pipeline triggered');
  };

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
    <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0 relative z-40">
      {/* Left: Project Title */}
      <div className="flex items-center min-w-0">
        <div className="text-lg font-black tracking-[0.22em] text-darkDelegation leading-none shrink-0">
          NEXIS
        </div>

        <div className="flex items-center gap-3 self-start mt-3 ml-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="text-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
            >
              <Info size={14} strokeWidth={2} />
            </button>
            <span className="text-[10px] font-medium text-zinc-400 font-mono">v{version}</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <a
              href="https://github.com/prkhrexists"
              target="_blank"
              rel="noopener"
              className="text-[10px] font-medium text-zinc-400 hover:text-darkDelegation transition-colors truncate"
            >
              @prkhrexists
            </a>
            <a
              href="https://github.com/prkhrexists/forgev3"
              target="_blank"
              rel="noopener"
              className="text-zinc-300 hover:text-darkDelegation transition-colors shrink-0"
              title="View on GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Right: Global Controls */}
      <div className="flex items-center gap-3">

        <button
          onClick={handleResumeForge}
          className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer h-9 shrink-0"
          title="GitHub Project Integration"
        >
          <FileText size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Github Project Integration</span>
        </button>

        <button
          onClick={() => {
            setForgeMode('job-hunter');
            setNexusHunterOpen(true);
          }}
          className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-lg shadow-purple-600/20 active:scale-95 cursor-pointer h-9 shrink-0"
          title="Job Hunter"
        >
          <Search size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Job Hunter</span>
        </button>

        <button
          onClick={() => {
            setForgeMode('interview-sim');
            setNexusMirrorOpen(true);
          }}
          className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-lg shadow-green-600/20 active:scale-95 cursor-pointer h-9 shrink-0"
          title="Nexus-Mirror"
        >
          <MessageSquare size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Nexus-Mirror</span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => setAnalyticsDashboardOpen(true)}
              className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer h-9 shrink-0"
              title="Analytics Dashboard"
            >
              <BarChart3 size={14} />
              <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Analytics</span>
            </button>

            <button
              onClick={() => setDedupReviewOpen(true)}
              className="flex items-center gap-2 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all shadow-lg shadow-orange-600/20 active:scale-95 cursor-pointer h-9 shrink-0"
              title="Admin Dedup Panel"
            >
              <Settings size={14} className="group-hover:rotate-90 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Admin Dedup</span>
            </button>
          </>
        )}

        <button
          onClick={() => setViewMode('design')}
          className="flex items-center gap-2 px-3 py-1 bg-darkDelegation hover:bg-darkDelegation text-white rounded-lg transition-all shadow-lg shadow-black/10 active:scale-95 cursor-pointer h-9 shrink-0 ml-1"
          title="Nexus Team Designer"
        >
          <Settings size={14} className="group-hover:rotate-45 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Nexus Teams</span>
        </button>

        <div className="w-px h-4 bg-zinc-200" />

        <div className="flex items-center gap-2">
          <button
            onClick={handleFullscreen}
            className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="Fullscreen Browser"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={() => setBYOKOpen(true)}
            className="relative text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="API Key (BYOK)"
          >
            <KeyRound size={16} className={hasKey ? 'text-emerald-500 hover:text-emerald-600' : ''} />
            {hasKey && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {isInfoOpen && (
        <InfoModal key="info-modal" onClose={() => setIsInfoOpen(false)} />
      )}

      {isBYOKOpen && (
        <BYOKModal key="byok-modal" onClose={() => setBYOKOpen(false)} />
      )}

      {forgeNotice && (
        <div className="fixed top-18 right-6 z-[70] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {forgeNotice}
        </div>
      )}
    </header>
  );
};

export default Header;
