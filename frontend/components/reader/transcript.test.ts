import { describe, expect, it } from "vitest";
import { minorSpeakerName, speakerNames } from "./transcript";

describe("minorSpeakerName", () => {
  it("names a minor figure from its id", () => {
    expect(minorSpeakerName("m_child")).toBe("A child");
    expect(minorSpeakerName("m_workman")).toBe("A workman");
    expect(minorSpeakerName("m_old_woman")).toBe("An old woman");
    expect(minorSpeakerName("m_officer")).toBe("An officer");
  });
  it("leaves every other id alone", () => {
    expect(minorSpeakerName("c_prince")).toBeUndefined();
    expect(minorSpeakerName("m_")).toBeUndefined();
    expect(minorSpeakerName("m_Child")).toBeUndefined();
    expect(minorSpeakerName("swallow")).toBeUndefined();
  });
});

describe("speakerNames", () => {
  const texts = (speakers: (string | null)[]) => speakers.map((speaker, index) => ({ panel: "p1", index, kind: "speech", speaker, text: "x", fidelity: "quote" })) as never;
  it("keeps the names of the cast and fills the empty name of a minor speaker", () => {
    const names = speakerNames({ speakers: { c_prince: "The Happy Prince", m_child: "" }, texts: texts(["c_prince", "m_child", null]) });
    expect(names).toEqual({ c_prince: "The Happy Prince", m_child: "A child" });
  });
  it("does not invent a name for an unknown cast id", () => {
    expect(speakerNames({ speakers: { c_ghost: "" }, texts: texts(["c_ghost"]) })).toEqual({ c_ghost: "" });
  });
  it("copes with no page", () => {
    expect(speakerNames(null)).toEqual({});
  });
});
