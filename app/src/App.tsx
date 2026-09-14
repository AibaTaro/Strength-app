import { useState } from "react";
import "./App.css";
import { AppProvider, useAppData } from "./state/AppContext";
import { Today } from "./screens/Today";
import { Workout } from "./screens/Workout";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";

type Tab = "today" | "workout" | "history" | "settings";

function AppShell() {
  const [tab, setTab] = useState<Tab>("today");
  const { data } = useAppData();
  const hasActiveSession = data.sessions.some((s) => s.status === "active" || s.status === "paused");

  return (
    <div className="app-shell">
      <main className="app-main">
        {tab === "today" && <Today onStartWorkout={() => setTab("workout")} />}
        {tab === "workout" && <Workout onEnd={() => setTab("today")} />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
      </main>
      <nav className="bottom-nav">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>
          今日
        </button>
        <button className={tab === "workout" ? "active" : ""} onClick={() => setTab("workout")}>
          運動中{hasActiveSession ? " ●" : ""}
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          振り返り
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          設定
        </button>
      </nav>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default App;
