// RFC 0072 (spec#71) — what an item's label is when its first block is not a
// paragraph, and where P-4 may indent an item's content to.
//
// Part 1: a label is the node's first **inline** content, so only a paragraph
// can be one. An item whose first block is anything else has an empty label,
// and that block is content in the position it occupies. Before this, the
// block's source became the label: an item opening with a thematic break had
// the label `---`, and `- ---` is itself a thematic break, so the tree had no
// canonical projection at all.
//
// Part 2: an item whose first line is a bare marker followed by a blank line
// has its content measured from column 0, so four columns are an indented code
// block whatever the marker was. `11.` pads to four and reaches it.
//
// These are the RFC's four examples, which it states are all canonical.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'
import { problems } from '../src/wellformed.js'

/** Canonical: the document comes back byte for byte, and the tree survives. */
function canonical(md) {
  const tree = lift(md)
  assert.deepEqual(problems(tree), [], 'lift produced a tree that is not well-formed')
  const out = project(tree)
  assert.equal(out, md, 'not canonical')
  assert.ok(equal(lift(out), tree), `lifted back to ${stringify(lift(out))}`)
  return tree
}

test('RFC 0072 Part 1 · a block quote gives no label', () => {
  const item = canonical('-\n\n  > q\n').children[0]
  assert.equal(item.label, '', 'a node with no name, not a node called `> q`')
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['block_quote', '> q']],
  )
})

test('RFC 0072 Part 1 · a thematic break gives no label', () => {
  // The case that could not be written back at all: `- ---` is itself a
  // thematic break, so the old label had no canonical projection.
  const item = canonical('-\n\n  ---\n').children[0]
  assert.equal(item.label, '')
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['thematic_break', '---']],
  )
})

test('RFC 0072 Part 1 · the first block inside the item, with no blank line', () => {
  // Without the rule this is the shape that took the label `> q`: the quote is
  // the item's own first block rather than a block L-3 attaches from outside.
  const item = lift('-\n  > q\n').children[0]
  assert.equal(item.label, '')
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['block_quote', '> q']],
  )
  assert.deepEqual(problems(lift('-\n  > q\n')), [])
})

test('RFC 0072 Part 2 · three columns where four would be code', () => {
  const tree = canonical('10. a\n\n11.\n\n   > q\n')
  assert.deepEqual(
    tree.children.map((n) => [n.label, n.ordinal, n.content.map((c) => c.block)]),
    [
      ['a', 10, []],
      ['', 11, ['block_quote']],
    ],
  )
})

test('RFC 0072 Part 2 · a label of its own keeps the marker’s width plus one', () => {
  // The item does not begin with a blank line, so its content is measured from
  // the marker and four columns are exactly right there.
  const item = canonical('10. a\n\n    > q\n').children[0]
  assert.equal(item.label, 'a')
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['block_quote', '> q']],
  )
})

test('RFC 0072 Part 2 · the cap does not reach a narrow marker', () => {
  // `-` pads to two, which is below the cap, so nothing changes.
  const item = canonical('-\n\n  > q\n').children[0]
  assert.equal(item.content[0].source, '> q')
})
