/**
 * Contact pages for the v0.2 vocabulary (#41): every new look, prop and backdrop in context,
 * drawn as real manga pages through renderPage (no model call).
 *   npx tsx scripts/sheet-v02.ts <outDir>
 * Writes page-01.svg / page-02.svg / page-03.svg; turn them into PNG with
 *   npx tsx scripts/svg-dir-to-png.ts <outDir> 1100
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CastMember, FigureSpec, MangaPageSpec, PanelSpec } from "../src/contracts.js";
import { renderPageDetailed } from "../src/index.js";

const out = process.argv[2];
if (!out) throw new Error("usage: sheet-v02.ts <outDir>");
mkdirSync(out, { recursive: true });

const human = (o: Partial<CastMember["look"]> & Record<string, unknown>): CastMember["look"] =>
  ({ kind: "human", age: "adult", build: "average", height: "average", frame: "masc", hair: "short", hair_tone: "dark", facial_hair: "none", outfit: "tunic", outfit_tone: "mid", headwear: "none", accessories: [], skin: "light", material: "flesh", ...o }) as CastMember["look"];

const cast: CastMember[] = [
  { id: "emperor", name: "The Emperor", role: "ruler", description: "A vain emperor", look: human({ build: "heavy", outfit: "royal", outfit_tone: "dark", facial_hair: "mustache", headwear: "crown" }) },
  { id: "cook", name: "The Cook", role: "cook", description: "A cook", look: human({ outfit: "work_apron", outfit_tone: "light", frame: "fem", hair: "bun" }) },
  { id: "girl", name: "The Girl", role: "child", description: "A poor girl", look: human({ age: "child", height: "short", frame: "fem", outfit: "rags", outfit_tone: "mid", hair: "long_straight", skin: "mid" }) },
  { id: "boy", name: "The Boy", role: "child", description: "A boy", look: human({ age: "child", height: "short", outfit: "shirt_trousers", outfit_tone: "dark" }) },
];
const locations = [
  { id: "kitchen", name: "The kitchen", environment: "room_poor", features: [], description: "A kitchen" },
  { id: "hall", name: "Palace hall", environment: "palace_hall", features: [], description: "A hall" },
  { id: "foundry", name: "The foundry", environment: "foundry", features: [], description: "A foundry" },
  { id: "heap", name: "The dust heap", environment: "dustheap", features: [], description: "A dust heap" },
  { id: "paradise", name: "Paradise", environment: "paradise", features: [], description: "Paradise" },
  { id: "road", name: "Snowy road", environment: "country_road", features: ["snow_ground"], description: "A road" },
  { id: "weaver", name: "The weavers' room", environment: "room_rich", features: [], description: "A room" },
] as const;
const book = { cast, locations: locations as unknown as { id: string; name: string; environment: never; features: never[]; description: string }[] };

const fig = (f: Partial<FigureSpec> & Pick<FigureSpec, "character">): FigureSpec => ({ pose: "stand", expression: "neutral", facing: "right", slot: "center", ...f });
const P = (id: string, location: string, shot: PanelSpec["shot"], figures: FigureSpec[], props: PanelSpec["props"] = [], extra: Partial<PanelSpec> = {}): PanelSpec => ({
  id, beat: extra.beat ?? "", shot, angle: "eye", location, time: "day", weather: "clear", figures, props, fx: [], text: [], source: [{ unit: "u01", page: 1 }], ...extra,
}) as PanelSpec;
const say = (speaker: string, text: string) => ({ kind: "speech" as const, speaker, text, fidelity: "dramatized" as const, source: { unit: "u01", page: 1 } });
const page = (n: number, template: string, panels: PanelSpec[]): MangaPageSpec =>
  ({ schema: "manga-page.v1", page_number: n, section_id: "s1", purpose: "sheet", layout: { template }, claims: [], page_turn_hook: false, panels }) as MangaPageSpec;

const pages: MangaPageSpec[] = [
  // props
  page(1, "staggered_6", [
    P("p1", "kitchen", "medium", [fig({ character: "cook", pose: "carry", slot: "center_left" })], [{ prop: "pot", slot: "center_right" }], { beat: "The cook stirs the pot on the stove.", text: [say("cook", "The pot is boiling!")] }),
    P("p2", "kitchen", "medium", [fig({ character: "cook", slot: "center_right", facing: "left" })], [{ prop: "stove", slot: "center_left" }], { beat: "The stove glows." }),
    P("p3", "road", "medium", [fig({ character: "girl", pose: "reach", slot: "center_left", facing: "right" })], [{ prop: "roast_goose", slot: "center_right" }], { beat: "The roast goose waddles out on its dish.", text: [say("girl", "A roast goose!")] }),
    P("p4", "foundry", "close", [fig({ character: "boy", pose: "hold", slot: "center", holding: "heart" })], [], { beat: "He holds the leaden heart." }),
    P("p5", "paradise", "medium", [fig({ character: "girl", slot: "center_left", facing: "right" })], [{ prop: "angel", slot: "center_right" }], { beat: "An angel smiles." }),
    P("p6", "weaver", "full", [fig({ character: "emperor", slot: "center_left", facing: "right" })], [{ prop: "loom", slot: "center_right" }], { beat: "The empty loom." }),
  ]),
  // looks and the sledge
  page(2, "staggered_6", [
    P("p1", "hall", "full", [fig({ character: "emperor", slot: "center", facing: "front" })], [], { beat: "In his robe." }),
    P("p2", "hall", "full", [fig({ character: "emperor", slot: "center", facing: "front", variant: { outfit: "underclothes" } })], [], { beat: "In his underclothes.", text: [say("emperor", "I am not dressed!")] }),
    P("p3", "hall", "full", [fig({ character: "emperor", slot: "center", facing: "front", variant: { outfit: "undressed" } })], [], { beat: "Undressed." }),
    P("p4", "hall", "medium", [fig({ character: "emperor", slot: "center", facing: "left", variant: { outfit: "underclothes" }, pose: "walk" })], [], { beat: "He walks in his underclothes." }),
    P("p5", "road", "wide", [fig({ character: "girl", slot: "center_left", facing: "right" })], [{ prop: "sledge", slot: "center_right" }], { beat: "The sledge waits on the road." }),
    P("p6", "road", "full", [fig({ character: "boy", slot: "center", facing: "left", pose: "talk" })], [{ prop: "sledge", slot: "center_left" }], { beat: "He climbs on the sledge.", text: [say("boy", "Faster!")] }),
  ]),
  // backdrops
  page(3, "staggered_6", [
    P("p1", "foundry", "wide", [fig({ character: "cook", slot: "center" })], [], { beat: "The foundry." }),
    P("p2", "foundry", "medium", [fig({ character: "boy", slot: "center" })], [], { beat: "The foundry, closer." }),
    P("p3", "heap", "wide", [fig({ character: "girl", slot: "center_right", facing: "left" })], [], { beat: "The dust heap." }),
    P("p4", "heap", "medium", [fig({ character: "boy", slot: "center", pose: "cower" })], [], { beat: "On the dust heap." }),
    P("p5", "paradise", "wide", [fig({ character: "girl", slot: "center" })], [], { beat: "Paradise." }),
    P("p6", "paradise", "full", [fig({ character: "boy", slot: "center" })], [], { beat: "Paradise at night.", time: "night" }),
  ]),
];

for (const spec of pages) {
  const { result } = renderPageDetailed(spec, book);
  const n = String(spec.page_number).padStart(2, "0");
  writeFileSync(path.join(out, `page-${n}.svg`), result.svg);
  const errs = result.issues.filter((i) => i.severity === "error");
  console.log(`page ${n}: ${errs.length} errors${errs.length ? " " + errs.map((e) => `${e.code}@${e.path}: ${e.message}`).join(" | ") : ""}; warnings: ${result.issues.filter((i) => i.severity !== "error").map((i) => i.code).join(",")}`);
}
