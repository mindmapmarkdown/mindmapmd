// A sweep for documents whose meaning does not survive the round trip.
//
//   node tools/sweep.mjs [count] [seed]
//
// The conformance suite is a list of documents someone thought of. This is the
// other half: it builds documents out of fragments, in combinations nobody
// would write on purpose, and checks each one against the two things the
// specification promises.
//
//   1. §1.2.4 L1 — lift and canonical projection are mutually inverse. Project
//      the tree, lift the result, compare. Then project again and compare the
//      bytes, because a round trip that is not byte-stable is not one.
//   2. §2.4 — lift cannot produce a tree that is not well-formed. Checked only
//      where the implementation has S-7 (src/wellformed.js, RFC 0043); without
//      it, only the first check runs.
//
// It earned its place on 2026-10-02. Run over 40,000 documents against every
// accepted and proposed rule merged together, it failed 900 of them and the
// failures were four distinct defects — one an implementation bug in how a
// block's starting column was measured, three gaps in the specification
// (mindmapmarkdown/spec#55, #56, #61). None of them had a test, and none would
// have been written by hand: each needs two or three unusual constructs in one
// document to show up.
//
// It is not a conformance test and it is not in CI. It is a question you ask
// before claiming a round-trip rule is true.
//
// Licensed under Apache-2.0. See LICENSE.

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

const SP = ' '
const TAB = '\t'
const BS = '\\'
const F = '```'

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
 * Fragments, chosen because each one has been the near side of a defect: an
 * empty marker, an ordinal that cannot start a list, a definition CommonMark
 * removes before anything else, indentation at every significant width, a line
 * that ends in whitespace, a fence, a table, a thematic break.
 *
 * **Indented copies earn their place separately.** On 2026-10-03 this sweep
 * reported zero over 240,000 documents while `-` followed by `␣␣---` still
 * failed, because no fragment could put a thematic break inside a list item: a
 * generator that cannot reach a known failure overstates what its zero means.
 * Every construct that can be the first block of a list item is here twice, at
 * column 0 and indented two.
 */
const FRAGMENTS = [
  '# A',
  '## B',
  '#',
  '- a',
  '- ',
  '1. a',
  '2. b',
  '1) a',
  '3. c',
  '1. ',
  '10. a',
  '[x]: /x',
  '  [y]: /y',
  TAB + '[z]: /z',
  'para',
  'first' + SP + SP,
  'x' + BS,
  '> q',
  F + 'js',
  'code',
  F,
  '    indented',
  '  - n',
  '   1. n2',
  '---',
  '|h|\n|-|\n|v|',
  '  ---',
  '  > q',
  '  para',
  '  ' + F + 'sh',
  '  x',
  '  ' + F,
  '  |h|\n  |-|\n  |v|',
]

const count = Number(process.argv[2] ?? 40000)
let rng = Number(process.argv[3] ?? 1234567)
const rand = (n) => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff
  return rng % n
}

const document = () => {
  const parts = []
  for (let i = 0, k = 1 + rand(6); i < k; i++) {
    parts.push(FRAGMENTS[rand(FRAGMENTS.length)])
    if (rand(3) === 0) parts.push('')
  }
  return parts.join('\n') + '\n'
}

const seen = new Map() // one example per distinct complaint
let refused = 0
let illFormed = 0
let broke = 0

const note = (md, why) => {
  const key = why.replace(/[^a-z: ]+/gi, '').slice(0, 60)
  if (!seen.has(key)) seen.set(key, { why, n: 0, examples: [] })
  const slot = seen.get(key)
  slot.n++
  // A complaint says what broke; the examples are what gets reduced by hand, so
  // keep a few distinct ones and show the shortest first.
  if (slot.examples.length < 5 && !slot.examples.includes(md)) slot.examples.push(md)
  slot.examples.sort((x, y) => x.length - y.length)
}

for (let i = 0; i < count; i++) {
  const md = document()

  let tree
  try {
    tree = lift(md)
  } catch {
    refused++ // not a conforming document; lift is defined over those (§2.2)
    continue
  }

  if (problems) {
    const found = problems(tree)
    if (found.length) {
      illFormed++
      note(md, found[0])
      continue
    }
  }

  let out
  try {
    out = project(tree)
  } catch (e) {
    broke++
    note(md, `project threw — ${e.message.split('\n')[0]}`)
    continue
  }
  if (!equal(lift(out), tree)) {
    broke++
    note(md, 'the projection lifts to a different tree')
  } else if (project(lift(out)) !== out) {
    broke++
    note(md, 'the second projection is not byte-identical')
  }
}

const failures = illFormed + broke
console.log(
  `${count} documents · ${refused} not conforming · ${illFormed} not well-formed · ${broke} failed the round trip`,
)
if (!problems) console.log('(no src/wellformed.js — S-7 was not checked)')
if (!failures) {
  console.log('\nNo failures.')
  process.exit(0)
}

console.log(`\n${seen.size} distinct complaint(s):\n`)
for (const { why, n, examples } of [...seen.values()].sort((a, b) => b.n - a.n)) {
  console.log(`  ${n}×  ${why.slice(0, 160)}`)
  for (const md of examples) console.log(`      ${JSON.stringify(md)}`)
  console.log()
}
process.exitCode = 1
