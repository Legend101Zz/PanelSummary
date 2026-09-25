/**
 * Who says a quoted line, according to the book. Prose marks speakers with
 * attributions such as `"Shall I love you?" said the Swallow` or `the Reed
 * answered, "..."`. Two deterministic checks use them:
 *
 * - QUOTE_WRONG_SPEAKER (page): a line lettered as a `quote` must be spoken
 *   by the character the book gives it to. Acceptance run 4's judges found
 *   five pages that put a real quote in the wrong mouth (the Charity
 *   Children's "just like an angel" given to the Town Councillors, the Duck's
 *   line given to the Water-rat, the Goose's to the White Duck).
 * - SPEAKER_NOT_IN_CAST (understanding): a character the book gives several
 *   lines to must be in the cast, or the writer has to borrow someone else's
 *   figure for them (run 4: the little Squib, the Christ child).
 *
 * Only an attribution whose head noun names a cast member is trusted;
 * pronouns ("said he") and generic words ("said the other") are ignored.
 */
import type { CastMember, MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

const VERBS =
  "said|says|cried|cries|asked|asks|answered|answers|replied|replies|remarked|exclaimed|whispered|murmured|muttered|shouted|" +
  "screamed|screamed|observed|continued|added|sighed|called|returned|laughed|sneered|growled|chirped|twittered|sang|" +
  "repeated|suggested|explained|interrupted|retorted|inquired|enquired|began|wept|sobbed|roared|groaned|moaned|gasped|" +
  "grumbled|complained|protested|declared|announced|urged|pleaded|begged|agreed|objected|insisted|admitted|shrieked|" +
  "yelled|hissed|squeaked|croaked|quacked|piped|thundered|stammered|faltered|mused|went on|struck in|chimed in";

const LEAD = /^(?:(?:one|some|two|three|all|each|several|most|many) of (?:the|his|her|their) |the |a |an |his |her |their |its |our |my |your |little |old |poor )+/i;
const PRONOUNS = new Set(["he", "she", "they", "it", "i", "we", "you", "him", "her", "them", "who", "which", "that"]);
const GENERIC = new Set([
  "one", "other", "others", "voice", "all", "both", "first", "second", "third", "rest", "another", "some", "none",
  "each", "everyone", "everybody", "somebody", "someone", "nobody", "creature", "thing", "things", "fellow",
]);
/** Words that end a speaker phrase ("the Swallow who ...", "a mother of her boy"). */
const PHRASE_END = new Set([
  "who", "whom", "which", "that", "to", "of", "in", "with", "and", "as", "from", "at", "for", "on", "by", "when",
  "while", "but", "or", "again", "then", "very", "quite", "at", "into", "after", "before", "under", "over", "through",
  "is", "was", "were", "had", "has", "did", "does", "shaking", "looking", "turning", "taking", "nodding",
]);
const ARTICLES = new Set(["the", "a", "an", "this", "that", "these", "those"]);
const IRREGULAR: Record<string, string> = { children: "child", men: "man", women: "woman", people: "person", mice: "mouse", geese: "goose", feet: "foot" };

export interface Attribution {
  /** The quoted words, as printed. */
  quote: string;
  /** The speaker phrase as printed ("the little Squib"). */
  phrase: string;
  /** Head noun, lowercased ("squib"; "water-rat"). */
  head: string;
}

function stem(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Head noun of a speaker phrase, or undefined when it names nobody in particular. */
function headOf(raw: string): { phrase: string; head: string } | undefined {
  const phrase = raw.replace(/\s+/g, " ").trim().replace(LEAD, "");
  const tokens: string[] = [];
  for (const token of phrase.split(" ")) {
    const word = token.replace(/[^A-Za-z-]/g, "");
    if (!word) break;
    if (PHRASE_END.has(word.toLowerCase())) break;
    if (/ly$/.test(word) && word === word.toLowerCase() && tokens.length > 0) break; // "said the Swallow sadly"
    tokens.push(word);
    if (token !== word && /[,.;:!?]$/.test(token)) break;
    if (tokens.length === 4) break;
  }
  if (tokens.length === 0) return undefined;
  const head = tokens[tokens.length - 1].toLowerCase();
  if (PRONOUNS.has(head) || GENERIC.has(head) || ARTICLES.has(head) || PRONOUNS.has(tokens[0].toLowerCase())) return undefined;
  const lead = /^(?:the|a|an)\s/i.exec(raw.trim())?.[0] ?? "";
  return { phrase: `${lead}${tokens.join(" ")}`, head };
}

const AFTER_VERB = new RegExp(`^[\\s,]*(?:${VERBS})\\s+(.{1,90})`, "i");
const AFTER_NAME = new RegExp(`^[\\s,]*((?:the|a|an|one of the)\\s+[A-Za-z-]+(?:\\s+[A-Za-z-]+){0,2}?)\\s+(?:${VERBS})\\b`, "i");
/**
 * A split quote: “A,” said the Mayor; “B”. The gap between the two spans is the
 * attribution, so B is the Mayor's too (also after a full stop: “Heavens!” cried the
 * Goose. “It is going to rain sticks”), unless B names its own speaker.
 */
const GAP_VERB = new RegExp(`^[\\s,;]*(?:${VERBS})\\s+([^.!?]{1,60}?)\\s*[,;:.\u2014]\\s*$`, "i");
/** "…" she answered / "…" said he: the prose attributes the span, to someone it does not name. */
const PRONOUN_AFTER = new RegExp(`^[\\s,]*(?:(?:he|she|they|it|i|we)\\s+(?:${VERBS})|(?:${VERBS})\\s+(?:he|she|they|it|i|we))\\b`, "i");
const BEFORE_NAME = new RegExp(`((?:the|a|an)\\s+[A-Za-z-]+(?:\\s+[A-Za-z-]+){0,2}?)\\s+(?:${VERBS})[\\s,:]*$`, "i");

/**
 * Quoted spans: double curly quotes, straight double quotes, and single curly
 * quotes (a story told inside the story; a \u2019 followed by a letter is an
 * apostrophe, as in "don\u2019t", not a closing quote).
 */
const QUOTED = [
  /\u201c([^\u201d]{1,1500})\u201d/g,
  /"([^"]{1,1500})"/g,
  /\u2018((?:[^\u2019]|\u2019(?=[A-Za-z])){1,1500}?)\u2019(?![A-Za-z])/g,
];
const OPENER = /[\u201c"\u2018]/;
const CLOSER = /[\u201d"]|\u2019(?![A-Za-z])/;

function speakerAround(text: string, start: number, end: number): { phrase: string; head: string } | undefined {
  const after = text.slice(end, end + 120).split(OPENER)[0];
  const before = text.slice(Math.max(0, start - 90), start).split(CLOSER).pop() ?? "";
  const a = AFTER_VERB.exec(after);
  let found = a ? headOf(a[1]) : undefined;
  if (!found) {
    const b = AFTER_NAME.exec(after);
    if (b) found = headOf(b[1]);
  }
  if (!found && !a && !PRONOUN_AFTER.test(after)) {
    const gap = GAP_VERB.exec(before);
    if (gap) found = headOf(gap[1]);
  }
  if (!found && !a) {
    const c = BEFORE_NAME.exec(before);
    if (c) found = headOf(c[1]);
  }
  return found;
}

/** Every quoted span in `text`, with the speaker the prose names for it when it names one. */
export function quotedSpans(text: string): Array<{ quote: string } & Partial<Omit<Attribution, "quote">>> {
  const out: Array<{ quote: string } & Partial<Omit<Attribution, "quote">>> = [];
  for (const re of QUOTED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ quote: m[1], ...(speakerAround(text, m.index, m.index + m[0].length) ?? {}) });
  }
  return out;
}

