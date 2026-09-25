/**
 * validatePage: checks a MangaPageSpec (as untrusted JSON) against the
 * contract, the book's cast/locations, the rigs' supported poses and
 * expressions, craft limits (panel/figure/word counts) and, when given, the
 * planned page. Every message says what to change.
 */
import {
  ANGLES,
  DEPTHS,
  FACINGS,
  FIDELITY,
  FX,
  EXPRESSIONS,
  POSES,
  PROPS,
  SHOTS,
  SLOTS,
  TEXT_KINDS,
  TIMES,
  WEATHERS,
  type CastMember,
  type CharacterLook,
  type LayoutSpec,
  type LocationSpec,
  type PlannedPage,
  type TextKind,
  type ValidationIssue,
} from "../contracts.js";
import { rig } from "../rig/index.js";
import { compileLayout, MAX_PANELS, templatesWithSlots, validateTree } from "../layout/index.js";
import { countWords } from "../lettering/breaking.js";
import { MAX_FIGURES, MAX_FX, MAX_PROPS } from "../scene/compose.js";
import { checkEnum, checkSourceRef, isRecord, Issues, listValues, reqArray, reqBoolean, reqPositiveInt, reqString, show, warnUnknownKeys } from "./util.js";

export interface BookRefs {
  cast: readonly CastMember[];
  locations: readonly LocationSpec[];
}

export const WORD_LIMITS = {
  balloonWarn: 25,
  balloonError: 40,
  panelWarn: 40,
  panelError: 60,
  pageWarn: 110,
  pageError: 150,
  sfxWarn: 3,
  sfxError: 6,
} as const;

export const SPEAKER_KINDS: readonly TextKind[] = ["speech", "thought", "shout", "whisper"];

const PAGE_KEYS = ["schema", "page_number", "section_id", "purpose", "layout", "panels", "claims", "page_turn_hook"];
const PANEL_KEYS = ["id", "beat", "shot", "angle", "location", "time", "weather", "figures", "props", "fx", "text", "source"];
const FIGURE_KEYS = ["character", "pose", "expression", "facing", "slot", "depth", "holding"];
const PROP_KEYS = ["prop", "slot", "depth"];
const TEXT_KEYS = ["kind", "speaker", "text", "fidelity", "source"];
const LAYOUT_KEYS = ["template", "tree", "rtl"];

