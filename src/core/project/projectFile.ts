import { z } from "zod";
import { ProjectSchema, type Project } from "@/core/contracts/domain";

/**
 * On-disk project file format (`*.l30cut`).
 *
 * A project file is plain, human-readable JSON: the whole non-destructive
 * project (assets are referenced by path, never copied) plus a small envelope
 * so future versions can migrate deterministically.
 */
export const PROJECT_FILE_EXTENSION = "l30cut";
export const PROJECT_FILE_VERSION = 1;

export const ProjectFileSchema = z
  .object({
    format: z.literal("l30cut.project"),
    fileVersion: z.literal(PROJECT_FILE_VERSION),
    app: z.string().default("L30 CUT AI"),
    savedAt: z.string(),
    project: ProjectSchema,
  })
  .strict();
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

/** Windows-safe file name derived from the project name. */
export function projectFileName(project: Project): string {
  const base =
    project.name
      .normalize("NFKD")
      .replace(/[^\p{Letter}\p{Number}\-_ ]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "projeto";
  return `${base}.${PROJECT_FILE_EXTENSION}`;
}

/** Serializes a project into the exact text written to disk. */
export function serializeProjectFile(project: Project, savedAt = new Date()): string {
  const file: ProjectFile = {
    format: "l30cut.project",
    fileVersion: PROJECT_FILE_VERSION,
    app: "L30 CUT AI",
    savedAt: savedAt.toISOString(),
    project: { ...project, updatedAt: savedAt.toISOString() },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export class ProjectFileError extends Error {}

/**
 * Parses a `.l30cut` file. Also accepts a bare project JSON (files written by
 * older builds) so opening never fails for a valid project payload.
 */
export function parseProjectFile(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError("O arquivo não é um JSON válido.");
  }
  const envelope = ProjectFileSchema.safeParse(raw);
  if (envelope.success) return envelope.data.project;
  const bare = ProjectSchema.safeParse(raw);
  if (bare.success) return bare.data;
  throw new ProjectFileError("O arquivo não é um projeto do L30 CUT AI.");
}
