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
 *   on the column in establishing/wide/full shots; a lying figure in a
 *   location with a bed lies in the bed.
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

export type Staging =
  | { type: "ground" }
  | { type: "figure"; target: string; part: PerchPart; auto: boolean }
  | { type: "feature"; feature: StagingFeature; auto: boolean };

export function isStatue(cast: CastMember): boolean {
  const look = cast.look as { kind: string; material?: string };
  return look.kind === "human" && (look.material === "gold" || look.material === "stone" || look.material === "bronze");
}

/** Default part when `on` names a figure without a part: small creatures perch on the shoulder. */
export function defaultPart(dependentHeight: number, targetHeight: number): PerchPart {
  return dependentHeight <= targetHeight * 0.3 ? "shoulder" : "feet";
}

export interface StagingInput {
  character: string;
  pose: Pose;
  on?: { target?: unknown; part?: unknown };
  cast: CastMember;
  /** Nominal heights (figure units) for the default-part rule. */
  height: number;
  /** Small creature (bird, insect, small animal) that can perch beside someone. */
  small?: boolean;
}

/**
 * Resolve every figure's staging. `drawn` are the characters drawn in this
 * panel (in spec order). Invalid anchors (unknown target, self, cycles) fall
 * back to the ground; validation reports them.
 */
export function resolveStaging(figs: readonly StagingInput[], location: LocationSpec | undefined, shot: Shot): Staging[] {
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
    if (isStatue(f.cast) && features.has("statue_column") && GROUND_SHOTS.includes(shot) && f.pose !== "lie") {
      return { type: "feature", feature: "statue_column", auto: true };
    }
    if (f.pose === "lie" && features.has("bed")) return { type: "feature", feature: "bed", auto: true };
    return { type: "ground" };
  });
  // a small creature perching in a shot where someone stands on the column
  // perches at that statue's feet, not on the ground far below
  const column = figs.findIndex((_, i) => out[i].type === "feature" && (out[i] as { feature: string }).feature === "statue_column");
  if (column >= 0 && GROUND_SHOTS.includes(shot)) {
    figs.forEach((f, i) => {
      if (i === column || out[i].type !== "ground" || f.on) return;
      if (f.small && (f.pose === "perch" || f.pose === "stand") && f.height <= figs[column].height * 0.35) {
        out[i] = { type: "figure", target: figs[column].character, part: "feet", auto: true };
      }
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
