/** Small helpers for validators that speak to an LLM repairing its JSON. */
import type { IssueSeverity, ValidationIssue } from "../contracts.js";

export class Issues {
  readonly list: ValidationIssue[] = [];

  add(severity: IssueSeverity, code: string, path: string, message: string): void {
    this.list.push({ code, severity, path, message });
  }
  error(code: string, path: string, message: string): void {
    this.add("error", code, path, message);
  }
  warn(code: string, path: string, message: string): void {
    this.add("warning", code, path, message);
  }
  push(...issues: ValidationIssue[]): void {
    this.list.push(...issues);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function show(v: unknown): string {
  const s = JSON.stringify(v);
  if (s === undefined) return String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

export function listValues(values: readonly string[]): string {
  return values.join(", ");
}

/** Required non-empty string field. */
export function reqString(obj: Record<string, unknown>, key: string, issues: Issues, path: string, hint = ""): string | undefined {
  const v = obj[key];
  if (v === undefined) {
    issues.error("FIELD_MISSING", path, `missing required field "${key}"${hint ? ` (${hint})` : ""}.`);
    return undefined;
  }
  if (typeof v !== "string") {
    issues.error("FIELD_TYPE", path, `"${key}" must be a string, got ${typeName(v)} ${show(v)}.`);
    return undefined;
  }
  if (v.trim().length === 0) {
    issues.error("FIELD_EMPTY", path, `"${key}" must not be empty${hint ? ` (${hint})` : ""}.`);
    return undefined;
  }
  return v;
}

/** Required array field. */
export function reqArray(obj: Record<string, unknown>, key: string, issues: Issues, path: string, hint = ""): unknown[] | undefined {
  const v = obj[key];
  if (v === undefined) {
    issues.error("FIELD_MISSING", path, `missing required field "${key}" (an array${hint ? `; ${hint}` : ""}; use [] when empty).`);
    return undefined;
  }
  if (!Array.isArray(v)) {
    issues.error("FIELD_TYPE", path, `"${key}" must be an array, got ${typeName(v)} ${show(v)}.`);
    return undefined;
  }
  return v;
}

export function reqBoolean(obj: Record<string, unknown>, key: string, issues: Issues, path: string): boolean | undefined {
  const v = obj[key];
  if (v === undefined) {
    issues.error("FIELD_MISSING", path, `missing required field "${key}" (true or false).`);
    return undefined;
  }
  if (typeof v !== "boolean") {
    issues.error("FIELD_TYPE", path, `"${key}" must be true or false, got ${show(v)}.`);
    return undefined;
  }
  return v;
}

export function reqPositiveInt(obj: Record<string, unknown>, key: string, issues: Issues, path: string): number | undefined {
  const v = obj[key];
  if (v === undefined) {
    issues.error("FIELD_MISSING", path, `missing required field "${key}" (a positive integer).`);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    issues.error("FIELD_TYPE", path, `"${key}" must be a positive integer, got ${show(v)}.`);
    return undefined;
  }
  return v;
}

/**
 * Enum check. `required=false` accepts undefined. Returns the value when it
 * is allowed.
 */
export function checkEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  issues: Issues,
  path: string,
  required = true,
): T | undefined {
  const v = obj[key];
  if (v === undefined) {
    if (required) issues.error("FIELD_MISSING", path, `missing required field "${key}"; use one of: ${listValues(allowed)}.`);
    return undefined;
  }
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    issues.error("ENUM_INVALID", path, `${key} ${show(v)} is not allowed; use one of: ${listValues(allowed)}.`);
    return undefined;
  }
  return v as T;
}

export function warnUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], issues: Issues, path: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      issues.warn("FIELD_UNKNOWN", path, `unknown field "${key}" is ignored; allowed fields: ${allowed.join(", ")}.`);
    }
  }
}

/** Validate a SourceRef. Returns the unit when shape-valid. */
export function checkSourceRef(v: unknown, issues: Issues, path: string, knownUnits?: ReadonlySet<string>): string | undefined {
  if (!isRecord(v)) {
    issues.error("SOURCE_INVALID", path, `a source must be an object {"unit": "<unit id>", "page": <pdf page number>}, got ${show(v)}.`);
    return undefined;
  }
  let ok = true;
  if (typeof v.unit !== "string" || v.unit.trim() === "") {
    issues.error("SOURCE_INVALID", path, `source "unit" must be a unit id string, got ${show(v.unit)}.`);
    ok = false;
  }
  if (typeof v.page !== "number" || !Number.isInteger(v.page) || v.page < 1) {
    issues.error("SOURCE_INVALID", path, `source "page" must be the 1-based PDF page number (positive integer), got ${show(v.page)}.`);
    ok = false;
  }
  if (ok && knownUnits && !knownUnits.has(v.unit as string)) {
    issues.error("SOURCE_UNKNOWN_UNIT", path, `source unit ${show(v.unit)} does not exist in the parsed book; cite a real unit id.`);
    return undefined;
  }
  return ok ? (v.unit as string) : undefined;
}

export function toSet(ids: Iterable<string> | undefined): Set<string> | undefined {
  return ids ? new Set(ids) : undefined;
}
