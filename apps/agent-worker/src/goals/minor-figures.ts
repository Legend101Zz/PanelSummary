/**
 * Minor figures (track Q2b, issue #44).
 *
 * The page goal could draw only cast members. A person the book names once ("answered the
 * child", "one of the workmen cried") was drawn as a crowd, borrowed from another figure or
 * left out (acceptance run 8: pages 22, 24, 25 and 42). The understanding adds such people to
 * the cast only when the model remembers (T1: at most 3 errors per book).
 *
 * Here the page goal derives them in code from the page's own source text, with the same
 * speaker rules as T1 (`attribution.ts`): a speaker that the book names on this page, that is a
 * person, and that no cast member of the section answers to. Each one becomes a generic cast
 * member for this page only:
 *
 *   { id: "m_workman", name: "A workman", role: "one of the workmen", minor: true,
 *     look: { kind: "human", age: "adult", ... plain outfit } }
 *
 * The page validators and the renderer see it like any cast member (so UNKNOWN_CAST and
 * SPEAKER_UNKNOWN do not fire), the prompt lists it as a minor figure, and the page may use it
 * in figures and as the speaker of a line. It is never written back into the understanding.
 */
import type { CastMember } from "@panelsummary/manga-render";
import * as C from "@panelsummary/manga-render/contracts";

import { attributions, loneSpeakers, names } from "./attribution.js";

export type MinorFigure = CastMember & { minor: true };

/** Most minor figures one page gets: enough for a bit-part scene, few enough to stay readable. */
export const MAX_MINOR_PER_PAGE = 3;

const CHILD_WORDS = /^(child|children|boy|girl|lad|lass|urchin|baby|infant|youngster|schoolboy|schoolgirl|orphan)$/;
const ELDER_WORDS = /^(grandmother|grandfather|grandam|granny|elder|beggar-woman|old-woman|old-man)$/;
const FEM_WORDS = /(woman|women|girl|lady|maid|mother|wife|queen|princess|grandmother|lass|nurse|daughter|sister|duchess|countess|housekeeper)/;
const PERSON_WORDS = new RegExp(
  "^(?:man|woman|boy|girl|child|lad|lass|urchin|baby|infant|youngster|orphan|person|stranger|traveller|traveler|" +
    "worker|labourer|laborer|servant|maid|maiden|lady|lord|knight|soldier|guard|watchman|sentinel|porter|footman|coachman|" +
    "courtier|minister|officer|official|clerk|student|scholar|professor|teacher|mayor|councillor|alderman|judge|" +
    "shopkeeper|merchant|trader|baker|butcher|farmer|peasant|villager|fisherman|sailor|captain|pilot|priest|bishop|monk|" +
    "king|queen|prince|princess|emperor|empress|duke|duchess|count|countess|squire|page|herald|messenger|doctor|nurse|" +
    "mother|father|grandmother|grandfather|wife|husband|daughter|son|brother|sister|neighbour|neighbor|friend|" +
    "beggar|thief|robber|gardener|miller|smith|blacksmith|weaver|tailor|cook|housekeeper|innkeeper|host|hostess|" +
    "workman|workmen|craftsman|[a-z]+man|[a-z]+woman)$",
);

const stemOf = (w: string) => w.toLowerCase().replace(/(?:ies)$/, "y").replace(/men$/, "man").replace(/(?<![s])s$/, "");

function isPlural(head: string): boolean {
  const w = head.toLowerCase();
  return w === "children" || w === "people" || w.endsWith("men") || (w.length > 3 && w.endsWith("s") && !w.endsWith("ss"));
}

/** A plain, distinct-enough look for a person the book names only by a word. */
export function genericLook(head: string): CastMember["look"] {
  const h = head.toLowerCase();
  const child = CHILD_WORDS.test(h);
  const fem = FEM_WORDS.test(h);
  return {
    kind: "human",
    age: child ? "child" : ELDER_WORDS.test(h) ? "elder" : "adult",
    build: child ? "slim" : "average",
    height: child ? "short" : "average",
    frame: fem ? "fem" : child ? "neutral" : "masc",
    hair: child ? "short" : fem ? "bun" : "short",
    hair_tone: "mid",
    facial_hair: "none",
    outfit: child ? "tunic" : fem ? "dress" : "work_apron",
    outfit_tone: "mid",
    headwear: "none",
    accessories: [],
    skin: "mid",
    material: "flesh",
  } satisfies CastMember["look"];
}

const slug = (head: string) => head.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
const inSection = (member: CastMember, sectionId: string) => !member.sections?.length || member.sections.includes(sectionId);

/**
 * Minor figures of one page: speakers the page's source text names that are people and that no
 * cast member of the section answers to, plus T1's lone speakers (a person hidden in a crowd, or
 * "one of the workmen"). Order: first mention in the text. At most MAX_MINOR_PER_PAGE.
 */
export function minorFigures(
  units: ReadonlyArray<{ text: string }>,
  sectionId: string,
  cast: readonly CastMember[],
  max = MAX_MINOR_PER_PAGE,
): MinorFigure[] {
  const members = cast.filter((m) => inSection(m, sectionId));
  const found = new Map<string, { head: string; phrase: string; singleOnly: boolean }>();
  const add = (head: string, phrase: string, single: boolean) => {
    const key = stemOf(head);
    if (!found.has(key)) found.set(key, { head, phrase, singleOnly: single });
  };
  const sourced = units.map((u) => ({ section_id: sectionId, text: u.text }));
  // 1. The same two cases T1 reports as lone speakers (a crowd hides the person, "one of the Xs").
  for (const lone of loneSpeakers(sourced, cast)) add(lone.head, lone.phrase, true);
  // 2. Any singular attribution that no cast member of this section answers to.
  for (const unit of units) {
    for (const a of attributions(unit.text)) {
      if (isPlural(a.head)) continue;
      if (members.some((m) => names(a.head, m))) continue;
      add(a.head, a.phrase, false);
    }
  }
  const out: MinorFigure[] = [];
  const taken = new Set(cast.map((m) => m.id));
  for (const { head, phrase } of found.values()) {
    const word = stemOf(head);
    if (!PERSON_WORDS.test(word)) continue; // animals, objects and spirits are never guessed
    if ((C.BIRD_SPECIES as readonly string[]).includes(word) || (C.ANIMAL_SPECIES as readonly string[]).includes(word)) continue;
    const id = `m_${slug(word)}`;
    if (!slug(word) || taken.has(id)) continue;
    taken.add(id);
    out.push({
      id,
      name: `${/^[aeiou]/i.test(word) ? "An" : "A"} ${word}`,
      role: phrase.trim(),
      description: `A minor figure the book names only as "${phrase}". Drawn with a generic look; it has no state of its own.`,
      look: genericLook(word),
      sections: [sectionId],
      minor: true,
    });
    if (out.length >= max) break;
  }
  return out;
}
