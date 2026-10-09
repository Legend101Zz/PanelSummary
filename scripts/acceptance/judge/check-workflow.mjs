// Offline check for judge-workflow.js: parse it the way the Workflow runtime does
// (strip the `export`, wrap in an async function with the runtime globals) and run it
// against a fake agent(). No model call. Usage: node check-workflow.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'judge-workflow.js'), 'utf8')
const promptMd = readFileSync(join(here, 'prompt.md'), 'utf8').replace(/\n$/, '')

if (/Date\.now|Math\.random|new Date\(\)/.test(src)) throw new Error('forbidden nondeterministic call in script')
const body = src.replace('export const meta =', 'const meta =')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const run = new AsyncFunction('agent', 'parallel', 'phase', 'log', 'args', `${body}\n`)

const calls = []
const fakeAgent = async (prompt, opts) => {
  calls.push({ prompt, opts })
  const m = /judging pages (\d+)-(\d+)/.exec(prompt)
  const pages = []
  for (let p = Number(m[1]); p <= Number(m[2]); p++) {
    pages.push({ page: p, scores: { legibility: 4, reading_flow: 4, speaker_attribution: 4, continuity: 4, variety: 4, page_turn: 4, fidelity: 4, beat_without_prose_wall: 4 }, ships: true, what_works: 'x', defects: [] })
  }
  return { pages }
}
const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)))
const out = await run(fakeAgent, parallel, () => {}, () => {}, {
  judgeDir: '/J', pages: [1, 13], judges: 3, groupSize: 6, label: 'chk',
  rubric: '/R', bookTitle: 'TITLE',
})
const fail = (m) => { console.error('FAIL', m); process.exit(1) }
if (calls.length !== 9) fail(`expected 9 agents, got ${calls.length}`)
if (out.length !== 39) fail(`expected 39 judgments, got ${out.length}`)
if (!out.every((r) => [1, 2, 3].includes(r.judge))) fail('judge tag missing')
if (new Set(calls.map((c) => c.opts.label)).size !== 9) fail('labels not unique')
const first = calls.find((c) => /pages 1-6 /.test(c.prompt)).prompt
const expect = promptMd.split('{{a}}').join('1').split('{{b}}').join('6').split('{{bookTitle}}').join('TITLE').split('{{rubric}}').join('/R').split('{{judgeDir}}').join('/J')
if (first !== expect) fail('prompt differs from prompt.md')
console.log('OK judge-workflow.js parses and runs: 9 agents, 39 tagged judgments, prompt equals prompt.md')
