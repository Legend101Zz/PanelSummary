/**
 * Staging: where a figure stands when it is not simply on the panel's ground.
 *
 * - `FigureSpec.on` with a cast target puts a figure on part of another figure
 *   in the same panel (a swallow on the prince's shoulder, at his feet, on his
 *   hand or head). The small figure keeps the target's world scale.
 * - `FigureSpec.on` with an environment feature puts it on or at that feature
 *   (a statue on its column, a sick boy in bed, a seat at a fountain).
 * - Automatic rules, applied only when `on` is absent:
 *   a gold/stone/bronze cast member in a location with a statue column stands
 *   on the column in EVERY shot (never at street level) unless it lies or
 *   falls; a small creature sharing the panel with that statue stands, perches
 *   or lies on the statue (at its feet in ground shots, on its shoulder in
 *   close-range shots, or on the part the panel's beat names); a lying figure
 *   in a location with a bed lies in the bed.
 *
 * The composer resolves staging here, then frames and draws.
 */
import type { CastMember, EnvFeature, Environment, LocationSpec, PerchPart, Pose, Shot } from "../contracts.js";
import type { SeatKind } from "../internal.js";
import { INK, PAPER } from "../style.js";
import { n } from "../svg.js";

/** Environment features a figure can be staged on (`on.target`). */
export const STAGING_FEATURES = ["statue_column", "bed", "table", "fountain", "bridge"] as const satisfies readonly EnvFeature[];
export type StagingFeature = (typeof STAGING_FEATURES)[number];

export const GROUND_SHOTS: readonly Shot[] = ["establishing", "wide", "full"];
/** Shots framed around faces (the statue is then seen from up at its own height). */
export const CLOSE_SHOTS: readonly Shot[] = ["medium", "close", "extreme_close"];

/** Poses that leave the ground (never auto-staged on a surface). */
export const AIRBORNE: ReadonlySet<Pose> = new Set(["fly", "jump", "fall"]);

export type Staging =
  | { type: "ground" }
  | { type: "figure"; target: string; part: PerchPart; auto: boolean }
  | { type: "feature"; feature: StagingFeature; auto: boolean };

export function isStatue(cast: CastMember): boolean {
  const look = cast.look as { kind: string; material?: string };
  return look.kind === "human" && (look.material === "gold" || look.material === "stone" || look.material === "bronze");
}

/**
 * The statue that stands on a location's column (a fixed set piece): the
 * gold/stone/bronze cast member whose description mentions a column (or a
 * pedestal), else the only statue in the cast, else the first one.
 */
export function locationStatue(cast: readonly CastMember[], location: LocationSpec | undefined): CastMember | undefined {
  if (!location || !(location.features ?? []).includes("statue_column")) return undefined;
  const statues = cast.filter((c) => c?.look && isStatue(c));
  if (statues.length === 0) return undefined;
  const mentions = statues.filter((c) => /\b(column|pedestal|plinth|pillar)s?\b/i.test(`${c.description ?? ""} ${c.role ?? ""}`));
  return mentions[0] ?? statues[0];
}

/** A beat that says the column is empty (the statue pulled down, melted, gone). */
export function statueGone(beat: string): boolean {
  return /\b(pull(ed|s|ing)? (him |it |the statue )?down|melt(ed|s|ing)?|empty (column|pedestal|plinth)|no longer (on|there)|taken down|removed)\b/i.test(beat);
}

/** A perch part named by a panel beat ("between the statue's feet", "on his shoulder"). */
export function partFromBeat(beat: string): PerchPart | undefined {
  const b = beat.toLowerCase();
  if (/\bshoulders?\b/.test(b)) return "shoulder";
  if (/\b(feet|foot|toes)\b/.test(b)) return "feet";
  return undefined;
}

/** Default part when `on` names a figure without a part: small creatures perch on the shoulder. */
export function defaultPart(dependentHeight: number, targetHeight: number): PerchPart {
  return dependentHeight <= targetHeight * 0.3 ? "shoulder" : "feet";
}

export interface StagingInput {
  character: string;
  pose: Pose;
  on?: { target?: unknown; part?: unknown };
  /** The cast member as drawn in this panel (variant merged). */
  cast: CastMember;
  /** Nominal heights (figure units) for the default-part rule. */
  height: number;
  /** Small creature (bird, insect, small animal) that can perch beside someone. */
  small?: boolean;
}

/**
 * Resolve every figure's staging. Invalid anchors (unknown target, self,
 * cycles) fall back to the ground; validation reports them. `beat` (the
 * panel's one-sentence beat) may name the part a small creature perches on.
 */
