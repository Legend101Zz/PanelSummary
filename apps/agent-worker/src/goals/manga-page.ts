import { DEFAULT_GOAL_MODEL } from "@panelsummary/agent-runtime";
import { castCapabilities, catalog, renderPage, validatePage } from "@panelsummary/manga-render";
import type {
  AdaptationPlan,
  BookUnderstanding,
  Claim,
  MangaPageSpec,
  PlannedPage,
  RenderResult,
  ValidationIssue,
} from "@panelsummary/manga-render";
import { svgToPng } from "@panelsummary/manga-render/raster";

import { candidateParameters, dataBlock, errorsOf, formatIssues, parseCandidate, rejection, sourceBlock, warningsOf } from "./common.js";
import { InputError, requireObject, type GoalDefinition } from "./types.js";
import { pageVocabulary } from "./vocabulary.js";
import { claimEvidenceIssues } from "./claim-evidence.js";
import { quoteSpeakerIssues } from "./attribution.js";
import { claimEventIssues, claimOrderIssues } from "./claim-shown.js";
import { expectedLooks, expectedLooksForPrompt, claimPages, figureStateIssues, unitOrder, type ExpectedLook } from "./continuity.js";

/** Severity of FIGURE_STATE_MISMATCH, set from calibration (docs/launch/T1-continuity.md). */
export const FIGURE_STATE_SEVERITY: "error" | "warning" = "error";

interface UnitText {
  id: string;
  page_start: number;
  page_end: number;
  text: string;
}

interface Input {
  book: { title: string; author: string; kind: BookUnderstanding["kind"] };
  cast: BookUnderstanding["cast"];
  locations: BookUnderstanding["locations"];
  page: PlannedPage;
  total_pages: number;
  claims: Claim[];
  units: UnitText[];
  previous?: { page_number: number; beat: string; template?: string; last_panel?: string };
  next?: { page_number: number; beat: string };
  first_appearances: string[];
  /** Set on the first page of a section: its title must be lettered in a caption. */
  opens_section?: { id: string; title: string };
  /** Position of every unit in the book (from the understanding's sections). */
  order: Map<string, number>;
  /** Expected look patch of each cast member with story states, computed from this page's units. */
  expected_looks: Record<string, ExpectedLook>;
}

const MAX_PREVIEWS = 4;

/** Distinct error codes for the trace note (diagnosis of repeated rejections). */
function codesNote(issues: readonly ValidationIssue[]): string {
  const codes = [...new Set(errorsOf(issues).map((issue) => issue.code))].slice(0, 6);
  return codes.length ? ` ${codes.join(",")}` : "";
}

