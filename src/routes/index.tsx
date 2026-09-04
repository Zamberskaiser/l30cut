import { createFileRoute } from "@tanstack/react-router";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommandContext } from "@/core/commands/useCommandContext";
import { useEditorShortcuts } from "@/core/shortcuts/useEditorShortcuts";
import { useUi } from "@/core/store/uiStore";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import { EffectsPanel } from "@/features/effects/EffectsPanel";
import { TrimDialog } from "@/features/effects/TrimDialog";
import { PreviewMonitor } from "@/features/editor/PreviewMonitor";
import { StatusBar } from "@/features/editor/StatusBar";
import { TopBar } from "@/features/editor/TopBar";
import { JobsBar } from "@/features/jobs/JobsBar";
import { MediaPanel } from "@/features/media/MediaPanel";
import { CommandPalette } from "@/features/shortcuts/CommandPalette";
import { ShortcutsDialog } from "@/features/shortcuts/ShortcutsDialog";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const ui = useUi();
  const ctx = useCommandContext();
  useEditorShortcuts(ctx);
  const pro = ui.mode === "pro";

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <h1 className="sr-only">L30 CUT AI — editor de vídeo local com assistente de IA</h1>
      <TopBar />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="19" minSize="12" maxSize="34">
          <aside
            className="flex h-full min-h-0 flex-col border-r border-border bg-panel"
            onPointerDownCapture={() => ui.setFocused("media")}
          >
            <Tabs defaultValue="media" className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className={`m-2 grid ${pro ? "grid-cols-4" : "grid-cols-3"}`}>
                <TabsTrigger value="media" className="text-[11px]">
                  Mídia
                </TabsTrigger>
                <TabsTrigger value="transcript" className="text-[11px]">
                  Fala
                </TabsTrigger>
                <TabsTrigger value="effects" className="text-[11px]">
                  Efeitos
                </TabsTrigger>
                {pro ? (
                  <TabsTrigger value="jobs" className="text-[11px]">
                    Tarefas
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="media" className="min-h-0 flex-1">
                <MediaPanel />
              </TabsContent>
              <TabsContent value="transcript" className="min-h-0 flex-1">
                <TranscriptPanel />
              </TabsContent>
              <TabsContent value="effects" className="min-h-0 flex-1">
                <EffectsPanel />
              </TabsContent>
              {pro ? (
                <TabsContent value="jobs" className="min-h-0 flex-1">
                  <JobsBar />
                </TabsContent>
              ) : null}
            </Tabs>
          </aside>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={ui.assistantCollapsed ? "81" : "58"} minSize="30">
          <ResizablePanelGroup orientation="vertical" className="min-h-0">
            <ResizablePanel defaultSize="54" minSize="20">
              <div
                className="flex h-full min-h-0 flex-col"
                onPointerDownCapture={() => ui.setFocused("monitor")}
              >
                <PreviewMonitor />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="46" minSize="20">
              <TimelinePanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        {ui.assistantCollapsed ? null : (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="23" minSize="16" maxSize="40">
              <aside
                className="h-full min-h-0 border-l border-border bg-panel"
                onPointerDownCapture={() => ui.setFocused("chat")}
              >
                <AssistantPanel />
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <div className="pointer-events-none fixed right-3 top-14 z-30">
        <Button
          size="sm"
          variant="secondary"
          className="pointer-events-auto h-7 gap-1.5 text-[11px]"
          onClick={() => ui.setAssistantCollapsed(!ui.assistantCollapsed)}
        >
          {ui.assistantCollapsed ? (
            <PanelRightOpen className="size-3.5" />
          ) : (
            <PanelRightClose className="size-3.5" />
          )}
          Assistente
        </Button>
      </div>

      <StatusBar />
      <ShortcutsDialog />
      <CommandPalette />
      <TrimDialog />
    </div>
  );
}
