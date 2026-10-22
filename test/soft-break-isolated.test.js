// RFC 0067 measured without RFC 0057 Part 1 underneath it (spec#67).
//
// The RFC's only prototype was branched from RFC 0057's, which is objected to,
// so "no document that round-trips today stops doing so" could not be checked.
// This branch is the accepted rules plus RFC 0067 alone, and these are the two
// things that measurement had to answer.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

const BS = String.fromCharCode(92)
const roundTrips = (md) => {
  const t = lift(md)
  return equal(lift(project(t)), t)
}

// ── 1. Nothing that round-trips without this rule stops doing so ────
//
// These three are refused on `rfc/soft-break-label`, which carries RFC 0057
// Part 1. They are the documents its objection is about. Here they pass, which
// says the refusals belong to that rule and not to this one.

test('RFC 0067 · a lazy = under an item label still round-trips', () => {
  assert.ok(roundTrips('- a  \n=\n'), 'two-space hard break, then a lazy =')
  assert.ok(roundTrips('- a' + BS + '\n=\n'), 'backslash hard break, then a lazy =')
  assert.ok(roundTrips('- ' + BS + '\n=\n'), 'empty label, hard break, then a lazy =')
})

// ── 2. What the rule does on its own ────────────────────────────────

test('RFC 0067 · a wrapped heading folds to one space, and #64 is fixed', () => {
  const tree = lift('Head\nmore\n===\n')
  assert.equal(tree.children[0].label, 'Head more')
  assert.equal(project(tree), '# Head more\n')
})

test('RFC 0067 · S-8 refuses a heading whose label carries a hard break', () => {
  assert.throws(() => lift('Head' + BS + '\nmore\n===\n'), /S-8/)
})

test('RFC 0067 · an item label keeps its container indentation without RFC 0057', () => {
  // The RFC's table says `- x` / `  - a` / `    b` gives the label `a b`,
  // "one line, nothing to indent". That holds only with RFC 0057 Part 1, which
  // is what takes the container's columns off a label's later lines. Alone,
  // this rule folds the break to a space and the indentation stays in the
  // label — so the fold is one space plus whatever the line was indented by.
  //
  // Nothing breaks: both documents round-trip, and the tree is stable. But a
  // section's label is right on its own where an item's is not, which is a
  // decision the two RFCs have to make together.
  assert.equal(lift('- a\n  b\n').children[0].label, 'a   b')
  assert.equal(lift('- x\n  - a\n    b\n').children[0].children[0].label, 'a     b')
  assert.ok(roundTrips('- a\n  b\n'))
  assert.ok(roundTrips('- x\n  - a\n    b\n'))
})
