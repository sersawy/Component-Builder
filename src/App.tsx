import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from './stores/authStore';
import { useComponentStore } from './stores/componentStore';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { JsonEditor } from './components/JsonEditor';
import { SubmitPanel } from './components/SubmitPanel';
import { UpdatePanel } from './components/UpdatePanel';
import {
  CheckCircle,
  XCircle,
  Clock,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

type Tab = 'create' | 'update';

const LOG_ICONS: Record<string, React.ReactNode> = {
  info: <Clock className="w-3.5 h-3.5 text-blue-400" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  warn: <XCircle className="w-3.5 h-3.5 text-yellow-400" />,
};

const LOG_COLORS: Record<string, string> = {
  info: 'border-blue-800/30',
  success: 'border-green-800/30',
  error: 'border-red-800/30',
  warn: 'border-yellow-800/30',
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogPanel() {
  const { logs, clearLogs } = useComponentStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 bg-gray-900 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Activity Log</span>
        {logs.length > 0 && (
          <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">{logs.length}</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearLogs();
          }}
          className="ml-auto text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
        >
          <X className="w-3 h-3" /> clear
        </button>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-500 ml-1" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-500 ml-1" />
        )}
      </div>

      {!collapsed && (
        <div className="bg-gray-950 max-h-48 overflow-y-auto min-h-[80px]">
          {logs.length === 0 ? (
            <p className="text-xs text-gray-600 px-4 py-3">No activity yet...</p>
          ) : (
            <div className="divide-y divide-gray-900">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2.5 px-4 py-2 border-l-2 ${LOG_COLORS[entry.level]}`}
                >
                  {LOG_ICONS[entry.level]}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500 shrink-0">{formatTime(entry.timestamp)}</span>
                      <span className="text-xs text-gray-300">{entry.message}</span>
                    </div>
                    {entry.detail && (
                      <p className="text-xs text-gray-500 ml-6 mt-0.5 truncate font-mono">{entry.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span>{current} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, init } = useAuthStore();
  const { isSubmitting, isUpdating, updateProgress } = useComponentStore();
  const [tab, setTab] = useState<Tab>('create');

  useEffect(() => {
    init();
  }, [init]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm />
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Global Activity Log */}
        <LogPanel />

        {/* Global Progress */}
        {isSubmitting && (
          <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4">
            <ProgressBar current={0} total={0} label="Submitting schemas to API..." />
          </div>
        )}
        {isUpdating && updateProgress && (
          <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4">
            <ProgressBar
              current={updateProgress.current}
              total={updateProgress.total}
              label={`Updating components (${updateProgress.current}/${updateProgress.total})...`}
            />
          </div>
        )}

        <div className="flex items-center gap-1 bg-gray-800/50 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('create')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'create'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Create New
          </button>
          <button
            onClick={() => setTab('update')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'update'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Update Existing
          </button>
        </div>

        {tab === 'create' ? (
          <>
            <JsonEditor />
            <SubmitPanel />
          </>
        ) : (
          <UpdatePanel />
        )}
      </main>
      <Toaster position="top-right" />
    </div>
  );
}