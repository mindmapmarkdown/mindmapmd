// The conformance suite, run against this implementation.
//
// examples.json is generated from spec.md and is the suite for lift. Projection
// is checked the other way round — a tree in, a document out — which is only a
// byte-for-byte test when the example's Markdown is itself canonical, so that
// case is detected rather than assumed.
//
// Licensed under Apache-2.0. See LICENSE.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const here = dirname(fileURLToPath(import.meta.url))
const suite = JSON.parse(readFileSync(join(here, 'fixtures', 'examples.json'), 'utf8'))
const from = readFileSync(join(here, 'fixtures', 'EXAMPLES_FROM.txt'), 'utf8').trim()

test(`the suite is the one generated from spec.md at ${from.slice(0, 8)}`, () => {
  assert.ok(suite.examples.length > 0, 'the suite is empty')
})

// ── L1, first half — lift every conforming document to the prescribed tree ──

for (const e of suite.examples) {
  test(`lift · example ${e.example} · §${e.section} · ${e.heading}`, () => {
    const got = lift(e.markdown)
    assert.ok(
      equal(got, e.tree),
      `expected ${JSON.stringify(e.tree)}\n     got ${stringify(got)}`,
    )
  })
}

// ── L1, second half — project every tree to that tree's canonical form ──
//
// Every example's tree must project to *something*, and that something must
// lift back to the same tree. That is the tree round-trip, and it holds for
// conforming documents whether or not they are canonical.

for (const e of suite.examples) {
  test(`tree round-trip · example ${e.example}`, () => {
    const out = project(e.tree)
    assert.ok(
      equal(lift(out), e.tree),
      `projected:\n${out}\nlifted back to ${stringify(lift(out))}`,
    )
  })
}

// ── Byte identity, where the example is canonical ──
//
// L1 requires projecting the lift of a *canonical* document to return that
// document byte for byte. An example whose Markdown is not canonical carries no
// such requirement, so the two groups are counted rather than conflated.

const canonical = []
const notCanonical = []
for (const e of suite.examples) {
  ;(project(e.tree) === e.markdown ? canonical : notCanonical).push(e.example)
}

test('projection is idempotent — the second round-trip is byte-stable', () => {
  for (const e of suite.examples) {
    const once = project(e.tree)
    const twice = project(lift(once))
    assert.equal(twice, once, `example ${e.example} is not byte-stable on the second pass`)
  }
})

test('canonical examples come back byte for byte', () => {
  for (const n of canonical) {
    const e = suite.examples.find((x) => x.example === n)
    assert.equal(project(e.tree), e.markdown)
  }
  assert.ok(canonical.length > 0, 'no example in the suite is canonical')
})

test(`coverage · ${canonical.length} of ${suite.examples.length} examples are canonical`, () => {
  // Not a requirement — a record. An example is written to demonstrate a lift
  // rule, and is under no obligation to be canonical. But the suite is the only
  // test projection has, so how much of it exercises byte identity is worth
  // printing rather than leaving to be discovered.
  console.log(`    canonical:     ${canonical.join(', ') || '(none)'}`)
  console.log(`    not canonical: ${notCanonical.join(', ') || '(none)'}`)
})
