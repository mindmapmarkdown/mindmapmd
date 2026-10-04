// A sweep for documents whose meaning does not survive the round trip.
//
//   node tools/sweep.mjs [count] [seed]
//
// The conformance suite is a list of documents someone thought of. This is the
// other half: it builds documents nobody would write on purpose and checks each
// one against the two things the specification promises.
//
//   1. §1.2.4 L1 — lift and canonical projection are mutually inverse. Project
//      the tree, lift the result, compare. Then project again and compare the
//      bytes, because a round trip that is not byte-stable is not one.
//   2. §2.4 — lift cannot produce a tree that is not well-formed. Checked only
//      where the implementation has S-7 (src/wellformed.js, RFC 0043); without
//      it, only the first check runs.
//
// **What this is worth is bounded by what it can reach**, and that bound has
// been wrong twice. On 2026-10-02 it found four defects in 900 failures. On
// 2026-10-03 it reported zero over 240,000 documents while two defects were
// live, because no fragment could put a construct *inside* a list item; adding
// seven fragments turned that zero into 136. The output therefore prints the
// size of the space it searched, and this comment says plainly that a zero here
// is evidence and not proof.
//
// Two generators, because they are wrong in different ways:
//
//   assembled  fragments joined with newlines. Reaches combinations no person
//              would write, which is where the first six defects were.
//   mutated    a document from the conformance suite with one to three edits
//              applied. Reaches documents a person nearly wrote, which is where
//              a defect that matters to a reader is more likely to be.
//
// It is not a conformance test and it is not in CI. It is the question to ask
// before claiming a round-trip rule is true.
//
// Licensed under Apache-2.0. See LICENSE.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

const SP = ' '
const TAB = '\t'
const BS = '\\'
const F = '`'.repeat(3)
const T = '~'.repeat(3)

/** S-7, where this implementation has it. Otherwise nothing to ask. */
const problems = await (async () => {
  try {
    const m = await import('../src/wellformed.js')
    return m.problems
  } catch {
    return null
  }
})()

/**
 * Fragments. Each is here because it is the near side of a rule or of a defect,
 * and the groups are the rules they probe.
 *
 * A construct that can be a list item's first block appears at column 0 and
 * indented, because the difference between those two is where #71 hid while
 * this sweep reported zero.
 */
const FRAGMENTS = [
  // L-1, L-2, L-5 — headings, at every level that behaves differently
  '# A',
  '## B',
  '### C',
  '###### F',
  '#',
  '# A #',
  '# A ' + BS + '#',
  'Setext' + '\n' + '=====',
  'Setext2' + '\n' + '-----',
  'Two' + '\n' + 'lines' + '\n' + '=====',

  // L-1, L-6 — bullets, including the empty marker and the other characters
  '- a',
  '- ' ,
  '-',
  '* a',
  '+ a',
  '* ',

  // L-12, S-5, S-6 — ordinals at the boundaries RFC 0039 names
  '1. a',
  '2. b',
  '3. c',
  '1) a',
  '2) b',
  '10. a',
  '1. ',
  '11. ',
  '999999999. a',
  '0. a',

  // L-7 — nesting, at each width that matters
  '  - n',
  '   1. n2',
  '    - n3',
  '  * m',
  '  1) n4',

  // L-3, E-5, RFC 0051 — definitions, which CommonMark removes first
  '[x]: /x',
  '  [y]: /y',
  TAB + '[z]: /z',
  '[a]: /a' + '\n' + '[b]: /b',
  '[t]: /t "title"',
  '[u]: </u>',

  // L-3, L-9, E-5 — paragraphs, hard breaks, trailing whitespace
  'para',
  'one' + '\n' + 'two',
  'first' + SP + SP,
  'trail' + SP,
  'x' + BS,
  'hard' + BS + '\n' + 'break',
  '  cont',
  '|h|' + '\n' + '|-|' + '\n' + '|v|',
  '  |h|' + '\n' + '  |-|' + '\n' + '  |v|',

  // L-3 — block quotes
  '> q',
  '> q' + '\n' + '> r',
  '>',
  '  > q',
  '> - a',

  // L-11, P-5, P-8 — code blocks in every spelling
  F + 'js',
  'code',
  F,
  F + '\n' + 'x' + '\n' + F,
  T + 'py' + '\n' + 'y' + '\n' + T,
  F + 'a' + '`' + 'b',
  '    indented',
  '  ' + F + 'sh',
  '  x',
  '  ' + F,
  F + '\n' + 'tail' + SP + SP + '\n' + F,

  // L-3 — thematic breaks, in all four spellings
  '---',
  '***',
  '___',
  '- - -',
  '  ---',

  // L-10 — front matter, and the shapes #35 and #48 are about
  '---' + '\n' + 'title: x' + '\n' + '---',
  '---' + '\n' + '\n' + 'title: x' + '\n' + '---',

  // L-8, E-5 — HTML blocks, where this specification follows nothing
  '<div>',
  '</div>',
  '<pre>' + '\n' + 'x' + SP + SP + '\n' + '</pre>',
  '<!-- c -->',

  // E-4 — escapes that look like markers
  '1' + BS + '. a',
  BS + '- a',
  BS + '# a',

  // tabs, which count as four columns and are easy to get wrong
  TAB + 'tabbed',
  '-' + TAB + 'a',
  '1.' + TAB + 'b',
]

