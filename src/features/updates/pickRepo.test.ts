import { describe, expect, it } from "vitest";
import { pickUpdateRepo, repoCandidates } from "./pickRepo";
import type { GithubRepoRef } from "@/core/runtime/types";

const repo = (fullName: string, extra: Partial<GithubRepoRef> = {}): GithubRepoRef => ({
  fullName,
  private: false,
  pushedAt: new Date().toISOString(),
  ...extra,
});

describe("pickUpdateRepo", () => {
  it("returns null for an empty list", () => {
    expect(pickUpdateRepo([])).toBeNull();
  });

  it("prefers the exact project repository", () => {
    const list = [repo("me/site"), repo("me/l30cut"), repo("me/notes")];
    expect(pickUpdateRepo(list)).toBe("me/l30cut");
  });

  it("falls back to name similarity", () => {
    const list = [repo("me/site"), repo("me/l30-editor")];
    expect(pickUpdateRepo(list)).toBe("me/l30-editor");
  });

  it("ranks candidates strongest first and caps the list", () => {
    const list = [repo("me/a"), repo("me/l30cut"), repo("me/cutter"), repo("me/b"), repo("me/c")];
    const candidates = repoCandidates(list, 2);
    expect(candidates).toEqual(["me/l30cut", "me/cutter"]);
  });
});
