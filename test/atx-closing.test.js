// E-4 — an ATX heading's closing sequence is not part of its label, and an
// escaped `#` is not a closing sequence.
//
// The cases are CommonMark's own (spec §4.2, ATX headings), read through E-4:
// the label keeps inline source as written, so an escaped `#` keeps its
// backslash.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift, liftRaw } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const label = (md) => lift(md).children[0].label

const cases = [
  ['a closing sequence comes off', '## Title #\n', 'Title'],
  ['a longer closing sequence comes off', '## Title ####\n', 'Title'],
  ['trailing spaces after it come off too', '## Title ##   \n', 'Title'],
  ['an escaped # is not a closing sequence', '## Title \\#\n', 'Title \\#'],
  ['an escaped run is not one either', '### foo \\###\n', 'foo \\###'],
  ['a run after an escaped # is not preceded by a space', '## foo #\\##\n', 'foo #\\##'],
  ['a # with nothing before it is text', '# C#\n', 'C#'],
  ['a # followed by more text is text', '### foo ### b\n', 'foo ### b'],
  ['a heading that is only a closing sequence is empty', '## #\n', ''],
  ['a bare opener is empty', '##\n', ''],
  ['a setext heading loses its underline', 'Title\n=====\n', 'Title'],
  ['a setext heading beginning with # keeps it', '#hashtag\n---\n', '#hashtag'],
]

for (const [what, md, expected] of cases) {
  test(`E-4 · ${what}`, () => {
    assert.equal(label(md), expected)
  })
}

test('spec#85 · a setext heading ending in # does not conform', () => {
  // `Title #` underlined with `===` has the label `Title #` by E-4, and P-6
  // writes every heading as ATX. Written that way the trailing `#` is a
  // closing sequence, so the label comes back `Title` and the tree does not
  // survive its own projection.
  //
  // Before RFC 0085 this document lifted, and the tree it produced was the
  // kind S-7 rejects at projection time — a tree with no canonical document.
  // Under RFC 0085 the document is not a conforming document and lift says so,
  // naming the rule. This is the cost the RFC describes, in a case small
  // enough to keep as a test.
  assert.throws(() => lift('Title #\n===\n'), /§1.2.3.*not well-formed/s)
  assert.equal(liftRaw('Title #\n===\n').children[0].label, 'Title #')
})

test('L1 · a section labelled with an escaped # survives the round trip', () => {
  const tree = lift('# Guide\n\n## Title \\#\n')
  assert.equal(tree.children[0].children[0].label, 'Title \\#')
  const back = lift(project(tree))
  assert.ok(equal(back, tree), `lifted back to ${stringify(back)}`)
})
