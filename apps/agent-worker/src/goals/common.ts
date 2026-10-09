/**
 * Shared plumbing for production goals: candidate parsing, issue text, and
 * untrusted-data framing.
 */
import { Type } from "typebox";
import type { ValidationIssue } from "@panelsummary/manga-render";

export const CANDIDATE_ARG = "candidate_json";

/** Submit/preview tools take the whole candidate as ONE JSON string (survives the tool frame intact). */
export const candidateParameters = Type.Object(
  {
    [CANDIDATE_ARG]: Type.String({
      minLength: 2,
      maxLength: 400_000,
      description: "The complete candidate as a JSON object serialised to a string.",
    }),
  },
  { additionalProperties: false },
);

export type ParsedCandidate = { ok: true; value: unknown } | { ok: false; message: string };

export function parseCandidate(args: Record<string, unknown>): ParsedCandidate {
  const raw = args[CANDIDATE_ARG];
  if (typeof raw !== "string") {
    // Some frames deliver the object itself; accept it but never guess fields.
    if (raw && typeof raw === "object") return { ok: true, value: raw };
    return { ok: false, message: `${CANDIDATE_ARG} must be a JSON string.` };
  }
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${CANDIDATE_ARG} is not valid JSON (${detail}). Send one complete JSON object.` };
  }
}

export function errorsOf(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function warningsOf(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "warning");
}

/** Start of the message of a repair_once issue that rejects the first submit (see repair-once.ts). */
export const FIX_BEFORE_SUBMIT = "FIX BEFORE SUBMIT: ";

export function formatIssues(issues: readonly ValidationIssue[], limit = 40): string {
  const shown = issues.slice(0, limit).map((issue, i) => {
    const once = issue.severity === "error" && issue.message.startsWith(FIX_BEFORE_SUBMIT);
    return `${i + 1}. [${once ? "FIX BEFORE SUBMIT" : issue.severity.toUpperCase()} ${issue.code}] ${issue.path}: ${once ? issue.message.slice(FIX_BEFORE_SUBMIT.length) : issue.message}`;
  });
  if (issues.length > limit) shown.push(`… and ${issues.length - limit} more.`);
  return shown.join("\n");
}

export function rejection(issues: readonly ValidationIssue[]): string {
  const errors = errorsOf(issues);
  const warnings = warningsOf(issues);
  const once = errors.filter((issue) => issue.message.startsWith(FIX_BEFORE_SUBMIT)).length;
  return [
    `REJECTED: ${errors.length} error(s) must be fixed before this can be accepted.`,
    formatIssues(errors),
    once ? `${once} of these are marked FIX BEFORE SUBMIT: they reject only this first submit. If you cannot fix one, submit again and it stays as a warning.` : "",
    warnings.length ? `Also consider these ${warnings.length} warning(s):\n${formatIssues(warnings, 15)}` : "",
    "Fix every error and call the submit tool again with the complete corrected JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Serialise data for an untrusted prompt block (no tag injection). */
export function dataBlock(tag: string, value: unknown): string {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return `<${tag}>\n${body.replaceAll("<", "‹").replaceAll(">", "›")}\n</${tag}>`;
}

export function sourceBlock(units: readonly { id: string; page_start: number; page_end: number; text: string }[]): string {
  const body = units
    .map((unit) => `[unit ${unit.id} · pdf pages ${unit.page_start}-${unit.page_end}]\n${unit.text}`)
    .join("\n\n");
  return dataBlock("untrusted_source_text", body);
}