export function resolveStaging(
  figs: readonly StagingInput[],
  location: LocationSpec | undefined,
  shot: Shot,
  beat = "",
  speakers: ReadonlySet<string> = new Set(),
): Staging[] {
  const features = new Set<string>(location?.features ?? []);
  const byChar = new Map(figs.map((f, i) => [f.character, i]));
  const out: Staging[] = figs.map((f) => {
    const on = f.on;
    if (on && typeof on.target === "string") {
      const t = on.target;
      if (t !== f.character && byChar.has(t)) {
        const target = figs[byChar.get(t) as number];
        const part = typeof on.part === "string" && ["feet", "shoulder", "hand", "head"].includes(on.part) ? (on.part as PerchPart) : defaultPart(f.height, target.height);
        return { type: "figure", target: t, part, auto: false };
      }
      if ((STAGING_FEATURES as readonly string[]).includes(t) && features.has(t)) {
        return { type: "feature", feature: t as StagingFeature, auto: false };
      }
      return { type: "ground" };
    }
    // a statue in its column's location is never at street level
    if (isStatue(f.cast) && features.has("statue_column") && shot !== "insert" && f.pose !== "lie" && f.pose !== "fall") {
      return { type: "feature", feature: "statue_column", auto: true };
    }
    if (f.pose === "lie" && features.has("bed")) return { type: "feature", feature: "bed", auto: true };
    // a small creature the beat puts on the table stands on the table top
    if (f.small && !AIRBORNE.has(f.pose) && features.has("table") && /\b(?:on|onto|upon)\s+(?:the|a|her|his|their)\s+table\b/i.test(beat)) {
      return { type: "feature", feature: "table", auto: true };
    }
    return { type: "ground" };
  });
  // a small creature in a panel where someone stands on the column is up
  // there with the statue: at its feet (ground shots, a lying bird), on its
  // shoulder (close-range shots), or on the part the beat names
  const column = figs.findIndex((_, i) => out[i].type === "feature" && (out[i] as { feature: string }).feature === "statue_column");
  if (column >= 0 && shot !== "insert") {
    const named = partFromBeat(beat);
    figs.forEach((f, i) => {
      if (i === column || out[i].type !== "ground" || f.on) return;
      if (!f.small || AIRBORNE.has(f.pose) || f.height > figs[column].height * 0.35) return;
      // A creature that SPEAKS in a close-range panel keeps the writer's slot:
      // the panel is already "up high", and moving it onto the statue's
      // shoulder covers the face and crosses the conversation's tails.
      if (speakers.has(f.character) && !named && !GROUND_SHOTS.includes(shot)) return;
      const part: PerchPart = f.pose === "lie" ? "feet" : (named ?? (GROUND_SHOTS.includes(shot) ? "feet" : "shoulder"));
      out[i] = { type: "figure", target: figs[column].character, part, auto: true };
    });
  }
  // break cycles among figure targets (a on b, b on a): the later one drops to the ground
  out.forEach((s, i) => {
    const seen = new Set<number>([i]);
    let cur: Staging = s;
    while (cur.type === "figure") {
      const j = byChar.get(cur.target) as number;
      if (seen.has(j)) {
        out[i] = { type: "ground" };
        break;
      }
      seen.add(j);
      cur = out[j];
    }
  });
  return out;
}

/** Seat drawn under a sitting human, by environment. */
export function seatKindFor(env: Environment | undefined): SeatKind | undefined {
  switch (env) {
    case "palace_hall":
      return "throne";
    case "room_poor":
    case "room_rich":
    case "garret":
    case "study":
    case "classroom":
    case "courtroom":
    case "town_hall":
    case "cottage":
    case "mill":
    case "abstract":
    case "void":
      return "chair";
    case "jail_cell":
    case "church":
      return "bench";
    case "sky":
      return undefined;
    default:
      return "bench";
  }
}

/** Seat contact height (figure units, negative) of the human rig's "sit" pose for a figure of this nominal height. */
export const ADULT_SEAT_Y = -24.5;
export function seatContact(nominalHeight: number): number {
  return (ADULT_SEAT_Y * Math.max(20, nominalHeight)) / 100;
}

/** Mattress top above the floor, in figure units (adult = 100 units ≈ 1.75 m). */
export const BED_HEIGHT = 26;

export interface LyingBody {
  /** Head centre and radius (figure units, facing right). */
  head: { x: number; y: number };
  r: number;
  left: number;
  right: number;
  top: number;
}