function supported<T>(fn: () => readonly T[]): readonly T[] | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function validatePage(spec: unknown, book: BookRefs, planned?: PlannedPage): ValidationIssue[] {
  const issues = new Issues();
  if (!isRecord(spec)) {
    issues.error("PAGE_NOT_OBJECT", "page", `the page must be a JSON object with fields: ${PAGE_KEYS.join(", ")}.`);
    return issues.list;
  }
  if (spec.schema !== "manga-page.v1") {
    issues.error("SCHEMA", "page", `"schema" must be "manga-page.v1", got ${show(spec.schema)}.`);
  }
  const pageNumber = reqPositiveInt(spec, "page_number", issues, "page");
  const sectionId = reqString(spec, "section_id", issues, "page", "the section this page adapts");
  reqString(spec, "purpose", issues, "page", "the single beat this page carries");
  const hook = reqBoolean(spec, "page_turn_hook", issues, "page");
  warnUnknownKeys(spec, PAGE_KEYS, issues, "page");

  // claims
  const claimsRaw = reqArray(spec, "claims", issues, "page", "claim ids from the adaptation plan");
  const claims: string[] = [];
  claimsRaw?.forEach((c, i) => {
    if (typeof c !== "string" || c.trim() === "") issues.error("FIELD_TYPE", `page.claims[${i}]`, `claim ids must be non-empty strings, got ${show(c)}.`);
    else claims.push(c);
  });

  const castById = new Map(book.cast.map((c) => [c.id, c]));
  const locationIds = new Set(book.locations.map((l) => l.id));
  const plannedUnits = planned ? new Set(planned.units) : undefined;

  // panels
  const panelsRaw = reqArray(spec, "panels", issues, "page", `1-${MAX_PANELS} panels in reading order`);
  const panelIds: string[] = [];
  let pageWords = 0;
  if (panelsRaw) {
    if (panelsRaw.length < 1 || panelsRaw.length > MAX_PANELS) {
      issues.error(
        "PANEL_COUNT",
        "page.panels",
        `a page needs 1-${MAX_PANELS} panels, got ${panelsRaw.length}.${panelsRaw.length > MAX_PANELS ? " Merge beats or move some panels to another page." : ""}`,
      );
    }
    const seenIds = new Set<string>();
    panelsRaw.forEach((raw, pi) => {
      const pid = isRecord(raw) && typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : undefined;
      const path = pid ? `panel ${pid}` : `page.panels[${pi}]`;
      if (!isRecord(raw)) {
        issues.error("PANEL_NOT_OBJECT", path, `each panel must be an object with fields: ${PANEL_KEYS.join(", ")}.`);
        return;
      }
      const id = reqString(raw, "id", issues, path, "unique panel id such as \"p1\"");
      if (id) {
        if (seenIds.has(id)) issues.error("DUPLICATE_PANEL_ID", path, `panel id "${id}" is used more than once; give every panel a unique id.`);
        seenIds.add(id);
        panelIds.push(id);
      }
      warnUnknownKeys(raw, PANEL_KEYS, issues, path);
      reqString(raw, "beat", issues, path, "what this panel shows, one sentence");
      const shot = checkEnum(raw, "shot", SHOTS, issues, path);
      checkEnum(raw, "angle", ANGLES, issues, path);
      checkEnum(raw, "time", TIMES, issues, path, false);
      checkEnum(raw, "weather", WEATHERS, issues, path, false);
      const loc = reqString(raw, "location", issues, path, "a location id from the book");
      if (loc && !locationIds.has(loc)) {
        issues.error("UNKNOWN_LOCATION", path, `location "${loc}" is not in the book; use one of: ${listValues([...locationIds])}.`);
      } else if (loc && planned && !planned.locations.includes(loc)) {
        issues.warn("LOCATION_NOT_PLANNED", path, `location "${loc}" is not among this page's planned locations (${listValues(planned.locations)}).`);
      }

      // figures
      const figures = reqArray(raw, "figures", issues, path, "characters drawn in this panel");
      const figureChars = new Set<string>();
      const slotDepth = new Set<string>();
      let heldProps = 0;
      if (figures && figures.length > MAX_FIGURES) {
        issues.error("TOO_MANY_FIGURES", path, `${figures.length} figures in one panel; the maximum is ${MAX_FIGURES}. Use a crowd character or split the panel.`);
      }
      figures?.forEach((f, fi) => {
        const fpath = `${path} figure ${fi}`;
        if (!isRecord(f)) {
          issues.error("FIGURE_NOT_OBJECT", fpath, `each figure must be an object with fields: ${FIGURE_KEYS.join(", ")}.`);
          return;
        }
        warnUnknownKeys(f, FIGURE_KEYS, issues, fpath);
        const charId = reqString(f, "character", issues, fpath, "a cast id");
        const cast = charId ? castById.get(charId) : undefined;
        if (charId && !cast) {
          issues.error("UNKNOWN_CAST", fpath, `character "${charId}" is not in the cast; use one of: ${listValues([...castById.keys()])}.`);
        }
        if (charId) {
          if (figureChars.has(charId)) issues.error("DUPLICATE_FIGURE", fpath, `character "${charId}" appears twice in this panel; draw each character once per panel.`);
          figureChars.add(charId);
          if (planned && cast && !planned.cast.includes(charId)) {
            issues.warn("CAST_NOT_PLANNED", fpath, `character "${charId}" is not among this page's planned cast (${listValues(planned.cast)}).`);
          }
        }
        const pose = checkEnum(f, "pose", POSES, issues, fpath);
        const expression = checkEnum(f, "expression", EXPRESSIONS, issues, fpath);
        checkEnum(f, "facing", FACINGS, issues, fpath);
        const slot = checkEnum(f, "slot", SLOTS, issues, fpath);
        const depth = checkEnum(f, "depth", DEPTHS, issues, fpath, false) ?? "mid";
        const holding = checkEnum(f, "holding", PROPS, issues, fpath, false);
        if (holding) heldProps += 1;
        if (slot) {
          const key = `${slot}|${depth}`;
          if (slotDepth.has(key)) issues.warn("FIGURE_OVERLAP", fpath, `two figures share slot "${slot}" at depth "${depth}" and will overlap; move one to another slot or depth.`);
          slotDepth.add(key);
        }
        if (cast) {
          const look = cast.look as CharacterLook;
          const poses = supported(() => rig.supportedPoses(look));
          if (pose && poses && !poses.includes(pose)) {
            issues.error("POSE_UNSUPPORTED", fpath, `pose "${pose}" is not available for ${cast.id} (${look.kind}); use one of: ${listValues(poses)}.`);
          }
          const exprs = supported(() => rig.supportedExpressions(look));
          if (expression && exprs && !exprs.includes(expression)) {
            issues.error("EXPRESSION_UNSUPPORTED", fpath, `expression "${expression}" is not available for ${cast.id} (${look.kind}); use one of: ${listValues(exprs)}.`);
          }
        }
      });

      // props
      const props = reqArray(raw, "props", issues, path, "objects on the ground");
      if (props && props.length > MAX_PROPS) {
        issues.error("TOO_MANY_PROPS", path, `${props.length} props in one panel; the maximum is ${MAX_PROPS}.`);
      }
      props?.forEach((p, i) => {
        const ppath = `${path} prop ${i}`;
        if (!isRecord(p)) {
          issues.error("PROP_NOT_OBJECT", ppath, `each prop must be an object {"prop": ..., "slot": ..., "depth"?: ...}.`);
          return;
        }
        warnUnknownKeys(p, PROP_KEYS, issues, ppath);
        checkEnum(p, "prop", PROPS, issues, ppath);
        checkEnum(p, "slot", SLOTS, issues, ppath);
        checkEnum(p, "depth", DEPTHS, issues, ppath, false);
      });

      // fx
      const fx = reqArray(raw, "fx", issues, path, "effects");
      if (fx && fx.length > MAX_FX) issues.error("TOO_MANY_FX", path, `${fx.length} fx in one panel; the maximum is ${MAX_FX}. Keep the one or two that carry the mood.`);
      const seenFx = new Set<string>();
      fx?.forEach((e, i) => {
        if (typeof e !== "string" || !(FX as readonly string[]).includes(e)) {
          issues.error("ENUM_INVALID", `${path} fx ${i}`, `fx ${show(e)} is not allowed; use one of: ${listValues(FX)}.`);
        } else if (seenFx.has(e)) {
          issues.warn("DUPLICATE_VALUE", `${path} fx ${i}`, `fx "${e}" is listed twice; list it once.`);
        } else seenFx.add(e);
      });

      // shot-specific
      if (shot === "insert") {
        if ((props?.length ?? 0) === 0 && heldProps === 0) {
          issues.warn("INSERT_WITHOUT_PROP", path, `an insert shot draws the panel's first prop (or a held prop) large; add a prop or choose another shot.`);
        }
        if ((figures?.length ?? 0) > 0) {
          issues.warn("INSERT_HIDES_FIGURES", path, `insert shots do not draw figures; their speech gets an off-panel tail. Use "close" to show a character with the object.`);
        }
      }

      // text
      const texts = reqArray(raw, "text", issues, path, "lettering in reading order");
      let panelWords = 0;
      texts?.forEach((t, ti) => {
        const tpath = `${path} text ${ti}`;
        if (!isRecord(t)) {
          issues.error("TEXT_NOT_OBJECT", tpath, `each text must be an object with fields: ${TEXT_KEYS.join(", ")}.`);
          return;
        }
        warnUnknownKeys(t, TEXT_KEYS, issues, tpath);
        const kind = checkEnum(t, "kind", TEXT_KINDS, issues, tpath);
        const body = reqString(t, "text", issues, tpath, "the words to letter");
        const fidelity = checkEnum(t, "fidelity", FIDELITY, issues, tpath);
        const speaker = t.speaker;
        if (kind && SPEAKER_KINDS.includes(kind)) {
          if (speaker === undefined) {
            issues.error("SPEAKER_REQUIRED", tpath, `${kind} needs a "speaker" (a cast id): ${listValues([...castById.keys()])}.`);
          } else if (typeof speaker !== "string" || !castById.has(speaker)) {
            issues.error("SPEAKER_UNKNOWN", tpath, `speaker ${show(speaker)} is not a cast id; use one of: ${listValues([...castById.keys()])}.`);
          } else {
            if (!figureChars.has(speaker)) {
              issues.warn(
                "SPEAKER_OFF_PANEL",
                tpath,
                `speaker "${speaker}" is not drawn in this panel, so the ${kind} tail will point off-panel. Add them to "figures" if they should be seen speaking.`,
              );
            }
            const look = castById.get(speaker)?.look;
            if (look?.kind === "emblem" && fidelity && fidelity !== "metaphor") {
              issues.error("EMBLEM_FIDELITY", tpath, `"${speaker}" is an emblem (an abstract idea); anything it says must have fidelity "metaphor".`);
            }
          }
        } else if (kind && speaker !== undefined) {
          issues.error("SPEAKER_FORBIDDEN", tpath, `${kind} must not have a "speaker"; remove it (only ${SPEAKER_KINDS.join("/")} have speakers).`);
        }
        if (t.source !== undefined) {
          const unit = checkSourceRef(t.source, issues, `${tpath}.source`);
          if (unit && plannedUnits && !plannedUnits.has(unit)) {
            issues.warn("SOURCE_NOT_IN_PLAN", `${tpath}.source`, `unit "${unit}" is not one of this page's planned units (${listValues([...plannedUnits])}).`);
          }
        } else if (fidelity === "quote" || fidelity === "paraphrase") {
          issues.error("TEXT_SOURCE_MISSING", tpath, `${fidelity} text needs a "source" {"unit", "page"} pointing at the passage it comes from.`);
        }
        if (body) {
          if (body.includes("\n")) issues.warn("TEXT_NEWLINE", tpath, `line breaks are computed by the renderer; remove "\\n" from the text.`);
          const words = countWords(body);
          if (kind === "sfx") {
            if (words > WORD_LIMITS.sfxError) issues.error("SFX_TOO_LONG", tpath, `sfx has ${words} words; SFX are 1-${WORD_LIMITS.sfxWarn} sound words (e.g. "FLAP FLAP"). Move the rest to speech or narration.`);
            else if (words > WORD_LIMITS.sfxWarn) issues.warn("SFX_TOO_LONG", tpath, `sfx has ${words} words; keep SFX to 1-${WORD_LIMITS.sfxWarn} sound words.`);
          } else {
            panelWords += words;
            if (words > WORD_LIMITS.balloonError) {
              issues.error("WORDS_BALLOON", tpath, `${words} words in one ${kind ?? "text"}; the limit is ${WORD_LIMITS.balloonError} (aim for ≤${WORD_LIMITS.balloonWarn}, ideally ≤12). Cut it or split it across panels.`);
            } else if (words > WORD_LIMITS.balloonWarn) {
              issues.warn("WORDS_BALLOON", tpath, `${words} words in one ${kind ?? "text"}; aim for ≤${WORD_LIMITS.balloonWarn} (ideally ≤12).`);
            }
          }
        }
      });
      pageWords += panelWords;
      if (panelWords > WORD_LIMITS.panelError) {
        issues.error("WORDS_PANEL", path, `${panelWords} words in this panel; the limit is ${WORD_LIMITS.panelError} (aim for ≤${WORD_LIMITS.panelWarn}, ideally ≤25). Cut text or move it to another panel.`);
      } else if (panelWords > WORD_LIMITS.panelWarn) {
        issues.warn("WORDS_PANEL", path, `${panelWords} words in this panel; aim for ≤${WORD_LIMITS.panelWarn} (ideally ≤25).`);
      }
      if ((texts?.length ?? 0) === 0 && (figures?.length ?? 0) === 0 && !(shot === "insert" && ((props?.length ?? 0) > 0))) {
        issues.error("EMPTY_PANEL", path, `this panel has no figures and no text; give it at least one figure or one text (an insert shot needs a prop).`);
      }

      // sources
      const sources = reqArray(raw, "source", issues, path, "source refs for what this panel shows");
      if (sources && sources.length === 0) {
        issues.error("SOURCE_MISSING", path, `every panel needs at least one source {"unit", "page"} for what it shows.`);
      }
      sources?.forEach((s, si) => {
        const unit = checkSourceRef(s, issues, `${path} source ${si}`);
        if (unit && plannedUnits && !plannedUnits.has(unit)) {
          issues.warn("SOURCE_NOT_IN_PLAN", `${path} source ${si}`, `unit "${unit}" is not one of this page's planned units (${listValues([...plannedUnits])}).`);
        }
      });
    });
  }
  if (pageWords > WORD_LIMITS.pageError) {
    issues.error("WORDS_PAGE", "page", `${pageWords} words on this page; the limit is ${WORD_LIMITS.pageError} (aim for ≤${WORD_LIMITS.pageWarn}, ideally ~60). Cut text or spread the beat over two pages.`);
  } else if (pageWords > WORD_LIMITS.pageWarn) {
    issues.warn("WORDS_PAGE", "page", `${pageWords} words on this page; aim for ≤${WORD_LIMITS.pageWarn} (ideally ~60).`);
  }

  // layout
  const layout = spec.layout;
  if (layout === undefined) {
    issues.error("FIELD_MISSING", "page.layout", `missing "layout": {"template": "<id>"} or {"tree": {...}}. Templates for ${panelIds.length} panels: ${templatesWithSlots(panelIds.length).map((t) => t.id).join(", ") || "none"}.`);
  } else if (!isRecord(layout)) {
    issues.error("FIELD_TYPE", "page.layout", `"layout" must be an object {"template": "<id>"} or {"tree": {...}}, optional "rtl": true.`);
  } else {
    warnUnknownKeys(layout, LAYOUT_KEYS, issues, "page.layout");
    if (layout.rtl !== undefined && typeof layout.rtl !== "boolean") {
      issues.error("FIELD_TYPE", "page.layout", `"rtl" must be true or false.`);
    }
    if (layout.template !== undefined && typeof layout.template !== "string") {
      issues.error("FIELD_TYPE", "page.layout.template", `"template" must be a template id string.`);
    } else if (panelsRaw && panelIds.length === panelsRaw.length && panelIds.length > 0) {
      if (layout.tree !== undefined && layout.template === undefined) {
        const treeIssues = validateTree(layout.tree, panelIds, "page.layout.tree");
        if (treeIssues.length > 0) issues.push(...treeIssues);
        else issues.push(...compileLayout(layout as LayoutSpec, panelIds).issues);
      } else {
        issues.push(...compileLayout(layout as LayoutSpec, panelIds).issues);
      }
    }
  }

  // plan agreement
  if (planned) {
    if (pageNumber !== undefined && pageNumber !== planned.page_number) {
      issues.error("PLAN_PAGE_NUMBER", "page", `page_number is ${pageNumber} but the plan says ${planned.page_number}.`);
    }
    if (sectionId !== undefined && sectionId !== planned.section_id) {
      issues.error("PLAN_SECTION", "page", `section_id is "${sectionId}" but the planned page belongs to "${planned.section_id}".`);
    }
    const planClaims = new Set(planned.claims);
    const missing = planned.claims.filter((c) => !claims.includes(c));
    const extra = claims.filter((c) => !planClaims.has(c));
    if (missing.length > 0) {
      issues.error("PLAN_CLAIMS_MISSING", "page.claims", `the plan assigns claims ${missing.map((c) => `"${c}"`).join(", ")} to this page; convey them and list them in "claims".`);
    }
    if (extra.length > 0) {
      issues.error("PLAN_CLAIMS_EXTRA", "page.claims", `claims ${extra.map((c) => `"${c}"`).join(", ")} are not planned for this page; remove them (planned: ${planned.claims.join(", ") || "none"}).`);
    }
    if (hook !== undefined && hook !== planned.page_turn_hook) {
      issues.warn("PLAN_HOOK", "page", `page_turn_hook is ${hook} but the plan says ${planned.page_turn_hook}.`);
    }
  }
  return issues.list;
}
