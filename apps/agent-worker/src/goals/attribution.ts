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
 * - SPEAKER_NOT_IN_CAST (understanding, warning): a character the book gives
 *   several lines to should be in the cast, or the writer has to borrow someone
 *   else's figure for them (run 4: the little Squib, the Christ child). The
 *   same list is given to the understanding goal in its prompt.
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

const LEAD = /^(?:(?:one|some|two|three|all|each|several|most|many) of (?:the|his|her|their) |out |up |forth |aloud |back |the |a |an |his |her |their |its |our |my |your |little |old |poor )+/i;
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
  const printed: string[] = [];
  for (const token of phrase.split(" ")) {
    const word = token.replace(/[^A-Za-z-]/g, "");
    if (!word) break;
    if (PHRASE_END.has(word.toLowerCase())) break;
    if (/ly$/.test(word) && word === word.toLowerCase() && tokens.length > 0) break; // "said the Swallow sadly"
    tokens.push(word);
    printed.push(token.replace(/[,.;:!?]+$/, ""));
    if (token !== word && /[,.;:!?]$/.test(token)) break;
    if (tokens.length === 4) break;
  }
  if (tokens.length === 0) return undefined;
  const head = tokens[tokens.length - 1].toLowerCase();
  if (PRONOUNS.has(head) || GENERIC.has(head) || ARTICLES.has(head) || PRONOUNS.has(tokens[0].toLowerCase())) return undefined;
  const lead = /^(?:(?:out|up|forth|aloud|back)\s+)?((?:the|a|an)\s)/i.exec(raw.trim())?.[1] ?? "";
  return { phrase: `${lead}${printed.join(" ")}`, head };
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

