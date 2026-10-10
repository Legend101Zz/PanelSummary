import { describe, expect, it } from "vitest";

import { issueNote, lookSenseIssues, statueReason } from "../src/goals/book-understanding.js";

// Candidate cast entries captured live (F3, MiniMax-M3, happy-prince-two-tales): the first
// submit was rejected with STATUE_NOT_HUMAN for the Mayor and the Art Professor, and the
// session ended with both turned to stone.
const sections = [{ id: "s1" }, { id: "s2" }];
const flesh = { kind: "human", age: "adult", material: "flesh" };
const mayor = {
  id: "c_mayor",
  name: "The Mayor",
  role: "the city's Mayor, who walks in the square with the Town Councillors",
  description: "An adult man, the city's Mayor, who walks in the square with the Town Councillors and is the first to call the stripped statue shabby; he proposes another statue, of himself.",
  look: flesh,
  sections: ["s1"],
};
const artProfessor = {
  id: "c_art_prof",
  name: "The Art Professor",
  role: "the Art Professor at the University who judges the statue by its usefulness",
  description: "A man at the University who says that because the Happy Prince is no longer beautiful he is no longer useful.",
  look: flesh,
  sections: ["s1"],
};
const admirer = {
  id: "c_disappointed_man",
  name: "The disappointed man",
  role: "a man gazing at the wonderful statue",
  description: "An adult man who mutters he is glad there is someone in the world who is quite happy, as he looks at the statue.",
  look: flesh,
  sections: ["s1"],
};
const prince = {
  id: "c_prince",
  name: "The Happy Prince",
  role: "a gilded statue of a prince on a tall column above the city",
  description: "Stands high on a tall column above the city square, the whole statue gilded with fine gold.",
  look: { kind: "human", material: "gold" },
  sections: ["s1"],
};

describe("statue guard: people who mention a statue", () => {
  it("accepts the captured Mayor, Art Professor and admirer as living people", () => {
    expect(lookSenseIssues({ sections, cast: [mayor, artProfessor, admirer, prince] }, new Set())).toEqual([]);
  });

  it("does not stick to a person who only mentions the statue", () => {
    const sticky = new Set<string>();
    lookSenseIssues({ sections, cast: [mayor, artProfessor] }, sticky);
    expect([...sticky]).toEqual([]);
  });

  it("does not force a living person to stone", () => {
    const codes = lookSenseIssues({ sections, cast: [{ ...mayor, look: { ...flesh, material: "flesh" } }] }).map((i) => i.code);
    expect(codes).not.toContain("STATUE_NOT_HUMAN");
  });
});

describe("statue guard: animals near the statue (Flash, captured)", () => {
  const swallow = {
    id: "c_swallow",
    name: "The Swallow",
    role: "the little bird who stays behind",
    description: "A swallow small enough to sleep between the feet of the gilded figure and to be held in a child's hand; perched on the statue's shoulder; grows cold at the Prince's feet.",
    look: { kind: "bird" },
    sections: ["s1"],
  };
  it("never reads a bird, animal or plant as a statue of a person", () => {
    expect(lookSenseIssues({ sections, cast: [swallow] }, new Set())).toEqual([]);
  });
  it("does not read a possessive mention as the member being a statue", () => {
    const sparrow = { ...swallow, look: { kind: "human", material: "flesh" }, name: "The Boy", role: "a boy who sleeps between the statue's feet", description: "A boy at the statue's feet." };
    expect(lookSenseIssues({ sections, cast: [sparrow] }, new Set())).toEqual([]);
  });
});

