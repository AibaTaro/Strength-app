import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import type {
  AppData,
  Equipment,
  GoalHistoryEntry,
  PersonalSettings,
  Proposal,
  SetRecord,
  WeightHistoryEntry,
  WorkoutSession,
} from "../domain/types";
import { loadAppData, saveAppData } from "../storage/storage";

type Action =
  | { type: "ADD_SET_RECORD"; record: SetRecord }
  | { type: "UPDATE_SET_RECORD"; id: string; patch: Partial<SetRecord> }
  | { type: "DELETE_SET_RECORD"; id: string; deletedAt: string }
  | { type: "START_SESSION"; session: WorkoutSession }
  | { type: "UPDATE_SESSION"; id: string; patch: Partial<WorkoutSession> }
  | { type: "UPDATE_PERSONAL_SETTINGS"; patch: Partial<PersonalSettings> }
  | { type: "UPDATE_EQUIPMENT"; equipment: Equipment[] }
  | { type: "ADD_WEIGHT_HISTORY"; entry: WeightHistoryEntry }
  | { type: "ADD_GOAL_HISTORY"; entry: GoalHistoryEntry }
  | { type: "ADD_PROPOSAL"; proposal: Proposal }
  | { type: "IMPORT_DATA"; data: AppData };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "ADD_SET_RECORD":
      return { ...state, setRecords: [...state.setRecords, action.record] };
    case "UPDATE_SET_RECORD":
      return {
        ...state,
        setRecords: state.setRecords.map((r) =>
          r.id === action.id ? { ...r, ...action.patch, updatedVersion: r.updatedVersion + 1 } : r
        ),
      };
    case "DELETE_SET_RECORD":
      return {
        ...state,
        setRecords: state.setRecords.map((r) =>
          r.id === action.id ? { ...r, deletedAt: action.deletedAt, updatedVersion: r.updatedVersion + 1 } : r
        ),
      };
    case "START_SESSION":
      return { ...state, sessions: [...state.sessions, action.session] };
    case "UPDATE_SESSION":
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case "UPDATE_PERSONAL_SETTINGS":
      return { ...state, personalSettings: { ...state.personalSettings, ...action.patch } };
    case "UPDATE_EQUIPMENT":
      return { ...state, equipment: action.equipment };
    case "ADD_WEIGHT_HISTORY":
      return { ...state, weightHistory: [...state.weightHistory, action.entry] };
    case "ADD_GOAL_HISTORY":
      return { ...state, goalHistory: [...state.goalHistory, action.entry] };
    case "ADD_PROPOSAL":
      return { ...state, proposals: [...state.proposals, action.proposal] };
    case "IMPORT_DATA":
      return action.data;
    default:
      return state;
  }
}

interface AppContextValue {
  data: AppData;
  addSetRecord: (record: SetRecord) => void;
  updateSetRecord: (id: string, patch: Partial<SetRecord>) => void;
  deleteSetRecord: (id: string) => void;
  startSession: (session: WorkoutSession) => void;
  updateSession: (id: string, patch: Partial<WorkoutSession>) => void;
  updatePersonalSettings: (patch: Partial<PersonalSettings>) => void;
  updateEquipment: (equipment: Equipment[]) => void;
  addWeightHistory: (entry: WeightHistoryEntry) => void;
  addGoalHistory: (entry: GoalHistoryEntry) => void;
  addProposal: (proposal: Proposal) => void;
  importData: (data: AppData) => void;
}

const AppContextInner = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadAppData);

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      addSetRecord: (record) => dispatch({ type: "ADD_SET_RECORD", record }),
      updateSetRecord: (id, patch) => dispatch({ type: "UPDATE_SET_RECORD", id, patch }),
      deleteSetRecord: (id) => dispatch({ type: "DELETE_SET_RECORD", id, deletedAt: new Date().toISOString() }),
      startSession: (session) => dispatch({ type: "START_SESSION", session }),
      updateSession: (id, patch) => dispatch({ type: "UPDATE_SESSION", id, patch }),
      updatePersonalSettings: (patch) => dispatch({ type: "UPDATE_PERSONAL_SETTINGS", patch }),
      updateEquipment: (equipment) => dispatch({ type: "UPDATE_EQUIPMENT", equipment }),
      addWeightHistory: (entry) => dispatch({ type: "ADD_WEIGHT_HISTORY", entry }),
      addGoalHistory: (entry) => dispatch({ type: "ADD_GOAL_HISTORY", entry }),
      addProposal: (proposal) => dispatch({ type: "ADD_PROPOSAL", proposal }),
      importData: (importedData) => dispatch({ type: "IMPORT_DATA", data: importedData }),
    }),
    [data]
  );

  return <AppContextInner.Provider value={value}>{children}</AppContextInner.Provider>;
}

export function useAppData(): AppContextValue {
  const ctx = useContext(AppContextInner);
  if (!ctx) throw new Error("useAppData must be used within AppProvider");
  return ctx;
}