/** The head word is literally a word of the member's name, same number ("child" does not name "The Garden Children"). */
function namesExactly(head: string, member: CastMember): boolean {
  const words = new Set<string>();
  for (const token of member.name.toLowerCase().split(/[^a-z-]+/)) {
    if (!token) continue;
    words.add(token);
    words.add(token.replace(/-/g, ""));
  }
  const h = head.toLowerCase();
  return words.has(h) || words.has(h.replace(/-/g, ""));
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
      // The speaker's NAME settles it; a role mention only counts when the book's word
      // names nobody else here (the Swallow's role "the Prince's messenger" must not
      // make "said the Prince" his; "said the statue" may still be the Happy Prince's).
      const othersNamed = (a: Attribution) =>
        cast.filter((c) => c.id !== member.id && inSection(c, sectionId) && namesExactly(a.head, c));
      if (matched.some((a) => namedBy(a.head, [member]).length > 0 || (othersNamed(a).length === 0 && names(a.head, member)))) return;
      const book = matched[0];
      const others = othersNamed(book);
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

/** Characters the book gives at least this many attributed lines (in one section) should be in the cast. */
export const SPEAKER_MIN_LINES = 2;
/**
 * From this many lines a missing speaker is an error: a major character of that part of
 * the book (acceptance run 6's understanding left out the Miller, Hans and the Rocket, with
 * 42, 32 and 50 lines). Minor speakers stay warnings: demanding every two-line speaker made
 * run 5's understanding time out.
 */
export const SPEAKER_MAJOR_LINES = 5;

/**
 * A character the book gives several lines to must be in the cast (for that
 * section), or pages have to borrow another character's figure for them.
 */
export interface BookSpeaker {
  section: string;
  head: string;
  phrase: string;
  quote: string;
  n: number;
}

/** Speakers the book names in its attributions, per section, with how many lines each has. */
export function bookSpeakers(units: readonly { section_id: string; text: string }[]): BookSpeaker[] {
  const counts = new Map<string, BookSpeaker>();
  for (const unit of units) {
    for (const a of attributions(unit.text)) {
      const key = `${unit.section_id}|${stem(a.head.replace(/-/g, ""))}`;
      const entry = counts.get(key) ?? { section: unit.section_id, head: a.head, phrase: a.phrase, quote: a.quote, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => a.section.localeCompare(b.section) || b.n - a.n);
}

/**
 * The speaker list the understanding goal sees before it writes the cast
 * (derived from the book's text, so it is data, not instructions). Giving it
 * up front costs nothing; demanding it only as a rejection made acceptance
 * run 5's first understanding attempt re-emit the whole cast and time out.
 */
export function speakerList(units: readonly { section_id: string; text: string }[]): string {
  return bookSpeakers(units)
    .filter((s) => s.n >= SPEAKER_MIN_LINES)
    .map((s) => `${s.section}: ${s.phrase} (${s.n} lines)`)
    .join("\n");
}

export function speakerCastIssues(value: unknown, units: readonly { section_id: string; text: string }[]): ValidationIssue[] {
  const cast = (value as { cast?: unknown })?.cast;
  if (!Array.isArray(cast)) return [];
  const members = cast.filter((c): c is CastMember => Boolean(c) && typeof (c as CastMember).name === "string");
  const issues: ValidationIssue[] = [];
  for (const entry of bookSpeakers(units)) {
    if (entry.n < SPEAKER_MIN_LINES) continue;
    if (members.some((member) => inSection(member, entry.section) && names(entry.head, member))) continue;
    issues.push({
      code: "SPEAKER_NOT_IN_CAST",
      // Minor speakers warn (the list is in the prompt, and page goals refuse to hand
      // their quotes to someone else); major speakers must be cast.
      severity: entry.n >= SPEAKER_MAJOR_LINES ? "error" : "warning",
      path: "understanding.cast",
      message: `in ${entry.section} the book gives ${entry.n} lines to ${entry.phrase} (for example “${entry.quote.slice(0, 70)}”), but no cast member of ${entry.section} is named "${entry.head}" by name or role. Add them to the cast (with sections ["${entry.section}"]), or, if they are an existing character, put "${entry.head}" in that character's role.`,
    });
  }
  return issues.sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error")).slice(0, 12);
}

// ---------------------------------------------------------------------------
// One-line characters: individuals the cast hides inside a group or never names
// ---------------------------------------------------------------------------

/**
 * Acceptance run 8 left two key one-line characters out of the cast, and both slipped
 * past SPEAKER_NOT_IN_CAST:
 * - the little boy of "The Selfish Giant" (the Christ child) answers once as "the
 *   child"; the crowd "The Children" matched that word, so nobody was missing;
 * - a workman of "The Remarkable Rocket" cries "what a bad rocket!" as "one of them"
 *   (the workmen are named a sentence earlier).
 * Both are one line, far below the 5-line error threshold, so pages drew a crowd or
 * left them out.
 */
export interface LoneSpeaker {
  section: string;
  /** Head noun of the individual ("child", "workman"). */
  head: string;
  phrase: string;
  quote: string;
  kind: "crowd_member" | "one_of_group";
  /** The crowd cast member that hides it, if any. */
  crowd?: CastMember;
}

const PLURAL_NOUN = /\bthe ((?:[a-z]+(?:men|folk))|(?:[a-z]{4,}s))\b/gi;
const ONE_OF = /\b[Oo]ne of (?:them|the ([a-z]+))\b[^\u201c"\u2018.]{0,80}[.,]?\s*$/;

function singular(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith("men")) return `${w.slice(0, -3)}man`;
  return stem(w);
}

/** Plural form of a head noun? ("children", "workmen", "councillors") */
function isPlural(head: string): boolean {
  const w = head.toLowerCase();
  return w in IRREGULAR || w.endsWith("men") || (w.length > 3 && w.endsWith("s") && !w.endsWith("ss"));
}

/**
 * Speakers the book gives a single line that the cast cannot draw as one person:
 * - "crowd_member": the attribution is singular ("answered the child") and the only
 *   cast members it names are crowds;
 * - "one_of_group": a line from "one of them" / "one of the workmen" whose group the
 *   cast does not name.
 */
export function loneSpeakers(
  units: readonly { section_id: string; text: string }[],
  cast: readonly CastMember[],
): LoneSpeaker[] {
  const out = new Map<string, LoneSpeaker>();
  for (const unit of units) {
    const members = cast.filter((m) => inSection(m, unit.section_id));
    // 1. A singular attribution that only a crowd in this section can answer to.
    for (const a of attributions(unit.text)) {
      if (isPlural(a.head) || /^the other\b/i.test(a.phrase)) continue;
      const hits = members.filter((m) => names(a.head, m));
      if (hits.length === 0 || hits.some((m) => (m.look as { kind?: string }).kind !== "crowd")) continue;
      const key = `${unit.section_id}|${stem(a.head)}`;
      if (!out.has(key)) out.set(key, { section: unit.section_id, head: a.head, phrase: a.phrase, quote: a.quote, kind: "crowd_member", crowd: hits[0] });
    }
    // 2. "one of them" / "one of the Xs" before a line, with no cast member for the group.
    for (const re of QUOTED) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(unit.text))) {
        const before = unit.text.slice(Math.max(0, m.index - 160), m.index);
        const one = ONE_OF.exec(before);
        if (!one) continue;
        let group = one[1];
        if (!group) {
          const back = unit.text.slice(Math.max(0, m.index - 700), m.index - (one[0]?.length ?? 0));
          for (const found of back.matchAll(PLURAL_NOUN)) group = found[1];
        }
        if (!group || GENERIC.has(group.toLowerCase())) continue;
        const head = singular(group);
        if (members.some((c) => names(head, c) || names(group!, c))) continue;
        const key = `${unit.section_id}|${head}`;
        if (!out.has(key)) out.set(key, { section: unit.section_id, head, phrase: `one of the ${group}`, quote: m[1], kind: "one_of_group" });
      }
    }
  }
  return [...out.values()].sort((a, b) => Number(b.kind === "crowd_member") - Number(a.kind === "crowd_member"));
}

/**
 * Issues for lone speakers. `maxErrors` of them are errors (a few cheap cast additions
 * through revise_understanding); the rest are warnings, so a book with many bit
 * players cannot force a long repair loop (acceptance run 5).
 */
export function loneSpeakerIssues(
  value: unknown,
  units: readonly { section_id: string; text: string }[],
  maxErrors = 3,
): ValidationIssue[] {
  const cast = (value as { cast?: unknown })?.cast;
  if (!Array.isArray(cast)) return [];
  const members = cast.filter((c): c is CastMember => Boolean(c) && typeof (c as CastMember).name === "string");
  return loneSpeakers(units, members).map((s, i) => ({
    code: s.kind === "crowd_member" ? "SPEAKER_HIDDEN_IN_CROWD" : "SPEAKER_ONE_OF_GROUP",
    severity: i < maxErrors ? ("error" as const) : ("warning" as const),
    path: "understanding.cast",
    message:
      s.kind === "crowd_member"
        ? `in ${s.section} "${s.phrase}" speaks alone (“${s.quote.slice(0, 60)}”), but the only cast member that fits is the group ${s.crowd?.name} (${s.crowd?.id}). Add that one person as their own cast member (sections ["${s.section}"], a one-line description of who they are) so pages can draw them.`
        : `in ${s.section} ${s.phrase} speaks alone (“${s.quote.slice(0, 60)}”), but no cast member is a ${s.head}. Add one ${s.head} to the cast (sections ["${s.section}"]) so pages can draw who speaks.`,
  }));
}