/**
 * A simple bed for a lying figure, in the figure's own space (it scales and
 * mirrors with it). The figure lies on y=0 (the mattress top). `frame` adds a
 * headboard, rail and legs down to the floor (used when the floor is in view).
 * Returns what goes under the figure (frame, mattress, pillow) and over it
 * (the blanket and turned-down sheet).
 */
export function bedFor(body: LyingBody, lineWidth: number, frame: boolean): { under: string; over: string } {
  const lw = lineWidth;
  const r = body.r;
  const dir = body.head.x >= (body.left + body.right) / 2 ? 1 : -1;
  const headEnd = dir > 0 ? Math.max(body.right, body.head.x + r * 1.4) + 3 : Math.min(body.left, body.head.x - r * 1.4) - 3;
  const footEnd = dir > 0 ? body.left - 6 : body.right + 6;
  const x0 = Math.min(headEnd, footEnd);
  const x1 = Math.max(headEnd, footEnd);
  const stroke = `stroke="${INK}" stroke-width="${n(lw)}" stroke-linejoin="round"`;
  let under = "";
  if (frame) {
    const wood = "#9a9a9a";
    // headboard and footboard posts, side rail, legs to the floor
    const hb = headEnd;
    const fb = footEnd;
    under += `<path d="M${n(hb - dir * 3)} ${n(BED_HEIGHT)}V${n(-r * 3.2)}H${n(hb)}V${n(BED_HEIGHT)}Z" fill="${wood}" ${stroke}/>`;
    under += `<path d="M${n(fb)} ${n(BED_HEIGHT)}V${n(-r * 1.1)}H${n(fb + dir * 3)}V${n(BED_HEIGHT)}Z" fill="${wood}" ${stroke}/>`;
    under += `<path d="M${n(x0)} ${n(7)}H${n(x1)}V${n(13)}H${n(x0)}Z" fill="${wood}" ${stroke}/>`;
  }
  // mattress
  under += `<path d="M${n(x0)} ${n(-1)}H${n(x1)}V${n(7)}H${n(x0)}Z" fill="${PAPER}" ${stroke}/>`;
  // pillow under the head
  const px = body.head.x + dir * r * 0.25;
  const py = body.head.y + r * 0.62;
  const prx = r * 1.55;
  const pry = r * 0.62;
  under += `<path d="M${n(px - prx)} ${n(py)}C${n(px - prx)} ${n(py - pry * 1.4)} ${n(px + prx)} ${n(py - pry * 1.4)} ${n(px + prx)} ${n(py)}C${n(px + prx)} ${n(py + pry * 1.2)} ${n(px - prx)} ${n(py + pry * 1.2)} ${n(px - prx)} ${n(py)}Z" fill="${PAPER}" ${stroke}/>`;
  // blanket from the feet to the chest, bulging over the body, with a turned-down sheet
  const chest = body.head.x - dir * r * 1.55;
  const bx0 = Math.min(footEnd + dir * 1, chest);
  const bx1 = Math.max(footEnd + dir * 1, chest);
  const topY = Math.min(-4, body.top * 0.72);
  const bulge = topY - 2;
  const blanket = `M${n(bx0)} ${n(8)}L${n(bx0)} ${n(topY * 0.55)}Q${n(bx0 + (bx1 - bx0) * 0.2)} ${n(bulge)} ${n((bx0 + bx1) / 2)} ${n(topY)}Q${n(bx1 - (bx1 - bx0) * 0.15)} ${n(bulge)} ${n(bx1)} ${n(topY * 0.9)}L${n(bx1)} ${n(8)}Z`;
  let over = `<path d="${blanket}" fill="#d9d9d9" ${stroke}/>`;
  // folds
  const fx = (t: number) => bx0 + (bx1 - bx0) * t;
  over += `<path d="M${n(fx(0.3))} ${n(topY * 0.7)}Q${n(fx(0.36))} ${n(2)} ${n(fx(0.33))} ${n(7)}M${n(fx(0.62))} ${n(topY * 0.8)}Q${n(fx(0.58))} ${n(2)} ${n(fx(0.64))} ${n(7)}" fill="none" stroke="${INK}" stroke-width="${n(lw * 0.55)}" stroke-linecap="round"/>`;
  // turned-down sheet at the chest end
  const sw = r * 0.55;
  const sx0 = dir > 0 ? bx1 - sw : bx0;
  over += `<path d="M${n(sx0)} ${n(8)}V${n(topY * 0.92)}Q${n(sx0 + sw / 2)} ${n(topY * 1.08)} ${n(sx0 + sw)} ${n(topY * 0.92)}V${n(8)}Z" fill="${PAPER}" ${stroke}/>`;
  return { under, over };
}