/** Quoted spans whose speaker the prose names. */
export function attributions(text: string): Attribution[] {
  return quotedSpans(text).filter((span): span is Attribution => typeof span.head === "string");
}

/** Name and role words of a cast member, stemmed (hyphenated words also by part). */
function memberWords(member: CastMember): Set<string> {
  const words = new Set<string>();
  for (const token of `${member.name} ${member.role ?? ""}`.toLowerCase().split(/[^a-z-]+/)) {
    if (!token) continue;
    words.add(stem(token));
    words.add(stem(token.replace(/-/g, ""))); // the book may spell it "Fireballoon" too
    for (const part of token.split("-")) if (part) words.add(stem(part));
  }
  return words;
}

/** Does the attribution's head noun name this member? ("water-rat" names "The Water-Rat"; "councillors" names "The Town Councillors".) */
export function names(head: string, member: CastMember): boolean {
  const words = memberWords(member);
  if (words.has(stem(head)) || words.has(stem(head.replace(/-/g, "")))) return true;
  const parts = head.split("-").filter(Boolean);
  return parts.length > 1 && words.has(stem(parts[parts.length - 1]));
}

/** Cast members an attribution names by their NAME (roles are too loose to accuse a line of the wrong speaker). */
export function namedBy(head: string, cast: readonly CastMember[]): CastMember[] {
  return cast.filter((member) => {
    const nameOnly = { ...member, role: "" } as CastMember;
    return names(head, nameOnly);
  });
}

