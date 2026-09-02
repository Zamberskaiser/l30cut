import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { AiEditPlan } from "@/core/contracts/aiPlan";
import type { EditCommand, Transaction } from "@/core/contracts/commands";
import {
  activeSequence,
  type ExportPreset,
  type Aspect,
  type FeedbackEvent,
  type Job,
  type MediaAsset,
  type Project,
  type TrainingProfile,
} from "@/core/contracts/domain";
import { createDemoProject, createEmptyProject } from "@/core/demo/demoProject";
import { JobQueue, type JobSpec } from "@/core/jobs/jobQueue";
import { resolveRuntime } from "@/core/runtime";
import { ASPECT_RESOLUTIONS } from "@/core/runtime/catalog";
import type { RuntimeAdapter } from "@/core/runtime/types";
import {
  applyTransaction,
  emptyHistory,
  newId,
  redo as redoHistory,
  undo as undoHistory,
  type EditorHistory,
  type HistoryEntry,
} from "./timelineReducer";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  plan?: AiEditPlan;
  planState?: "pending" | "applied" | "discarded" | "failed";
  at: number;
}

export const DEFAULT_TRAINING_PROFILE: TrainingProfile = {
  id: "profile_default",
  version: 1,
  name: "Perfil padrão",
  rules: [
    "Cortes verticais entre 30 e 60 segundos.",
    "Remover pausas acima de 700 ms mantendo 60 ms de respiro.",
    "Nunca cortar no meio de uma palavra da transcrição.",
  ],
  defaults: {
    minSilenceUs: 700_000,
    paddingUs: 60_000,
    clipMinUs: 30_000_000,
    clipMaxUs: 60_000_000,
    aspect: "9:16",
  },
  knowledge: [],
  learningEnabled: false,
};

export interface EditorState {
  runtime: RuntimeAdapter;
  project: Project;
  history: EditorHistory;
  selection: string[];
  playheadUs: number;
  inOutUs: [number, number] | null;
  jobs: Job[];
  messages: AssistantMessage[];
  profile: TrainingProfile;
  feedback: FeedbackEvent[];
  planHistory: Array<{ plan: AiEditPlan; appliedCommands: number; at: number }>;
  dirty: boolean;
}

export interface EditorActions {
  dispatch: (tx: Transaction) => HistoryEntry | null;
  run: (commands: EditCommand[], label: string) => HistoryEntry | null;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  setPlayhead: Dispatch<SetStateAction<number>>;
  setInOut: (range: [number, number] | null) => void;
  newProject: (name: string) => void;
  loadDemoProject: () => void;
  save: () => Promise<void>;
  enqueue: <T>(spec: JobSpec<T>) => { id: string; done: Promise<T> };
  cancelJob: (id: string) => void;
  clearFinishedJobs: () => void;
  addAsset: (assets: MediaAsset[]) => void;
  pushMessage: (message: AssistantMessage) => void;
  updateMessage: (id: string, patch: Partial<AssistantMessage>) => void;
  recordPlanApplied: (plan: AiEditPlan, commands: number) => void;
  addFeedback: (event: Omit<FeedbackEvent, "id" | "at">) => void;
  setProfile: (profile: TrainingProfile) => void;
  clearLearningData: () => void;
  exportPresetFor: (aspect: Aspect) => ExportPreset;
}

const EditorContext = createContext<(EditorState & EditorActions) | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const runtime = useMemo(() => resolveRuntime(), []);
  const queue = useRef<JobQueue>(new JobQueue(2));
  const [project, setProject] = useState<Project>(() => createDemoProject());
  const [history, setHistory] = useState<EditorHistory>(emptyHistory);
  const [selection, setSelection] = useState<string[]>([]);
  const [playheadUs, setPlayhead] = useState(0);
  const [inOutUs, setInOut] = useState<[number, number] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [profile, setProfile] = useState<TrainingProfile>(DEFAULT_TRAINING_PROFILE);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [planHistory, setPlanHistory] = useState<EditorState["planHistory"]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => queue.current.subscribe(setJobs), []);

  const dispatch = useCallback(
    (tx: Transaction): HistoryEntry | null => {
      try {
        const result = applyTransaction(project, history, tx);
        setProject(result.project);
        setHistory(result.history);
        setDirty(true);
        return result.entry;
      } catch (error) {
        toast.error("Edição rejeitada", { description: (error as Error).message });
        return null;
      }
    },
    [project, history],
  );

  const run = useCallback(
    (commands: EditCommand[], label: string) =>
      dispatch({ label, commands, source: "user" }),
    [dispatch],
  );

  const undo = useCallback(() => {
    const result = undoHistory(history);
    if (!result) {
      toast.info("Nada para desfazer");
      return;
    }
    setProject(result.project);
    setHistory(result.history);
    setDirty(true);
  }, [history]);

  const redo = useCallback(() => {
    const result = redoHistory(history);
    if (!result) {
      toast.info("Nada para refazer");
      return;
    }
    setProject(result.project);
    setHistory(result.history);
    setDirty(true);
  }, [history]);

  const value: EditorState & EditorActions = {
    runtime,
    project,
    history,
    selection,
    playheadUs,
    inOutUs,
    jobs,
    messages,
    profile,
    feedback,
    planHistory,
    dirty,
    dispatch,
    run,
    undo,
    redo,
    setSelection,
    setPlayhead,
    setInOut,
    newProject: (name) => {
      setProject(createEmptyProject(name));
      setHistory(emptyHistory);
      setSelection([]);
      setMessages([]);
      setDirty(false);
    },
    loadDemoProject: () => {
      setProject(createDemoProject());
      setHistory(emptyHistory);
      setSelection([]);
      setDirty(false);
    },
    save: async () => {
      await runtime.saveProject(project);
      setDirty(false);
      toast.success("Projeto salvo", {
        description:
          runtime.mode === "tauri"
            ? "Gravado em disco no diretório de projetos."
            : "Salvo no armazenamento local do navegador (modo demonstração).",
      });
    },
    enqueue: (spec) => queue.current.enqueue(spec),
    cancelJob: (id) => queue.current.cancel(id),
    clearFinishedJobs: () => queue.current.clearFinished(),
    addAsset: (assets) => {
      setProject((prev) => ({ ...prev, assets: [...prev.assets, ...assets] }));
      setDirty(true);
    },
    pushMessage: (message) => setMessages((prev) => [...prev, message]),
    updateMessage: (id, patch) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))),
    recordPlanApplied: (plan, commands) =>
      setPlanHistory((prev) => [...prev, { plan, appliedCommands: commands, at: Date.now() }]),
    addFeedback: (event) =>
      setFeedback((prev) => [
        ...prev,
        { ...event, id: newId("fb"), at: new Date().toISOString() },
      ]),
    setProfile: (next) => setProfile({ ...next, version: next.version }),
    clearLearningData: () => {
      setFeedback([]);
      setPlanHistory([]);
      toast.success("Dados de aprendizado apagados");
    },
    exportPresetFor: (aspect) => {
      const res = ASPECT_RESOLUTIONS[aspect];
      return {
        id: `preset_${aspect}`,
        name: `MP4 H.264 ${aspect}`,
        aspect,
        width: res.width,
        height: res.height,
        videoCodec: "h264",
        crf: 20,
        audioBitrateKbps: 192,
        burnCaptions: false,
      };
    },
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor deve ser usado dentro de EditorProvider");
  return ctx;
}

export function useActiveSequence() {
  const { project } = useEditor();
  return activeSequence(project);
}