/** Lowercase, straight quotes, letters/digits/spaces only; PDF ligatures (U+FB00-FB06) as plain letters. */
function normalizeWords(text: string): string {
  return text
    .replace(/[\uFB00-\uFB06]/g, (m) => m.normalize("NFKC"))
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A line labelled "quote" must be the book's words: every fragment of it
 * (split at ellipses and dashes) with 3+ words must occur in this page's
 * source text, ignoring case and punctuation.
 */
/** The source sentence sharing the most words with `line` (to help the writer fix a misquote). */
function closestSentence(line: string, sentences: readonly string[]): string | undefined {
  const words = new Set(normalizeWords(line).split(" ").filter((w) => w.length > 2));
  let best: { score: number; sentence: string } | undefined;
  for (const sentence of sentences) {
    const score = normalizeWords(sentence).split(" ").filter((w) => words.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { score, sentence };
  }
  return best?.sentence;
}

export function quoteIssues(spec: MangaPageSpec, units: readonly { text: string }[]): ValidationIssue[] {
  const raw = units.map((u) => u.text).join(" ");
  const source = ` ${normalizeWords(raw)} `;
  const sentences = raw.split(/(?<=[.!?\u201d"])\s+/).map((x) => x.trim()).filter((x) => x.length > 0);
  const issues: ValidationIssue[] = [];
  (spec.panels ?? []).forEach((panel) => {
    (panel.text ?? []).forEach((text, index) => {
      if (text.fidelity !== "quote" || typeof text.text !== "string") return;
      const fragments = text.text
        .split(/\.\.\.|…|--|—/)
        .map((fragment) => normalizeWords(fragment))
        .filter((fragment) => fragment.split(" ").length >= 3);
      const missing = fragments.filter((fragment) => !source.includes(` ${fragment} `));
      if (missing.length > 0) {
        issues.push({
          code: "QUOTE_NOT_IN_SOURCE",
          severity: "error",
          path: `panel ${panel.id} text ${index}`,
          message: `this line is labelled "quote" but "${missing[0].slice(0, 80)}" is not in the source text for this page. Use the book's exact words (you may cut with "..."), or label it "paraphrase" (or "dramatized" for invented dialogue).${(() => {
            const near = closestSentence(text.text, sentences);
            return near ? ` Closest source sentence: "${near.slice(0, 300)}"` : "";
          })()}`,
        });
      }
    });
  });
  return issues;
}

/** A planned "quote" claim is one of the book's defining lines: the page must letter it. */
export function quoteClaimIssues(spec: MangaPageSpec, claims: readonly Claim[]): ValidationIssue[] {
  const quotes = (spec.panels ?? []).flatMap((panel) => (panel.text ?? []).filter((t) => t.fidelity === "quote").map((t) => normalizeWords(t.text ?? "")));
  const issues: ValidationIssue[] = [];
  for (const claim of claims) {
    if (claim.kind !== "quote") continue;
    // The book's line is the quoted span inside the claim ("..." or '...'); a
    // claim with no quoted span is not checked here.
    const inner =
      /["\u201c]([^"\u201d]{8,})["\u201d]/.exec(claim.text)?.[1] ??
      /(?:^|[\s,:])['\u2018](.{8,}?)['\u2019](?=[\s.,;!?]|$)/.exec(claim.text)?.[1];
    if (!inner) continue;
    // "[telling a story with a moral]" is an editor's insertion, not the book's words:
    // demanding it would contradict QUOTE_NOT_IN_SOURCE (acceptance run 8, page 36).
    const want = normalizeWords(inner.replace(/\[[^\]]*\]/g, " ")).split(" ").filter((w) => w.length > 2);
    if (want.length < 3) continue;
    // Long lines may be cut with "...": coverage is measured against at most 14 content words.
    const needed = Math.min(want.length, 14);
    const best = Math.max(0, ...quotes.map((q) => Math.min(1, want.filter((w) => q.includes(w)).length / needed)));
    if (best < 0.6) {
      issues.push({
        code: "QUOTE_CLAIM_MISSING",
        severity: "error",
        path: "page.claims",
        message: `claim ${claim.id} is one of the book's defining lines ("${inner.slice(0, 140)}"). Letter it in a balloon from its speaker with fidelity "quote" (you may cut with "...").`,
      });
    }
  }
  return issues;
}

/** A statue on its column cannot stand among people at street level in a medium/close panel. */
export function statueStagingIssues(spec: MangaPageSpec, cast: BookUnderstanding["cast"], locations: BookUnderstanding["locations"]): ValidationIssue[] {
  const byId = new Map(cast.map((c) => [c.id, c]));
  const locs = new Map(locations.map((l) => [l.id, l]));
  const issues: ValidationIssue[] = [];
  for (const panel of spec.panels ?? []) {
    if (!["medium", "close", "extreme_close"].includes(panel.shot)) continue;
    if (!locs.get(panel.location)?.features?.includes("statue_column")) continue;
    const figs = panel.figures ?? [];
    const isStatue = (id: string) => {
      const look = byId.get(id)?.look as { kind?: string; material?: string } | undefined;
      return look?.kind === "human" && !!look.material && look.material !== "flesh";
    };
    const statue = figs.find((f) => isStatue(f.character));
    if (!statue) continue;
    const people = figs.filter((f) => {
      if (f === statue || isStatue(f.character)) return false;
      const kind = byId.get(f.character)?.look.kind;
      return (kind === "human" || kind === "crowd") && f.on?.target !== statue.character;
    });
    if (people.length > 0) {
      issues.push({
        code: "STATUE_AMONG_PEOPLE",
        severity: "error",
        path: `panel ${panel.id}`,
        message: `${statue.character} stands high on its column, so it cannot share this ${panel.shot} panel with ${people.map((f) => f.character).join(", ")} at street level. Show them looking up at the statue in a "wide" or "full" shot (low angle), or give the statue its own panel.`,
      });
    }
  }
  return issues;
}

/** Every planned claim must be mapped to real panels with a stated method. */
export function claimMapIssues(spec: MangaPageSpec, plannedClaims: readonly string[]): ValidationIssue[] {
  if (plannedClaims.length === 0) return [];
  const panelIds = new Set((spec.panels ?? []).map((panel) => panel.id));
  const map = Array.isArray(spec.claim_map) ? spec.claim_map : [];
  const issues: ValidationIssue[] = [];
  for (const claim of plannedClaims) {
    const entry = map.find((item) => item?.claim === claim);
    if (!entry) {
      issues.push({ code: "CLAIM_MAP_MISSING", severity: "error", path: "page.claim_map", message: `add {"claim": "${claim}", "panels": [...], "how": "..."} saying which panels convey ${claim} and how (picture, line, or both). Every part of the claim must reach the reader.` });
      continue;
    }
    const panels = Array.isArray(entry.panels) ? entry.panels : [];
    if (panels.length === 0 || panels.some((id) => !panelIds.has(id))) {
      issues.push({ code: "CLAIM_MAP_PANELS", severity: "error", path: "page.claim_map", message: `claim_map for ${claim} must list existing panel ids (${[...panelIds].join(", ")}).` });
    }
    if (typeof entry.how !== "string" || entry.how.trim().split(/\s+/).length < 4) {
      issues.push({ code: "CLAIM_MAP_HOW", severity: "error", path: "page.claim_map", message: `claim_map for ${claim}: "how" must say in a sentence how the page conveys it.` });
    }
  }
  return issues;
}

/** Spoken words belong in balloons; conversation keeps its sides (the 180-degree rule). */
export function stagingIssues(spec: MangaPageSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const slotIndex: Record<string, number> = { left: 0, center_left: 1, center: 2, center_right: 3, right: 4 };
  let lastOrder: Map<string, number> | undefined;
  (spec.panels ?? []).forEach((panel) => {
    (panel.text ?? []).forEach((text, index) => {
      if ((text.kind === "narration" || text.kind === "caption") && /["\u201c][^"\u201d]{12,}["\u201d]/.test(text.text ?? "")) {
        issues.push({ code: "SPEECH_IN_NARRATION", severity: "warning", path: `panel ${panel.id} text ${index}`, message: "this box quotes someone speaking; put spoken words in a speech balloon from the drawn speaker so readers see who says them." });
      }
    });
    const figs = (panel.figures ?? []).filter((f) => f && typeof f.character === "string" && f.slot in slotIndex);
    const order = new Map(figs.map((f) => [f.character, slotIndex[f.slot]] as [string, number]));
    if (lastOrder) {
      const shared = [...order.keys()].filter((id) => lastOrder!.has(id));
      for (let i = 0; i < shared.length; i += 1) {
        for (let j = i + 1; j < shared.length; j += 1) {
          const a = shared[i];
          const b = shared[j];
          const before = Math.sign(lastOrder.get(a)! - lastOrder.get(b)!);
          const now = Math.sign(order.get(a)! - order.get(b)!);
          if (before !== 0 && now !== 0 && before !== now) {
            issues.push({ code: "SIDES_SWAPPED", severity: "warning", path: `panel ${panel.id}`, message: `${a} and ${b} swap sides from the previous panel; keep each on the same side through a conversation (the 180-degree rule).` });
          }
        }
      }
    }
    if (figs.length === 2) {
      const [l, r] = [...figs].sort((x, y) => slotIndex[x.slot] - slotIndex[y.slot]);
      const talking = (panel.text ?? []).some((t) => t.speaker === l.character || t.speaker === r.character);
      if (talking && l.facing === "left" && r.facing === "right") {
        issues.push({ code: "BACK_TO_BACK", severity: "warning", path: `panel ${panel.id}`, message: `the two characters talking face away from each other; the one on the left should face "right" and the one on the right "left".` });
      }
    }
    if (figs.length > 0) lastOrder = order;
  });
  return issues;
}

function sectionTitleIssues(spec: MangaPageSpec, opens?: { id: string; title: string }): ValidationIssue[] {
  if (!opens) return [];
  const want = normalizeWords(opens.title).replace(/^(the|a|an) /, "");
  const captions = (spec.panels ?? []).slice(0, 2).flatMap((panel) => (panel.text ?? []).filter((t) => t.kind === "caption" || t.kind === "narration"));
  if (captions.some((t) => normalizeWords(t.text).includes(want))) return [];
  return [
    {
      code: "SECTION_TITLE_MISSING",
      severity: "error",
      path: "panel p1",
      message: `this page opens the section "${opens.title}"; letter its title in a caption in the first panel (for example {"kind": "caption", "text": "${opens.title}", "fidelity": "paraphrase"}) so readers know a new part begins.`,
    },
  ];
}

function introductionIssues(spec: MangaPageSpec, input: Input): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lettering = spec.panels
    .flatMap((panel) => panel.text ?? [])
    .map((text) => text.text.toLowerCase())
    .join(" \n ");
  for (const id of input.first_appearances) {
    const member = input.cast.find((c) => c.id === id);
    if (!member || member.look.kind === "crowd") continue;
    const onPage = spec.panels.some((panel) => (panel.figures ?? []).some((f) => f.character === id));
    if (!onPage) continue;
    const name = member.name.toLowerCase().replace(/^the\s+/, "");
    const key = name.split(/\s+/).find((word) => word.length > 2) ?? name;
    if (!lettering.includes(key)) {
      issues.push({
        code: "CHARACTER_NOT_INTRODUCED",
        severity: "error",
        path: `cast ${id}`,
        message: `${member.name} appears for the first time in the book on this page, but no caption or line names them. Name them where they first appear (for example a caption "${member.name}" or a line that says the name).`,
      });
    }
  }
  return issues;
}

function templateIssues(spec: MangaPageSpec, input: Input): ValidationIssue[] {
  if (input.previous?.template && spec.layout?.template && spec.layout.template === input.previous.template) {
    return [
      {
        code: "REPEATED_LAYOUT",
        severity: "warning",
        path: "layout",
        message: `the previous page also used template ${spec.layout.template}; vary the page rhythm unless repetition is the point.`,
      },
    ];
  }
  return [];
}

export const mangaPageGoal: GoalDefinition<Input> = {
  type: "MANGA_PAGE",
  skillName: "manga-page",
  defaults: {
    model: DEFAULT_GOAL_MODEL,
    thinking: "off",
    limits: { maxTurns: 16, maxToolCalls: 16, maxSubmits: 6, maxOutputTokens: 16_000, maxCostUsd: 0.8, timeoutMs: 12 * 60_000 },
  },
  parseInput(input) {
    const record = requireObject(input, "input");
    const understanding = requireObject(record.understanding, "understanding") as unknown as BookUnderstanding;
    const plan = requireObject(record.plan, "plan") as unknown as AdaptationPlan;
    const pageNumber = Number(record.page_number);
    if (!Array.isArray(plan.pages)) throw new InputError("plan.pages missing");
    const index = plan.pages.findIndex((p) => p.page_number === pageNumber);
    if (index < 0) throw new InputError(`page ${pageNumber} is not in the plan`);
    const page = plan.pages[index];
    const units = record.units as UnitText[] | undefined;
    if (!Array.isArray(units) || units.length === 0) throw new InputError("units (source text for this page) are required");
    const seenBefore = new Set(plan.pages.slice(0, index).flatMap((p) => p.cast));
    const prevPlanned = index > 0 ? plan.pages[index - 1] : undefined;
    const nextPlanned = plan.pages[index + 1];
    const previousRendered = record.previous as { template?: string; last_panel?: string } | undefined;
    const book = requireObject(record.book ?? {}, "book");
    return {
      book: { title: String(book.title ?? understanding.title ?? ""), author: String(book.author ?? understanding.author ?? ""), kind: understanding.kind },
      cast: understanding.cast,
      locations: understanding.locations,
      page,
      total_pages: plan.pages.length,
      claims: understanding.claims.filter((claim) => page.claims.includes(claim.id)),
      units,
      previous: prevPlanned ? { page_number: prevPlanned.page_number, beat: prevPlanned.beat, ...(previousRendered ?? {}) } : undefined,
      next: nextPlanned ? { page_number: nextPlanned.page_number, beat: nextPlanned.beat } : undefined,
      first_appearances: page.cast.filter((id) => !seenBefore.has(id)),
      order: unitOrder(understanding.sections ?? []),
      expected_looks: expectedLooks(understanding.cast, unitOrder(understanding.sections ?? []), { page_number: page.page_number, units: page.units ?? [], claim_pages: claimPages(plan) }),
      opens_section:
        index === 0 || plan.pages[index - 1].section_id !== page.section_id
          ? { id: page.section_id, title: understanding.sections.find((sec) => sec.id === page.section_id)?.title ?? page.section_id }
          : undefined,
    };
  },
  prepare(input, options) {
    const bookRefs = { cast: input.cast, locations: input.locations };
    let lastRender: { spec: MangaPageSpec; render: RenderResult } | undefined;
    let previews = 0;

    const check = (value: unknown): { issues: ValidationIssue[]; render?: RenderResult } => {
      const structural = validatePage(value, bookRefs, input.page);
      if (errorsOf(structural).length > 0) return { issues: structural };
      const spec = value as MangaPageSpec;
      const render = renderPage(spec, bookRefs, { idPrefix: `pg${input.page.page_number}-` });
      const seen = new Set<string>();
      const issues = [
        ...structural,
        ...render.issues,
        ...introductionIssues(spec, input),
        ...templateIssues(spec, input),
        ...quoteIssues(spec, input.units),
        ...quoteSpeakerIssues(spec, input.units, input.cast, input.page.section_id),
        ...sectionTitleIssues(spec, input.opens_section),
        ...claimMapIssues(spec, input.page.claims),
        ...claimEvidenceIssues(spec, input.claims, input.cast, input.locations),
        ...quoteClaimIssues(spec, input.claims),
        ...statueStagingIssues(spec, input.cast, input.locations),
        ...stagingIssues(spec),
        ...figureStateIssues(spec, input.cast, input.expected_looks, FIGURE_STATE_SEVERITY),
        ...claimOrderIssues(spec, input.claims, input.order),
        ...claimEventIssues(spec, input.claims),
      ].filter((issue) => {
        const key = `${issue.code}|${issue.path}|${issue.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { issues, render };
    };

    const layoutReport = (render: RenderResult) =>
      render.panels
        .map((panel) => {
          const texts = render.texts.filter((t) => t.panel === panel.id);
          return `${panel.id}: ${Math.round(panel.bbox.w)}x${Math.round(panel.bbox.h)} at (${Math.round(panel.bbox.x)},${Math.round(panel.bbox.y)}), ${texts.length} text(s), font ${texts.map((t) => t.font_px).join("/") || "-"}px`;
        })
        .join("\n");

    const preview = {
      name: "preview_page",
      description: options.vision
        ? "Render a draft page (complete MangaPageSpec JSON string) and get back the rendered PNG plus every validation issue. Use it to check composition and legibility before submitting."
        : "Render a draft page (complete MangaPageSpec JSON string) and get back the panel layout report plus every validation issue.",
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        previews += 1;
        if (previews > MAX_PREVIEWS) return { text: `Preview limit (${MAX_PREVIEWS}) reached. Fix the known issues and submit.`, note: "preview_limit" };
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `PREVIEW FAILED: ${parsed.message}`, note: "parse_error" };
        const { issues, render } = check(parsed.value);
        const parts = [
          errorsOf(issues).length ? `${errorsOf(issues).length} error(s) would block submission:` : "No blocking errors.",
          formatIssues(issues),
        ];
        if (render) parts.push(`Layout:\n${layoutReport(render)}`);
        const images = render && options.vision ? [{ data: svgToPng(render.svg, { width: 800 }).toString("base64"), mimeType: "image/png" as const }] : undefined;
        if (images) parts.push("The rendered page is attached. Judge it as a reader: reading order, who is speaking, legibility, whether the art carries the beat.");
        return { text: parts.join("\n\n"), images, note: `errors=${errorsOf(issues).length}${codesNote(issues)}` };
      },
    };

    const submit = {
      name: "submit_page",
      description: "Submit the final page (complete MangaPageSpec JSON string). Replies ACCEPTED or lists every error to fix.",
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `REJECTED: ${parsed.message}`, note: "parse_error" };
        const { issues, render } = check(parsed.value);
        if (errorsOf(issues).length > 0 || !render) return { text: rejection(issues), note: `errors=${errorsOf(issues).length}${codesNote(issues)}` };
        const spec = parsed.value as MangaPageSpec;
        lastRender = { spec, render: { ...render, issues } };
        const warnings = warningsOf(issues);
        return {
          text: `ACCEPTED.${warnings.length ? `\nWarnings kept on record:\n${formatIssues(warnings, 15)}` : ""}`,
          accepted: spec as never,
          note: `accepted warnings=${warnings.length}`,
        };
      },
    };

    const vocab = catalog();
    const pageClaims = input.claims.map((claim) => ({ id: claim.id, kind: claim.kind, importance: claim.importance, text: claim.text, source: claim.source }));
    const userPrompt = [
      "<goal>",
      `Write and stage page ${input.page.page_number} of ${input.total_pages} of the manga adaptation of "${input.book.title}" (${input.book.kind}).`,
      `Page beat: ${input.page.beat}`,
      `Section: ${input.page.section_id}. Claims this page must convey: ${input.page.claims.join(", ") || "(none; a transition page)"}.`,
      `Cast planned on this page: ${input.page.cast.join(", ") || "(none)"}. Locations: ${input.page.locations.join(", ")}.`,
      `End on a page-turn hook: ${input.page.page_turn_hook ? "yes" : "no"}.`,
      input.previous ? `Previous page ${input.previous.page_number}: ${input.previous.beat}${input.previous.last_panel ? ` (it ended on: ${input.previous.last_panel})` : ""}${input.previous.template ? ` [template ${input.previous.template}]` : ""}` : "This is the first page of the book.",
      input.next ? `Next page ${input.next.page_number}: ${input.next.beat}` : "This is the last page of the book.",
      input.first_appearances.length ? `First appearance in the book on this page (introduce them by name): ${input.first_appearances.join(", ")}.` : "",
      input.opens_section ? `This page OPENS the section "${input.opens_section.title}": letter that title in a caption in the first panel.` : "",
      `Use schema "manga-page.v1" with page_number ${input.page.page_number} and section_id "${input.page.section_id}".`,
      options.vision ? "You may call preview_page (up to 4 times) to see the rendered page before submit_page." : "You may call preview_page (up to 4 times) for a layout report before submit_page.",
      "</goal>",
      dataBlock("trusted_templates", vocab.templates),
      dataBlock("trusted_catalog", { limits: vocab.limits, vocabularies: { ...pageVocabulary(), ...vocab.vocabularies }, shots: vocab.shots, text_kinds: vocab.text_kinds, slant: vocab.slant }),
      dataBlock("trusted_cast_capabilities", castCapabilities(input.cast)),
      dataBlock("cast", input.cast),
      ...(() => {
        const looks = expectedLooksForPrompt(input.expected_looks);
        return looks
          ? [
              "How these characters look NOW, computed from the story so far (trusted). Put this variant on every figure of the character on this page; where a change happens on this page, draw it from the panel where the text shows it:",
              dataBlock("expected_looks", looks),
            ]
          : [];
      })(),
      dataBlock("locations", input.locations),
      dataBlock("claims_for_this_page", pageClaims),
      sourceBlock(input.units),
    ]
      .filter(Boolean)
      .join("\n");

    return {
      skillName: "manga-page",
      userPrompt,
      tools: [preview, submit],
      submitTool: submit.name,
      limits: mangaPageGoal.defaults.limits,
      allowImages: options.vision,
      finalize: () => {
        if (!lastRender) throw new Error("accepted page has no render");
        return { spec: lastRender.spec, render: lastRender.render } as never;
      },
    };
  },
};