/** The conformance suite, for the mutating generator. */
const SUITE = (() => {
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    const raw = readFileSync(join(here, '..', 'test', 'fixtures', 'examples.json'), 'utf8')
    return JSON.parse(raw).examples.map((e) => e.markdown)
  } catch {
    return []
  }
})()

const count = Number(process.argv[2] ?? 40000)
let rng = Number(process.argv[3] ?? 1234567)
const rand = (n) => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff
  return rng % n
}
const pick = (xs) => xs[rand(xs.length)]

/** Fragments joined with newlines, and sometimes a blank line between them. */
const assembled = () => {
  const parts = []
  for (let i = 0, k = 1 + rand(12); i < k; i++) {
    parts.push(pick(FRAGMENTS))
    if (rand(3) === 0) parts.push('')
  }
  return parts.join('\n') + '\n'
}

/**
 * A suite document with one to three edits. The edits are the ones that turn a
 * document people write into one they nearly wrote: a line added, a line
 * removed, indentation changed, a marker swapped, a character doubled.
 */
const EDITS = [
  // insert a fragment as its own line
  (lines) => {
    lines.splice(rand(lines.length + 1), 0, pick(FRAGMENTS))
    return lines
  },
  // delete a line
  (lines) => {
    if (lines.length > 1) lines.splice(rand(lines.length), 1)
    return lines
  },
  // indent a line, or outdent it
  (lines) => {
    const i = rand(lines.length)
    lines[i] = rand(2) ? SP.repeat(1 + rand(4)) + lines[i] : lines[i].replace(/^[ \t]+/, '')
    return lines
  },
  // swap a marker for another
  (lines) => {
    const i = rand(lines.length)
    lines[i] = lines[i]
      .replace(/^(\s*)- /, (m, s) => s + pick(['* ', '+ ', '1. ', '2. ', '11. ', '1) ']))
      .replace(/^(\s*)#+ /, (m, s) => s + pick(['## ', '#### ', '# ']))
    return lines
  },
  // add trailing whitespace, or a trailing backslash
  (lines) => {
    const i = rand(lines.length)
    lines[i] = lines[i] + pick([SP, SP + SP, TAB, BS])
    return lines
  },
  // duplicate a line
  (lines) => {
    const i = rand(lines.length)
    lines.splice(i, 0, lines[i])
    return lines
  },
  // blank a line, or remove a blank one
  (lines) => {
    const i = rand(lines.length)
    lines[i] = lines[i].trim() === '' ? pick(FRAGMENTS) : ''
    return lines
  },
]

const mutated = () => {
  let lines = pick(SUITE).replace(/\n$/, '').split('\n')
  for (let i = 0, k = 1 + rand(3); i < k; i++) lines = pick(EDITS)(lines)
  return lines.join('\n') + '\n'
}

const generators = SUITE.length ? [assembled, mutated] : [assembled]

// ── the checks ──────────────────────────────────────────────────────

/** Why `md` fails, or null. The same question the loop asks, reusable. */
function failure(md) {
  let tree
  try {
    tree = lift(md)
  } catch {
    return null // not a conforming document; lift is defined over those (§2.2)
  }
  if (problems) {
    const found = problems(tree)
    if (found.length) return { kind: 'ill-formed', why: found[0] }
  }
  let out
  try {
    out = project(tree)
  } catch (e) {
    return { kind: 'broke', why: `project threw — ${e.message.split('\n')[0]}` }
  }
  if (!equal(lift(out), tree)) {
    return { kind: 'broke', why: 'the projection lifts to a different tree' }
  }
  if (project(lift(out)) !== out) {
    return { kind: 'broke', why: 'the second projection is not byte-identical' }
  }
  return null
}

/**
 * Shrink a failing document while it keeps failing the same way. Line by line
 * first, then character by character, because the document that comes out of a
 * generator is never the document worth writing down.
 */
function shrink(md, why) {
  const same = (cand) => cand.trim() !== '' && failure(cand)?.why === why
  let best = md
  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    const lines = best.replace(/\n$/, '').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const cand = lines.slice(0, i).concat(lines.slice(i + 1)).join('\n') + '\n'
      if (same(cand)) {
        best = cand
        changed = true
        break
      }
    }
    if (changed) continue
    for (let i = 0; i < best.length; i++) {
      const cand = best.slice(0, i) + best.slice(i + 1)
      if (same(cand)) {
        best = cand
        changed = true
        break
      }
    }
    if (!changed) break
  }
  return best
}

