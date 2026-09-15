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

import { lift } from '../src/lift.js'
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
  ['a setext heading ending in # keeps it', 'Title #\n===\n', 'Title #'],
]

for (const [what, md, expected] of cases) {
  test(`E-4 · ${what}`, () => {
    assert.equal(label(md), expected)
  })
}

test('L1 · a section labelled with an escaped # survives the round trip', () => {
  const tree = lift('# Guide\n\n## Title \\#\n')
  assert.equal(tree.children[0].children[0].label, 'Title \\#')
  const back = lift(project(tree))
  assert.ok(equal(back, tree), `lifted back to ${stringify(back)}`)
})
