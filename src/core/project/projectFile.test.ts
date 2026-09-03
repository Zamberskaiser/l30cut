import { describe, expect, it } from "vitest";
import { createDemoProject } from "@/core/demo/demoProject";
import {
  parseProjectFile,
  projectFileName,
  ProjectFileError,
  serializeProjectFile,
} from "./projectFile";

describe("projectFile", () => {
  it("round-trips a project through the file envelope", () => {
    const project = createDemoProject();
    const parsed = parseProjectFile(serializeProjectFile(project));
    expect(parsed.id).toBe(project.id);
    expect(parsed.sequences.length).toBe(project.sequences.length);
    expect(parsed.sequences[0]!.clips.length).toBe(project.sequences[0]!.clips.length);
  });

  it("accepts a bare project payload from older builds", () => {
    const project = createDemoProject();
    expect(parseProjectFile(JSON.stringify(project)).id).toBe(project.id);
  });

  it("rejects invalid JSON and foreign files", () => {
    expect(() => parseProjectFile("{nope")).toThrow(ProjectFileError);
    expect(() => parseProjectFile(JSON.stringify({ hello: "world" }))).toThrow(ProjectFileError);
  });

  it("derives a windows-safe file name", () => {
    const project = { ...createDemoProject(), name: 'Meu: Projeto/ "final" ' };
    expect(projectFileName(project)).toBe("Meu-Projeto-final.l30cut");
  });
});
