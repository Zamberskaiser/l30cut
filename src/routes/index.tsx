import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditor } from "@/core/store/editorStore";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import { PreviewMonitor } from "@/features/editor/PreviewMonitor";
import { TopBar } from "@/features/editor/TopBar";
import { JobsBar } from "@/features/jobs/JobsBar";
import { MediaPanel } from "@/features/media/MediaPanel";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { TranscriptPanel } from "@/features/transcript/TranscriptPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "L30 CUT AI — Editor de vídeo local com assistente de IA" },
      {
        name: "description",
        content:
          "Editor de vídeo local-first para Windows com timeline não destrutiva, cortes por silêncio, legendas automáticas e um assistente de IA que propõe planos de edição revisáveis.",
      },
      { property: "og:title", content: "L30 CUT AI — Editor de vídeo local com assistente de IA" },
      {
        property: "og:description",
        content:
          "Timeline não destrutiva, cortes por silêncio, legendas e um chat de IA que propõe edições antes de aplicar. Demonstração navegável do editor desktop.",
      },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { undo, redo, save } = useEditor();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "s") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save]);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">L30 CUT AI — editor de vídeo local com assistente de IA</h1>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-panel">
          <Tabs defaultValue="media" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-2 grid grid-cols-3">
              <TabsTrigger value="media" className="text-[11px]">
                Mídia
              </TabsTrigger>
              <TabsTrigger value="transcript" className="text-[11px]">
                Fala
              </TabsTrigger>
              <TabsTrigger value="jobs" className="text-[11px]">
                Tarefas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="media" className="min-h-0 flex-1">
              <MediaPanel />
            </TabsContent>
            <TabsContent value="transcript" className="min-h-0 flex-1">
              <TranscriptPanel />
            </TabsContent>
            <TabsContent value="jobs" className="min-h-0 flex-1">
              <JobsBar />
            </TabsContent>
          </Tabs>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PreviewMonitor />
          <div className="h-[46%] min-h-0">
            <TimelinePanel />
          </div>
        </main>

        <aside className="w-[22rem] shrink-0 border-l border-border bg-panel">
          <AssistantPanel />
        </aside>
      </div>
    </div>
  );
}
