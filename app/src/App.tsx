import { useState } from "react";
import "./App.css";
import { AppProvider, useAppData } from "./state/AppContext";
import { Today } from "./screens/Today";
import { Workout } from "./screens/Workout";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { Icon } from "./components/ui";

type Tab = "today" | "workout" | "history" | "settings";

const TABS: { id: Tab; label: string; title: string; icon: "today" | "workout" | "history" | "settings" }[] = [
  { id: "today", label: "今日", title: "今日の運動", icon: "today" },
  { id: "workout", label: "運動中", title: "運動中", icon: "workout" },
  { id: "history", label: "振り返り", title: "振り返り", icon: "history" },
  { id: "settings", label: "設定", title: "設定", icon: "settings" },
];

function AppShell() {
  const [tab, setTab] = useState<Tab>("today");
  const { data } = useAppData();
  const hasActiveSession = data.sessions.some((s) => s.status === "active" || s.status === "paused");
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{current.title}</h1>
      </header>
      <main className="app-main">
        {tab === "today" && <Today onStartWorkout={() => setTab("workout")} onOpenSettings={() => setTab("settings")} />}
        {tab === "workout" && <Workout onEnd={() => setTab("history")} onGoToday={() => setTab("today")} />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
      </main>
      <nav className="bottom-nav" aria-label="メインメニュー">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="nav-btn"
            aria-current={tab === t.id ? "page" : undefined}
            aria-label={t.id === "workout" && hasActiveSession ? "運動中（実施中）" : t.label}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} />
            {t.label}
            {t.id === "workout" && hasActiveSession && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
