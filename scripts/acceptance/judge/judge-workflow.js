// BookReel quality judge panel. Run with the Workflow tool: scriptPath + args.
// args: { judgeDir, bookTitle, pages: [first, last], judges: 3, groupSize: 6, model: 'sonnet', label, rubric, concurrency }
// concurrency: the most judge agents that run at the same time (default: all). Use it to stay under the account session limit.
// Keep PROMPT_TEMPLATE identical to scripts/acceptance/judge/prompt.md (a unittest verifies this).
export const meta = {
  name: 'bookreel-judge-panel',
  description: 'Score generated manga pages with a panel of independent judges (same prompt, same schema) against the craft.md rubric',
  phases: [{ title: 'Judge', detail: 'N independent judges per page group, full-size PNGs against source text' }],
}

const A = args || {}
if (!A.judgeDir) throw new Error('args.judgeDir is required')
if (!Array.isArray(A.pages) || A.pages.length !== 2) throw new Error('args.pages must be [first, last]')
const JUDGE_DIR = A.judgeDir
const BOOK_TITLE = A.bookTitle || 'Oscar Wilde\'s "The Happy Prince and Other Tales" (public domain)'
const RUBRIC = A.rubric || '/Volumes/Mrigesh SSD/Book-Reel/docs/rebuild/research/craft.md'
const JUDGES = A.judges || 3
const GROUP = A.groupSize || 6
const MODEL = A.model || 'sonnet'
const LABEL = A.label || 'judge'
const CONCURRENCY = A.concurrency || 0
const FIRST = A.pages[0]
const LAST = A.pages[1]

const PAGE = {
  type: 'object',
  properties: {
    page: { type: 'number' },
    scores: {
      type: 'object',
      properties: {
        legibility: { type: 'number' }, reading_flow: { type: 'number' }, speaker_attribution: { type: 'number' },
        continuity: { type: 'number' }, variety: { type: 'number' }, page_turn: { type: 'number' },
        fidelity: { type: 'number' }, beat_without_prose_wall: { type: 'number' },
      },
      required: ['legibility', 'reading_flow', 'speaker_attribution', 'continuity', 'variety', 'page_turn', 'fidelity', 'beat_without_prose_wall'],
    },
    ships: { type: 'boolean' },
    what_works: { type: 'string' },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: ['renderer', 'writer', 'plan', 'understanding'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          what: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['owner', 'severity', 'what', 'fix'],
      },
    },
  },
  required: ['page', 'scores', 'ships', 'what_works', 'defects'],
}
const OUT = { type: 'object', properties: { pages: { type: 'array', items: PAGE } }, required: ['pages'] }

const PROMPT_TEMPLATE = `You are a demanding manga editor judging pages {{a}}-{{b}} of a generated manga adaptation of {{bookTitle}}. An LLM wrote each page as a structured spec; a deterministic SVG renderer drew it (no image models — the art is procedural vector art, so judge storytelling clarity and legibility, not whether it looks hand-drawn).

Read the scoring rubric: section "(g) Acceptance rubric" in {{rubric}} (use its 1/3/5 descriptors and ship bar exactly: no criterion below 3, legibility >= 4, fidelity >= 4, mean >= 3.5). For EACH page N in {{a}}..{{b}} (two-digit file names, e.g. page-0{{a}}.png for single digits):
1. Read {{judgeDir}}/page-NN.json first. If "status" is not "accepted" the page failed generation: do not score it; return scores of 0 and ships=false, and put the failure reason in what_works.
2. Look at {{judgeDir}}/page-NN.png with the Read tool at full size (1000x1500). Look carefully: every panel, every balloon, every tail, who is where.
3. From the JSON: planned beat, the claims the page must convey, the spec (panels, text with fidelity labels, sources, claim_map), renderer warnings, the EXACT source text (source_units) and the cast. Check fidelity against the source text: quotes must be (near-)verbatim and attributed to the right speaker; paraphrases faithful; nothing invented presented as fact; the planned claims actually conveyed to a reader who has not read the book.
4. Glance at the previous and next page PNGs when judging continuity and page turns.
Score all 8 criteria 1-5, decide ships, note what works, and list every defect with its owner ("renderer", "writer", "plan", "understanding") and a concrete fix. Be honest and specific; do not inflate scores. Return one entry per page.`

function fill(a, b) {
  return PROMPT_TEMPLATE
    .split('{{a}}').join(String(a))
    .split('{{b}}').join(String(b))
    .split('{{bookTitle}}').join(BOOK_TITLE)
    .split('{{rubric}}').join(RUBRIC)
    .split('{{judgeDir}}').join(JUDGE_DIR)
}

const groups = []
for (let a = FIRST; a <= LAST; a += GROUP) groups.push([a, Math.min(a + GROUP - 1, LAST)])

const tasks = []
for (const [a, b] of groups) {
  for (let j = 1; j <= JUDGES; j++) tasks.push({ a, b, j })
}

phase('Judge')
log(`${groups.length} page groups x ${JUDGES} judges = ${tasks.length} agents (model ${MODEL})`)
const judge = (t) => agent(
  fill(t.a, t.b),
  { label: `${LABEL}:j${t.j}:p${t.a}-${t.b}`, phase: 'Judge', schema: OUT, model: MODEL },
).then((r) => (r ? { judge: t.j, a: t.a, b: t.b, pages: r.pages } : null)).catch(() => null)

// A small pool: at most CONCURRENCY judge agents at the same time (0 = all at once).
async function pool(items, n, fn) {
  const out = new Array(items.length).fill(null)
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(n || items.length, items.length)) }, async () => {
    while (next < items.length) {
      const k = next++
      out[k] = await fn(items[k])
    }
  })
  await Promise.all(lanes)
  return out
}
const results = await pool(tasks, CONCURRENCY, judge)

const missing = results.map((r, i) => (r ? null : tasks[i])).filter(Boolean)
if (missing.length) log(`WARNING: ${missing.length} judge task(s) returned nothing: ` + missing.map((t) => `j${t.j}:p${t.a}-${t.b}`).join(', '))

return results.filter(Boolean).flatMap((r) => r.pages.map((p) => ({ judge: r.judge, ...p })))
