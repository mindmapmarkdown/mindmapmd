// RFC 0069 (spec#61) — an empty label with content and children.
//
// The rule: when a node's label is empty and it has children, its first
// content entry follows the bare marker directly. P-7's blank line there, plus
// the blank line before the nested list, leaves two in a row once the
// definition is read out again, and two blank lines end a list item.
//
// These are the RFC's three examples, which it states are canonical, measured
// here on a configuration that carries **no RFC 0058 in either form**. The
// decision recorded in the RFC names that as the one thing it had never been
// measured without; this file is that measurement.
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

test('RFC 0069 · an empty label, a definition, and a child', () => {
  const tree = canonical('-\n  [x]: /x\n\n  - b\n')
  const item = tree.children[0]
  assert.equal(item.label, '')
  assert.equal(item.content[0].block, 'link_reference_definition')
  assert.equal(item.children.length, 1, 'the child must not come back as a sibling')
  assert.equal(item.children[0].label, 'b')
})

test('RFC 0069 · with no children, P-7 is unchanged', () => {
  const tree = canonical('-\n\n  [x]: /x\n')
  assert.equal(tree.children[0].children.length, 0)
})

test('RFC 0069 · a label of its own puts the content back where P-7 had it', () => {
  const tree = canonical('- a\n\n  [x]: /x\n\n  - b\n')
  assert.equal(tree.children[0].label, 'a')
  assert.equal(tree.children[0].children.length, 1)
})

test('RFC 0069 · the second condition is load-bearing', () => {
  // Without children the blank line stays, so the two documents differ in
  // exactly the way the rule says they should.
  assert.equal(project(lift('-\n\n  [x]: /x\n')), '-\n\n  [x]: /x\n')
  assert.equal(project(lift('-\n  [x]: /x\n\n  - b\n')), '-\n  [x]: /x\n\n  - b\n')
})
