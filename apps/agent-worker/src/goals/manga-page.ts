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
}

const MAX_PREVIEWS = 3;

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
    model: "MiniMax-M3",
    thinking: "low",
    limits: { maxTurns: 12, maxToolCalls: 12, maxSubmits: 5, maxOutputTokens: 32_000, maxCostUsd: 0.6, timeoutMs: 10 * 60_000 },
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
      const issues = [...structural, ...render.issues, ...introductionIssues(spec, input), ...templateIssues(spec, input)].filter((issue) => {
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
        return { text: parts.join("\n\n"), images, note: `errors=${errorsOf(issues).length}` };
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
        if (errorsOf(issues).length > 0 || !render) return { text: rejection(issues), note: `errors=${errorsOf(issues).length}` };
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
      `Use schema "manga-page.v1" with page_number ${input.page.page_number} and section_id "${input.page.section_id}".`,
      options.vision ? "You may call preview_page (up to 3 times) to see the rendered page before submit_page." : "You may call preview_page (up to 3 times) for a layout report before submit_page.",
      "</goal>",
      dataBlock("trusted_templates", vocab.templates),
      dataBlock("trusted_catalog", { limits: vocab.limits, vocabularies: { ...pageVocabulary(), ...vocab.vocabularies }, shots: vocab.shots, text_kinds: vocab.text_kinds, slant: vocab.slant }),
      dataBlock("trusted_cast_capabilities", castCapabilities(input.cast)),
      dataBlock("cast", input.cast),
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