// ── the run ─────────────────────────────────────────────────────────

const seen = new Map() // one entry per distinct complaint
let refused = 0
let illFormed = 0
let broke = 0
const fromGenerator = { assembled: 0, mutated: 0 }

for (let i = 0; i < count; i++) {
  const gen = pick(generators)
  const md = gen()
  const bad = failure(md)
  if (!bad) {
    // A document lift refuses is not a failure; count it so the output says how
    // much of the space was even eligible.
    try {
      lift(md)
    } catch {
      refused++
    }
    continue
  }
  if (bad.kind === 'ill-formed') illFormed++
  else broke++
  fromGenerator[gen === mutated ? 'mutated' : 'assembled']++

  const key = bad.why.replace(/[^a-z: ]+/gi, '').slice(0, 60)
  if (!seen.has(key)) seen.set(key, { why: bad.why, n: 0, examples: [] })
  const slot = seen.get(key)
  slot.n++
  if (slot.examples.length < 3) {
    const small = shrink(md, bad.why)
    if (!slot.examples.includes(small)) slot.examples.push(small)
    slot.examples.sort((x, y) => x.length - y.length)
  }
}

const failures = illFormed + broke
console.log(
  `${count} documents · ${refused} not conforming · ${illFormed} not well-formed · ${broke} failed the round trip`,
)
console.log(
  `searched: ${FRAGMENTS.length} fragments, up to 12 per document` +
    (SUITE.length ? `, and ${SUITE.length} suite documents with 1–3 edits` : ', no suite found'),
)
if (!problems) console.log('(no src/wellformed.js — S-7 was not checked)')

if (!failures) {
  console.log('\nNo failures. That is evidence, not proof: the space above is the claim.')
  process.exit(0)
}

console.log(
  `\nfrom: ${fromGenerator.assembled} assembled, ${fromGenerator.mutated} mutated` +
    `\n\n${seen.size} distinct complaint(s), each shrunk:\n`,
)
for (const { why, n, examples } of [...seen.values()].sort((a, b) => b.n - a.n)) {
  console.log(`  ${n}×  ${why.slice(0, 200)}`)
  for (const md of examples) console.log(`      ${JSON.stringify(md)}`)
  console.log()
}
process.exitCode = 1
