import { describe, expect, it } from "vitest";
import {
  MAX_TRANSCRIBE_BYTES,
  describeFileProblem,
  fileExtension,
  isTranscribableName,
  joinSegments,
} from "./audioSources";

describe("fileExtension", () => {
  it("reads the extension from a windows path", () => {
    expect(fileExtension("C:\\Videos\\Entrevista Final.MP4")).toBe("mp4");
  });

  it("returns empty when there is none", () => {
    expect(fileExtension("gravacao")).toBe("");
    expect(fileExtension(".hidden")).toBe("");
  });
});

describe("isTranscribableName", () => {
  it("accepts audio and video containers", () => {
    expect(isTranscribableName("a.wav")).toBe(true);
    expect(isTranscribableName("a.mov")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTranscribableName("projeto.l30cut")).toBe(false);
  });
});

describe("describeFileProblem", () => {
  it("passes a normal media file", () => {
    expect(describeFileProblem("entrevista.mp4", 1024)).toBeNull();
  });

  it("explains wrong type, empty and oversized files", () => {
    expect(describeFileProblem("doc.pdf", 10)).toMatch(/áudio ou vídeo/);
    expect(describeFileProblem("a.mp3", 0)).toMatch(/vazio/);
    expect(describeFileProblem("a.mp3", MAX_TRANSCRIBE_BYTES + 1)).toMatch(/grande demais/);
  });
});

describe("joinSegments", () => {
  it("merges segment texts into one paragraph", () => {
    expect(joinSegments([{ text: " olá  " }, { text: "" }, { text: "mundo" }])).toBe("olá mundo");
  });
});
