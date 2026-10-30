// RFC 0067 measured without RFC 0057 Part 1 underneath it (spec#67), and then
// RFC 0057 Part 1 measured on top of it (spec#55, spec#57).
//
// RFC 0067's only prototype was branched from RFC 0057's, which is objected to,
// so "no document that round-trips today stops doing so" could not be checked.
// `rfc/0067-on-accepted` is the accepted rules plus RFC 0067 alone and answered
// that. This branch adds Part 1 back, above RFC 0085, so that both outcomes can
// be compared in one configuration — which is what Part 1's objection of
// 2026-10-14 asked for and what no branch could show until now.
//
// `MMD_P1=0` lifts without Part 1, for the comparison the decision quotes.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift, liftRaw } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

const BS = String.fromCharCode(92)
const roundTrips = (md) => {
  const t = lift(md)
  return equal(lift(project(t)), t)
}

// ── 1. What Part 1 costs ────────────────────────────────────────────
//
// These are the documents Part 1's objection of 2026-10-14 is about. Each
// round-trips without Part 1 — on `mindmapmd` main, and on
// `rfc/0067-on-accepted` — and each stops conforming with it.
//
// The mechanism is the objection's: Part 1 writes a label's later lines at the
// item's content column, and a `=` that was a lazy continuation line at column
// zero becomes a setext underline once it is indented into the item. That
// projection holds a heading inside a list item, which `S-1` forbids.
//
// Under RFC 0085 this is not a broken round trip but a document that does not
// conform, and lift says so. That is resolution 2 of the objection.

test('RFC 0057 Part 1 · a lazy = under an item label stops conforming', () => {
  for (const md of [
    '- a  \n=\n',
    '- a' + BS + '\n=\n',
    '- ' + BS + '\n=\n',
    '1. a  \n=\n',
    '- a  \n===\n',
  ]) {
    assert.throws(() => lift(md), /not a conforming document/, JSON.stringify(md))
  }
  // The tree is still the one E-4 records; it is the projection that has no
  // spelling, which is why RFC 0085 is what turns the document away.
  assert.equal(liftRaw('- a' + BS + '\n=\n').children[0].label, 'a' + BS + '\n=')
})

test('RFC 0057 Part 1 · a label whose later line opens nothing is unaffected', () => {
  assert.ok(roundTrips('- a  \nb\n'), 'hard break, then ordinary text')
})

// ── 2. What Part 1 buys ─────────────────────────────────────────────

test('RFC 0057 Part 1 · a wrapped label is the text that was written', () => {
  // Without Part 1 the fold leaves the container's indentation inside the
  // label — `a   b` at depth one, `a     b` at depth two — because E-4 keeps
  // every line as it appears. RFC 0067's own table says the label should be
  // `a b`, "one line, nothing to indent", and Part 1 is what makes that true.
  assert.equal(lift('- a\n  b\n').children[0].label, 'a b')
  assert.equal(lift('- x\n  - a\n    b\n').children[0].children[0].label, 'a b')
  assert.ok(roundTrips('- a\n  b\n'))
  assert.ok(roundTrips('- x\n  - a\n    b\n'))
})

test('RFC 0057 Part 1 · a hard break below the top level becomes writable', () => {
  // `rfc/0067-on-accepted` refuses both of these: the label keeps the item's
  // content column on its second line, projection adds the item's indentation
  // again, and the tree does not survive its own projection. RFC 0067 cannot
  // reach them, because a hard break is not a soft one — which is the sentence
  // in RFC 0067 saying Part 1 "is still needed, for hard breaks only".
  assert.ok(roundTrips('- x\n  - a  \n    b\n'))
  assert.ok(roundTrips('- x\n  - a' + BS + '\n    b\n'))
  assert.equal(
    lift('- x\n  - a' + BS + '\n    b\n').children[0].children[0].label,
    'a' + BS + '\nb',
  )
})

// ── 3. RFC 0067 on its own, unchanged by Part 1 ─────────────────────

test('RFC 0067 · a wrapped heading folds to one space, and #64 is fixed', () => {
  const tree = lift('Head\nmore\n===\n')
  assert.equal(tree.children[0].label, 'Head more')
  assert.equal(project(tree), '# Head more\n')
})

test('RFC 0067 · S-8 refuses a heading whose label carries a hard break', () => {
  assert.throws(() => lift('Head' + BS + '\nmore\n===\n'), /S-8/)
})