describe("statue guard: real statues stay protected", () => {
  it("rejects a statue cast as an object, and names the id and the reason", () => {
    const rocket = { ...prince, look: { kind: "object", shape: "rocket", tone: "gold" } };
    const issues = lookSenseIssues({ sections, cast: [rocket] });
    expect(issues.map((i) => i.code)).toEqual(["STATUE_NOT_HUMAN"]);
    expect(issues[0]?.message).toContain("c_prince");
    expect(issues[0]?.message).toContain("statue");
    expect(issueNote(issues)).toBe("STATUE_NOT_HUMAN(c_prince)");
  });

  it("rejects a statue cast as a flesh human", () => {
    expect(lookSenseIssues({ sections, cast: [{ ...prince, look: { kind: "human", material: "flesh" } }] }).map((i) => i.code)).toEqual(["STATUE_NOT_HUMAN"]);
  });

  it("catches an object look whose statue word is deep in the text", () => {
    const deep = { id: "c_p", name: "The Prince", role: "a prince", description: "Weeps for the poor from his place, a gilded thing high up.", look: { kind: "object" }, sections: ["s1"] };
    expect(statueReason(deep)).toBeDefined();
  });

  it("still sticks once a real statue is flagged", () => {
    const sticky = new Set<string>();
    lookSenseIssues({ sections, cast: [{ ...prince, look: { kind: "object" } }] }, sticky);
    const reworded = { ...prince, role: "shines above the city", description: "Stands high, shining.", look: { kind: "object" } };
    expect(lookSenseIssues({ sections, cast: [reworded] }, sticky).map((i) => i.code)).toEqual(["STATUE_NOT_HUMAN"]);
  });
});

describe("statue guard: head-only rule and broad verbs (review)", () => {
  it("keeps a living person unflagged when a statue is named only after the head", () => {
    const man = { id: "c_man", name: "The Watchman", role: "a night guard", description: "A man who walks the square at night. Behind him stands the statue.", look: flesh, sections: ["s1"] };
    expect(statueReason(man)).toBeUndefined();
  });

  it("does not hide a statue behind the words made, makes, casts, on or by", () => {
    const text = { id: "c_p", name: "The Prince", role: "a prince made a statue of gold", description: "Stands above the city.", look: flesh, sections: ["s1"] };
    expect(statueReason(text)).toBeDefined();
    expect(statueReason({ ...text, role: "a prince", description: "A prince on a statue column, gilded" })).toBeDefined();
  });
});

describe("issueNote", () => {
  it("lists the failing cast ids next to each code, kept short", () => {
    const note = issueNote([
      { code: "FIELD_MISSING", severity: "error", path: "cast c_bridge_boys.look", message: "x" },
      { code: "STATUE_NOT_HUMAN", severity: "error", path: "cast c_a", message: "x" },
      { code: "STATUE_NOT_HUMAN", severity: "error", path: "cast c_b", message: "x" },
    ]);
    expect(note).toBe("FIELD_MISSING(c_bridge_boys.look),STATUE_NOT_HUMAN(c_a|c_b)");
  });
});

// #48: a statue word in an appositive after the first comma says what the character is.
describe("statue guard: appositive statue description (#48)", () => {
  const make = (role: string, description: string) => ({ id: "c_x", name: "Someone", role, description, look: flesh, sections: ["s1"] });
  const reasonOf = (role: string, description: string) => statueReason(make(role, description));

  it("flags an appositive statue in the description", () => {
    expect(reasonOf("a prince", "A prince, a gilded statue of fine gold")).toBeDefined();
  });
  it("flags an appositive statue covered in gold leaf", () => {
    expect(statueReason({ name: "The Happy Prince", role: "the town's ornament", description: "The Happy Prince, a statue covered in gold leaf", look: flesh })).toBeDefined();
  });
  it("flags the appositive when it is in the role", () => {
    expect(reasonOf("A prince, a gilded statue of fine gold", "Stands over the city.")).toBeDefined();
  });
  it("makes lookSenseIssues return STATUE_NOT_HUMAN for the appositive form", () => {
    const codes = lookSenseIssues({ sections, cast: [make("a prince", "A prince, a gilded statue of fine gold")] }).map((i) => i.code);
    expect(codes).toContain("STATUE_NOT_HUMAN");
  });
  it("stays silent when a person only admires, carves or stands beside a statue", () => {
    expect(reasonOf("a prince", "a prince who admires a statue")).toBeUndefined();
    expect(reasonOf("a sculptor", "a sculptor who carves a statue of the king")).toBeUndefined();
    expect(reasonOf("a man", "a man who stands beside the statue")).toBeUndefined();
  });
  it("stays silent for a comma followed by a clause or another noun", () => {
    expect(reasonOf("a sculptor", "A sculptor, who carves a statue of the king")).toBeUndefined();
    expect(reasonOf("a sculptor", "A sculptor, a man who carves a statue of the king")).toBeUndefined();
    expect(reasonOf("a man", "A man, standing by a statue in the square")).toBeUndefined();
    expect(reasonOf("a man", "A tired man, a guard at a statue in the square")).toBeUndefined();
  });
});
