// RFC 0079 (spec#74) — how many columns E-5 removes from a block's later lines.
//
// The lesser of two numbers: what the block's first line gave up, and what P-4
// will indent the block by. They agree whenever a block begins at the content
// column of the node it belongs to, which is almost always; each of the two
// documents below is a case where they do not, and each is what the other
// answer gets wrong.
//
// The number P-4 will add is the content column of the node the block is
// **attached** to (L-3), not of the CommonMark container it was written inside.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'
import { problems } from '../src/wellformed.js'

/** The tree survives its own projection, and the second pass is byte-stable. */
function roundTrips(md) {
  const tree = lift(md)
  assert.deepEqual(problems(tree), [], 'lift produced a tree that is not well-formed')
  const out = project(tree)
  assert.ok(equal(lift(out), tree), `lifted back to ${stringify(lift(out))}`)
  assert.equal(project(lift(out)), out, 'the second projection is not byte-identical')
  return tree
}

test('RFC 0079 · a block attached to the root loses nothing', () => {
  // `  cont` with `    - n3` under it is one paragraph attached to the root.
  // The first line gave up two columns and P-4 will put back none, so removing
  // the two would bring `- n3` back at two columns, where a list marker
  // interrupts a paragraph and the projection holds a node the tree has not.
  const tree = roundTrips('  cont\n    - n3\n')
  assert.deepEqual(
    tree.content.map((c) => [c.block, c.source]),
    [['paragraph', 'cont\n    - n3']],
  )
  assert.equal(tree.children.length, 0)
})

test('RFC 0079 · a block attached across a container boundary keeps its columns', () => {
  // The quote is written at column 0 and L-3 attaches it to the item, so it
  // gave up no columns and P-4 will add the item's two. `pad` — removing as
  // many as P-4 adds — is what this document separates from `lesser`.
  const item = roundTrips('- a\n> q\n> r\n    - n3\n').children[0]
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['block_quote', '> q\n> r\n    - n3']],
  )
})

test('RFC 0079 · the two numbers agree at a node’s content column', () => {
  // RFC 0038's example. Both numbers are two, so the lesser is two and the
  // tree is what it was before this rule.
  const item = roundTrips('- Install\n\n  Run this\n  from the root:\n').children[0]
  assert.deepEqual(
    item.content.map((c) => [c.block, c.source]),
    [['paragraph', 'Run this\nfrom the root:']],
  )
})

test('RFC 0079 · never more than the first line gave up', () => {
  // The sentence before the amended one still binds: taking the lesser of the
  // two can only remove fewer columns, never more. Here P-4 would add two and
  // the first line gave up none.
  const item = roundTrips('- a\n> q\n> r\n').children[0]
  assert.equal(item.content[0].source, '> q\n> r')
})
