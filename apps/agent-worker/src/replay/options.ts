/**
 * Options of the replay worker (track F1). Read from the environment and the command line.
 * Nothing here reads a MiniMax key: the replay worker never calls a model.
 *
 *   REPLAY_PACKAGE / --package DIR     the saved run to replay (required)
 *   REPLAY_DELAYS / --delays TEXT      "understanding=8,plan=5,page=3-6" (seconds); REPLAY_FAST=1 sets all to 0
 *   FAIL_PAGES / --fail-pages 7,12     pages that fail like a real NO_SUBMISSION
 *   FAIL_TIMES / --fail-times N        how many calls of a failing page fail before it succeeds (default 2 = the backend's page_attempts)
 *   PROVIDER_STOP / --provider-stop X  limit|auth|unavailable@page=N | @understanding | @plan
 *   PROVIDER_STOP_TIMES                how many calls meet the refusal (default 1; 2 for "unavailable", the backend retries it once)
 *   REPLAY_COSTS / --costs saved|zero  cost and tokens in the receipts: zero (default: a replay spends nothing) or copied from the saved run
 *   AGENT_WORKER_TOKEN, AGENT_WORKER_HOST, AGENT_WORKER_PORT   as the real worker
 */

export type ProviderKind = "limit" | "auth" | "unavailable";
export type StopTarget = { stage: "understanding" } | { stage: "plan" } | { stage: "page"; page: number };

export interface DelayRange {
  min: number;
  max: number;
}

export interface ReplayOptions {
  packageDir: string;
  token: string;
  host: string;
  port: number;
  delays: { understanding: DelayRange; plan: DelayRange; page: DelayRange };
  failPages: Set<number>;
  failTimes: number;
  providerStop?: { kind: ProviderKind; target: StopTarget; times: number };
  costs: "saved" | "zero";
}

export class OptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionError";
  }
}

export const DEFAULT_DELAYS = { understanding: { min: 8, max: 8 }, plan: { min: 5, max: 5 }, page: { min: 3, max: 6 } } as const;

export function parseRange(text: string, label: string): DelayRange {
  const match = /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/.exec(text.trim());
  if (!match) throw new OptionError(`${label}: "${text}" is not a number of seconds or a range like 3-6`);
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (max < min) throw new OptionError(`${label}: the range ${text} runs backwards`);
  return { min, max };
}

export function parseDelays(text: string | undefined, fast: boolean): ReplayOptions["delays"] {
  if (fast) return { understanding: { min: 0, max: 0 }, plan: { min: 0, max: 0 }, page: { min: 0, max: 0 } };
  const delays: ReplayOptions["delays"] = { understanding: { ...DEFAULT_DELAYS.understanding }, plan: { ...DEFAULT_DELAYS.plan }, page: { ...DEFAULT_DELAYS.page } };
  if (!text) return delays;
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [name, value] = part.split("=");
    if (!value || !(name in delays)) throw new OptionError(`delays: "${part}" must look like understanding=8, plan=5 or page=3-6`);
    delays[name as keyof typeof delays] = parseRange(value, `delays ${name}`);
  }
  return delays;
}

export function parsePageList(text: string | undefined, label: string): Set<number> {
  const pages = new Set<number>();
  if (!text) return pages;
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to < from) throw new OptionError(`${label}: the range ${part} runs backwards`);
      for (let n = from; n <= to; n += 1) pages.add(n);
    } else if (/^\d+$/.test(part) && Number(part) > 0) {
      pages.add(Number(part));
    } else {
      throw new OptionError(`${label}: "${part}" is not a page number`);
    }
  }
  return pages;
}

export function parseProviderStop(text: string | undefined, times?: number): ReplayOptions["providerStop"] {
  if (!text) return undefined;
  const match = /^(limit|auth|unavailable)@(understanding|plan|page=(\d+))$/.exec(text.trim());
  if (!match) throw new OptionError(`PROVIDER_STOP: "${text}" must look like limit@page=5, auth@understanding or unavailable@plan`);
  const kind = match[1] as ProviderKind;
  const target: StopTarget = match[2] === "understanding" ? { stage: "understanding" } : match[2] === "plan" ? { stage: "plan" } : { stage: "page", page: Number(match[3]) };
  // The backend calls a PROVIDER_UNAVAILABLE goal a second time before it stops the job; limit and auth stop at once.
  return { kind, target, times: times ?? (kind === "unavailable" ? 2 : 1) };
}

function positive(text: string | undefined, label: string, fallback: number): number {
  if (text === undefined || text === "") return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) throw new OptionError(`${label} must be a positive integer`);
  return value;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) throw new OptionError(`--${name} needs a value`);
  return next;
}

/** argv is process.argv.slice(2); a flag wins over the environment. */
export function parseOptions(argv: readonly string[], env: Record<string, string | undefined>): ReplayOptions {
  const pick = (flagName: string, ...names: string[]): string | undefined => flag(argv, flagName) ?? names.map((n) => env[n]).find((v) => v !== undefined && v !== "");
  const packageDir = pick("package", "REPLAY_PACKAGE");
  if (!packageDir) throw new OptionError("a replay package is required (REPLAY_PACKAGE or --package DIR)");
  const token = env.AGENT_WORKER_TOKEN ?? "";
  if (token.length < 32) throw new OptionError("AGENT_WORKER_TOKEN must be set (at least 32 characters)");
  const costs = pick("costs", "REPLAY_COSTS") ?? "zero";
  if (costs !== "saved" && costs !== "zero") throw new OptionError(`REPLAY_COSTS must be saved or zero, not "${costs}"`);
  const timesText = env.PROVIDER_STOP_TIMES;
  return {
    packageDir,
    token,
    host: env.AGENT_WORKER_HOST ?? "127.0.0.1",
    port: positive(env.AGENT_WORKER_PORT, "AGENT_WORKER_PORT", 8788),
    delays: parseDelays(pick("delays", "REPLAY_DELAYS"), (pick("fast", "REPLAY_FAST") ?? "") === "1" || argv.includes("--fast")),
    failPages: parsePageList(pick("fail-pages", "FAIL_PAGES", "REPLAY_FAIL_PAGES"), "FAIL_PAGES"),
    failTimes: positive(pick("fail-times", "FAIL_TIMES"), "FAIL_TIMES", 2),
    providerStop: parseProviderStop(pick("provider-stop", "PROVIDER_STOP", "REPLAY_PROVIDER_STOP"), timesText ? positive(timesText, "PROVIDER_STOP_TIMES", 1) : undefined),
    costs,
  };
}

/** Same seconds for the same key, between min and max: the UI shows the same pace on every run. */
export function jitterSeconds(range: DelayRange, key: string): number {
  if (range.max <= range.min) return range.min;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return range.min + ((hash % 1000) / 1000) * (range.max - range.min);
}
