/**
 * Deterministic claim-coverage check. A planned claim must reach a reader who
 * has not read the book: its salient words (names, objects, actions) must
 * appear in the page's lettering or as characters/props drawn on the page.
 * This catches the dominant acceptance failure ("the page never says the
 * statue is gilded or has sapphire eyes") without trusting the writer's own
 * claim_map.
 */
import type { CastMember, Claim, LocationSpec, MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

const STOP = new Set(
  (
    "the a an and or but if then than that this these those there their them they he she him her his hers its it " +
    "is are was were be been being am do does did done have has had having will would shall should can could may might must " +
    "of in on at to for from by with without into onto upon over under about after before during while when where which who whom whose " +
    "what why how not no nor so too very just also only even still yet again ever never always often all any each every both few more most " +
    "other some such own same one two first last next says said tells told asks asked gives gave makes made becomes became takes took " +
    "goes went comes came gets got sees saw knows knew thinks thought feels felt wants wanted tries tried keeps kept lets let puts put " +
    "because therefore however though although whether until unless within across through around himself herself themselves itself " +
    "something nothing everything someone anyone everyone thing things like much many little great good well back away down out up off"
  ).split(/\s+/),
);

/** Objects the renderer draws under a generic prop id. */
const PROP_WORDS: Record<string, string[]> = {
  gem: ["gem", "jewel", "ruby", "sapphire", "sapphires", "diamond", "emerald", "stone", "eye", "eyes"],
  coin: ["coin", "coins", "gold", "money", "penny"],
  coins_pile: ["coins", "gold", "money", "treasure"],
  money_bag: ["money", "gold", "purse", "bag"],
  rose: ["rose", "roses", "flower"],
  flower: ["flower", "flowers", "blossom", "primrose", "primroses"],
  sword: ["sword", "blade", "hilt"],
  letter: ["letter", "note", "message"],
  paper: ["paper", "page", "notice", "sheet"],
  scroll: ["scroll", "document", "decree"],
  crown: ["crown", "king", "queen"],
  lamp: ["lamp", "lantern", "light"],
  candle: ["candle", "light", "flame"],
  bread: ["bread", "food", "loaf"],
  basket: ["basket"],
  wheelbarrow: ["wheelbarrow", "barrow"],
  bag: ["bag", "sack", "flour"],
  chains: ["chains", "chain", "fetters"],
  ballot_box: ["ballot", "vote", "voting", "election"],
  gavel: ["court", "judge", "law"],
};

/** What drawn staging conveys, in words (poses, faces, effects, states). */
const VISUAL_WORDS: Record<string, string[]> = {
  // poses
  stand: ["stands", "standing"], walk: ["walks", "walking", "goes"], run: ["runs", "running", "flees", "hurries"],
  sit: ["sits", "sitting", "seated"], kneel: ["kneels", "kneeling"], lie: ["lies", "lying", "sleeps", "asleep"],
  fall: ["falls", "falling", "fell"], jump: ["jumps", "leaps"], point: ["points", "shows"], reach: ["reaches", "takes", "plucks", "picks"],
  wave: ["waves", "greets"], arms_crossed: ["refuses", "stubborn"], hands_on_hips: ["proud", "boasts"], think: ["thinks", "wonders"],
  cover_face: ["hides", "ashamed", "weeps"], cower: ["afraid", "fear", "frightened"], bow: ["bows", "curtseys"], hold: ["holds", "carries", "gives"],
  carry: ["carries", "brings", "delivers"], talk: ["says", "tells", "speaks"], fly: ["flies", "flew", "flight", "flying"], perch: ["perches", "shelters", "rests", "sleeps"],
  // expressions
  happy: ["happy", "glad", "joy"], laugh: ["laughs", "laughing"], gentle: ["kind", "gentle"], sad: ["sad", "sorrow", "grief", "unhappy"],
  cry: ["cries", "crying", "weeps", "weeping", "tears"], angry: ["angry", "anger", "rage"], shout: ["shouts", "roars", "cries"],
  surprised: ["surprised", "astonished", "amazed"], afraid: ["afraid", "fear", "terrified"], determined: ["determined", "resolves"],
  thinking: ["thinks", "ponders"], worried: ["worried", "anxious"], smug: ["proud", "vain", "conceited"], tired: ["tired", "weary", "cold"],
  asleep: ["asleep", "sleeps", "sleeping"], pain: ["pain", "hurt", "suffers"], love: ["love", "loves", "adores"],
  // fx
  rain: ["rain", "raining"], snow: ["snow", "winter", "frost"], wind: ["wind", "storm"], fireworks: ["fireworks", "display"],
  impact_burst: ["struck", "strikes", "breaks", "snaps", "explodes"], sparkle: ["glitters", "shines", "beautiful"], light_rays: ["light", "shines"],
  dark_mood: ["dark", "gloom", "misery"], soft_glow: ["warm", "glow"], flashback: ["remembers", "once", "past"],
  speed_lines: ["rushes", "speed", "fast"], focus_lines: ["realises", "sees", "shock"], shock_lines: ["shock", "shocked"],
  // perch parts / states
  feet: ["feet", "foot", "between"], shoulder: ["shoulder"], hand: ["hand", "palm"], head: ["head"],
  blind: ["blind", "eyes", "sapphires"], dead: ["dead", "dies", "died", "death"], closed: ["asleep", "sleeps"],
  stone: ["grey", "shabby", "stripped", "dull"], gold: ["gold", "gilded", "golden"],
};

export function stemWord(word: string): string {
  return stem(word);
}

function stem(word: string): string {
  let w = word;
  for (const suffix of ["ingly", "edly", "ing", "ed", "es", "s", "ly"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

export function salientWords(claimText: string): string[] {
  const out: string[] = [];
  for (const w of words(claimText)) {
    if (STOP.has(w)) continue;
    if (w.length < 4 && !/^\d+$/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export interface ClaimEvidence {
  claim: string;
  salient: string[];
  found: string[];
  missing: string[];
  ratio: number;
}

export function claimEvidence(
  spec: MangaPageSpec,
  claims: readonly Claim[],
  cast: readonly CastMember[],
  locations: readonly LocationSpec[] = [],
): ClaimEvidence[] {
  const evidence = new Set<string>();
  const add = (text: string) => words(text).forEach((w) => evidence.add(stem(w)));
  const addVisual = (key: string | undefined) => {
    if (!key) return;
    (VISUAL_WORDS[key] ?? []).forEach((w) => evidence.add(stem(w)));
  };
  const castById = new Map(cast.map((c) => [c.id, c]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  for (const panel of spec.panels ?? []) {
    for (const text of panel.text ?? []) if (typeof text?.text === "string") add(text.text);
    const loc = locById.get(panel?.location);
    if (loc) {
      add(`${loc.name} ${loc.environment.replace(/_/g, " ")}`);
      for (const feature of loc.features ?? []) add(feature.replace(/_/g, " "));
    }
    for (const key of panel.fx ?? []) addVisual(key);
    if (panel?.weather) addVisual(panel.weather);
    for (const fig of panel.figures ?? []) {
      const member = castById.get(fig?.character);
      if (member) {
        add(`${member.name} ${member.role}`);
        const material = (member.look as { material?: string }).material;
        if (material && material !== "flesh") add(`statue ${material}`);
        addVisual(material);
      }
      addVisual(fig?.pose);
      addVisual(fig?.expression);
      addVisual(fig?.on?.part);
      if (fig?.on?.target) add(String(fig.on.target).replace(/^c_/, "").replace(/_/g, " "));
      addVisual(fig?.variant?.eyes);
      addVisual(fig?.variant?.material);
      if (fig?.holding) (PROP_WORDS[fig.holding] ?? [fig.holding]).forEach((w) => evidence.add(stem(w)));
    }
    for (const prop of panel.props ?? []) (PROP_WORDS[prop?.prop] ?? [String(prop?.prop ?? "")]).forEach((w) => evidence.add(stem(w)));
  }
  return claims.map((claim) => {
    const salient = salientWords(claim.text);
    const found = salient.filter((w) => evidence.has(stem(w)));
    const missing = salient.filter((w) => !evidence.has(stem(w)));
    return { claim: claim.id, salient, found, missing, ratio: salient.length ? found.length / salient.length : 1 };
  });
}

/** Calibrated on acceptance run 2 (38 pages judged): below 0.25 the claim is clearly absent. */
export const CLAIM_EVIDENCE_ERROR = 0.25;
export const CLAIM_EVIDENCE_WARN = 0.45;

export function claimEvidenceIssues(
  spec: MangaPageSpec,
  claims: readonly Claim[],
  cast: readonly CastMember[],
  locations: readonly LocationSpec[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const e of claimEvidence(spec, claims, cast, locations)) {
    const missing = e.missing.slice(0, 8).map((w) => `"${w}"`).join(", ");
    if (e.salient.length >= 6 && e.ratio < CLAIM_EVIDENCE_ERROR) {
      issues.push({
        code: "CLAIM_NOT_EVIDENT",
        severity: "error",
        path: "page.claims",
        message: `a reader could not learn claim ${e.claim} from this page: it never shows or says ${missing}. Put the claim's key facts into a line or caption (or draw the object), in the panel that shows it.`,
      });
    } else if (e.salient.length >= 3 && e.ratio < CLAIM_EVIDENCE_WARN) {
      issues.push({
        code: "CLAIM_THIN",
        severity: "warning",
        path: "page.claims",
        message: `claim ${e.claim} is only partly on the page; it never shows or says ${missing}. Check that every part of the claim reaches the reader.`,
      });
    }
  }
  return issues;
}
