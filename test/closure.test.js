// S-7 — a well-formed tree survives its own projection. Proposed by
// mindmapmarkdown/spec RFC 0043; see spec#42 for how the gap was found.
//
// The conformance suite cannot reach this, for the reason it cannot reach S-1,
// S-2 or S-4: it is a list of documents, and lift never produces a tree that
// fails §2.4. Only a tree built by hand can.
//
// Licensed under Apache-2.0. See LICENSE.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { block, node, root } from '../src/tree.js'
import { problems, wellFormed } from '../src/wellformed.js'

const B = '\\'
const under = (child) => root([], [node('section', '가지', [], [child])])
const holding = (entry, after = []) => root([], [node('section', '가지', [entry], []), ...after])

// ── Trees S-7 rejects ───────────────────────────────────────────────

const rejected = [
  ['an item labelled with an ordered-list marker', under(node('item', '1. 단계'))],
  ['an item labelled with a bullet marker', under(node('item', '- 하이픈'))],
  ['an item labelled with an ATX heading opener', under(node('item', '# 샵'))],
  ['a section whose label ends in a closing sequence', under(node('section', '제목 #'))],
  ['a paragraph whose source opens a list', holding(block('paragraph', '- 목록처럼'))],
  ['a paragraph whose source is an ATX heading', holding(block('paragraph', '# 제목처럼'))],
  ['a paragraph whose source is a setext heading', holding(block('paragraph', '줄\n==='))],
  ['a block_quote whose source is not a block quote', holding(block('block_quote', '인용 아님'))],
]

for (const [what, tree] of rejected) {
  test(`S-7 · rejects ${what}`, () => {
    const found = problems(tree)
    assert.equal(found.length, 1, found.join('\n'))
    assert.match(found[0], /^S-7: /)
    assert.throws(() => project(tree), /S-7/)
  })
}

// ── Trees it accepts ────────────────────────────────────────────────
//
// E-4 keeps inline source as written, so an escaped label is a different label,
// and inline markup in a label is not a problem at all.

const accepted = [
  ['an escaped ordered-list marker', under(node('item', `1${B}. 단계`))],
  ['emphasis in an item label', under(node('item', '*별표* 그대로'))],
  ['strong emphasis in an item label', under(node('item', '가 **굵게**'))],
  ['a section label beginning with #', under(node('section', '# 샵'))],
]

for (const [what, tree] of accepted) {
  test(`S-7 · accepts ${what}`, () => {
    assert.deepEqual(problems(tree), [])
    assert.ok(wellFormed(tree))
  })
}

// ── How S-7 sits with the other rules ───────────────────────────────

test('S-7 · a tree failing a structural rule reports that rule, not S-7', () => {
  const tree = root([], [node('item', 'x', [], [node('section', 'y')])])
  const found = problems(tree)
  assert.equal(found.length, 1)
  assert.match(found[0], /^S-1: /)
})

test('S-7 · the message names the node where the trees part', () => {
  const [found] = problems(under(node('item', '1. 단계')))
  assert.match(found, /\/0\/0: label "1\. 단계" comes back as ""/)
})

// ── Lift never produces a tree S-7 rejects ──────────────────────────
//
// §2.4 says lift cannot produce a tree that is not well-formed. With S-7 that is
// §1.2.4 L1 restated, and every document in the suite is a case of it.

const here = dirname(fileURLToPath(import.meta.url))
const suite = JSON.parse(readFileSync(join(here, 'fixtures', 'examples.json'), 'utf8'))

test('S-7 · every tree the suite lifts to is well-formed', () => {
  for (const e of suite.examples) {
    assert.deepEqual(problems(lift(e.markdown)), [], `example ${e.example}`)
  }
})