function normalizeWords(text: string): string {
  return text
    .replace(/[ﬀ-ﬆ]/g, (m) => m.normalize("NFKC"))
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every run of 4 consecutive words (split at ellipses and dashes); a 3-word text is its own run. */
function runs(text: string): Set<string> {
  const out = new Set<string>();
  for (const part of text.split(/\.\.\.|…|--|—/)) {
    const words = normalizeWords(part).split(" ").filter(Boolean);
    if (words.length === 3) out.add(words.join(" "));
    for (let i = 0; i + 4 <= words.length; i++) out.add(words.slice(i, i + 4).join(" "));
  }
  return out;
}

const SPEAKING = new Set(["speech", "thought", "whisper", "shout"]);
const inSection = (member: CastMember, sectionId: string) => !member.sections?.length || member.sections.includes(sectionId);

/**
 * A lettered `quote` in a balloon must be spoken by the character the book
 * gives it to. Checked only when the book's attribution for the quoted words
 * names a speaker, and passed when that speaker's name or role matches.
 */
export function quoteSpeakerIssues(
  spec: MangaPageSpec,
  units: readonly { text: string }[],
  cast: readonly CastMember[],
  sectionId: string,
): ValidationIssue[] {
  // All quoted spans compete for the balloon, attributed or not: a balloon whose
  // best-matching span has no named speaker ("she answered") is not checked.
  const found = units.flatMap((unit) => quotedSpans(unit.text)).map((a) => ({ ...a, runs: [...runs(a.quote)] }));
  if (!found.some((a) => a.head)) return [];
  const byId = new Map(cast.map((member) => [member.id, member]));
  const issues: ValidationIssue[] = [];
  (spec.panels ?? []).forEach((panel) => {
    (panel.text ?? []).forEach((text, index) => {
      if ((text.fidelity !== "quote" && text.fidelity !== "paraphrase") || !SPEAKING.has(text.kind)) return;
      if (typeof text.text !== "string" || typeof text.speaker !== "string") return;
      const member = byId.get(text.speaker);
      if (!member) return;
      // The balloon uses the book's words when it shares a run of 4+ words with a
      // quoted span (a balloon may join two spans, or cut one with "...").
      const lineRuns = runs(text.text);
      // Judge by the span(s) sharing the most runs (an echo such as "Little better
      // than a beggar," said the Town Councillors must not outvote the Mayor's line).
      const shared = found.map((a) => ({ a, n: a.runs.filter((run) => lineRuns.has(run)).length }));
      const best = Math.max(0, ...shared.map((x) => x.n));
      const top = best > 0 ? shared.filter((x) => x.n === best).map((x) => x.a) : [];
      if (top.length === 0 || top.some((a) => !a.head)) return;
      const matched = top as Array<Attribution & { runs: string[] }>;
      if (matched.some((a) => names(a.head, member))) return;
      const book = matched[0];
      const others = cast.filter((c) => c.id !== member.id && inSection(c, sectionId) && namedBy(book.head, [c]).length > 0);
      const who = others.length
        ? `Give it to ${others.map((c) => `${c.name} (${c.id})`).join(" or ")} and draw them in this panel`
        : `${book.phrase} is not in the cast, so letter it as narration that names the speaker (for example: “${text.text.slice(0, 40)}...” said ${book.phrase})`;
      issues.push({
        code: "QUOTE_WRONG_SPEAKER",
        severity: "error",
        path: `panel ${panel.id} text ${index}`,
        message: `the book gives "${text.text.slice(0, 60)}" to ${book.phrase}, but this balloon's speaker is ${member.name} (${member.id}). A quote must come from the character who says it. ${who}.`,
      });
    });
  });
  return issues;
}

/** Characters the book gives at least this many attributed lines (in one section) must be in the cast. */
export const SPEAKER_MIN_LINES = 2;

/**
 * A character the book gives several lines to must be in the cast (for that
 * section), or pages have to borrow another character's figure for them.
 */
export function speakerCastIssues(value: unknown, units: readonly { section_id: string; text: string }[]): ValidationIssue[] {
  const cast = (value as { cast?: unknown })?.cast;
  if (!Array.isArray(cast)) return [];
  const members = cast.filter((c): c is CastMember => Boolean(c) && typeof (c as CastMember).name === "string");
  const counts = new Map<string, { section: string; head: string; phrase: string; quote: string; n: number }>();
  for (const unit of units) {
    for (const a of attributions(unit.text)) {
      const key = `${unit.section_id}|${stem(a.head.replace(/-/g, ""))}`;
      const entry = counts.get(key) ?? { section: unit.section_id, head: a.head, phrase: a.phrase, quote: a.quote, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  const issues: ValidationIssue[] = [];
  for (const entry of counts.values()) {
    if (entry.n < SPEAKER_MIN_LINES) continue;
    if (members.some((member) => inSection(member, entry.section) && names(entry.head, member))) continue;
    issues.push({
      code: "SPEAKER_NOT_IN_CAST",
      severity: "error",
      path: "understanding.cast",
      message: `in ${entry.section} the book gives ${entry.n} lines to ${entry.phrase} (for example “${entry.quote.slice(0, 70)}”), but no cast member of ${entry.section} is named "${entry.head}" by name or role. Add them to the cast (with sections ["${entry.section}"]), or, if they are an existing character, put "${entry.head}" in that character's role.`,
    });
  }
  return issues.slice(0, 10);
}
