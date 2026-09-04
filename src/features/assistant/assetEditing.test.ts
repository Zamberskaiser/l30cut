import { describe, expect, it } from "vitest";
import { planDeterministically } from "./deterministicPlanner";
import { compilePlan } from "./planExecutor";
import { extractJson } from "./provider";
import { applyCommand } from "@/core/store/timelineReducer";
import { createDemoProject } from "@/core/demo/demoProject";
import { activeSequence, SECOND, type MediaAsset, type Project } from "@/core/contracts/domain";

const runtime = { capabilities: { ffmpeg: true } } as never;

function projectWithAsset(): { project: Project; asset: MediaAsset } {
  const base = createDemoProject();
  const asset: MediaAsset = {
    id: "asset_ent",
    kind: "video",
    name: "entrevista.mp4",
    path: "C:/videos/entrevista.mp4",
    durationUs: 60 * SECOND,
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
    audioChannels: 2,
    sizeBytes: 1000,
    proxyReady: false,
    demo: false,
  };
  const withAsset: Project = { ...base, assets: [...base.assets, asset] };
  const seq = activeSequence(withAsset);
  const track = seq.tracks.find((t) => t.kind === "video")!;
  const project = applyCommand(withAsset, {
    type: "insertClip",
    clipId: "clip_ent",
    trackId: track.id,
    assetId: asset.id,
    startUs: 0,
    sourceInUs: 0,
    sourceOutUs: 10 * SECOND,
    label: "entrevista",
  });
  return { project, asset };
}

const defaults = {
  minSilenceUs: 400_000,
  paddingUs: 60_000,
  clipMinUs: 15 * SECOND,
  clipMaxUs: 60 * SECOND,
};

describe("edição por nome de arquivo", () => {
  it("aumenta o volume do arquivo citado pelo nome", () => {
    const { project } = projectWithAsset();
    const plan = planDeterministically({
      prompt: "aumenta o volume do entrevista em 4 db",
      project,
      scope: { kind: "project", clipIds: [] },
      defaults,
    });
    expect(plan?.operations[0]).toEqual({ op: "adjustGain", clipId: "clip_ent", deltaDb: 4 });
    const compiled = compilePlan(project, plan!, runtime);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.transaction.commands[0]).toEqual({
      type: "changeGain",
      clipId: "clip_ent",
      gainDb: 4,
    });
  });

  it("diminui o volume e respeita o limite inferior", () => {
    const { project } = projectWithAsset();
    const plan = planDeterministically({
      prompt: "diminui o som do entrevista",
      project,
      scope: { kind: "project", clipIds: [] },
      defaults,
    });
    expect(plan?.operations[0]).toMatchObject({ op: "adjustGain", deltaDb: -3 });
  });

  it("renomeia a mídia sem tocar no disco", () => {
    const { project, asset } = projectWithAsset();
    const plan = planDeterministically({
      prompt: "renomeia o entrevista para Entrevista Final",
      project,
      scope: { kind: "project", clipIds: [] },
      defaults,
    });
    expect(plan?.operations[0]).toEqual({
      op: "renameAsset",
      assetId: asset.id,
      name: "Entrevista Final",
    });
    const compiled = compilePlan(project, plan!, runtime);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const next = compiled.transaction.commands.reduce(applyCommand, project);
    expect(next.assets.find((a) => a.id === asset.id)?.name).toBe("Entrevista Final");
    expect(next.assets.find((a) => a.id === asset.id)?.path).toBe(asset.path);
  });

  it("aplica ganho em todos os clipes de um arquivo", () => {
    const { project } = projectWithAsset();
    const compiled = compilePlan(
      project,
      {
        version: 1,
        id: "plan_t",
        intent: "gain",
        summary: "ganho",
        scope: { kind: "project", clipIds: [] },
        operations: [{ op: "setAssetGain", assetId: "asset_ent", gainDb: -60 }],
        warnings: [],
        estimatedImpact: {
          clipsAdded: 0,
          clipsRemoved: 0,
          clipsModified: 1,
          durationDeltaUs: 0,
          sequencesCreated: 0,
          captionsAdded: 0,
        },
        requiresConfirmation: false,
        rationale: "teste",
        modelInfo: { provider: "ollama", model: "llama3.1" },
      },
      runtime,
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.transaction.commands).toEqual([
      { type: "changeGain", clipId: "clip_ent", gainDb: -60 },
    ]);
  });
});

describe("extractJson", () => {
  it("aceita JSON dentro de cercas de markdown", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("aceita JSON com texto em volta", () => {
    expect(extractJson('Claro! {"a":2} pronto.')).toEqual({ a: 2 });
  });

  it("rejeita conteúdo sem JSON", () => {
    expect(() => extractJson("desculpe")).toThrow();
  });
});
