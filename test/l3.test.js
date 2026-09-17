// L-3 — a block attaches to the nearest node preceding it in document order.
//
// The suite has no example of a block after a list, which is how this
// implementation came to attach one to the enclosing section instead. These
// cases hold it to the rule as written, and check L1 for each: the tree
// projects to a document that lifts back to it.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { block, equal, node, root, stringify } from '../src/tree.js'

const p = (source) => block('paragraph', source)

function lifts(md, expected) {
  const tree = lift(md)
  assert.ok(equal(tree, expected), `lifted to ${stringify(tree)}`)
  const back = lift(project(tree))
  assert.ok(equal(back, tree), `projected:\n${project(tree)}\nlifted back to ${stringify(back)}`)
}

test('L-3 · a paragraph after a list attaches to its last item', () => {
  lifts(
    '# A\n\n- x\n- y\n\nafter\n',
    root([], [node('section', 'A', [], [node('item', 'x'), node('item', 'y', [p('after')])])]),
  )
})

test('L-3 · after a nested list, to the deepest last item', () => {
  lifts(
    '- a\n  - b\n\nafter\n',
    root([], [node('item', 'a', [], [node('item', 'b', [p('after')])])]),
  )
})

test('L-3 · inside an item, after the list nested in it, to that list’s last item', () => {
  lifts(
    '- a\n  - b\n\n  inside\n',
    root([], [node('item', 'a', [], [node('item', 'b', [p('inside')])])]),
  )
})

test('L-3 · a heading after a list takes the content that follows it', () => {
  lifts(
    '# A\n\n- x\n\n## B\n\nafter\n',
    root([], [node('section', 'A', [], [node('item', 'x'), node('section', 'B', [p('after')])])]),
  )
})

test('L-3 · a paragraph between a heading and a list stays with the heading', () => {
  lifts(
    '# A\n\nbefore\n\n- x\n',
    root([], [node('section', 'A', [p('before')], [node('item', 'x')])]),
  )
})

test('L-3 · content before any node attaches to the root', () => {
  lifts('before\n\n# A\n', root([p('before')], [node('section', 'A')]))
})

test('L-3 · a paragraph after a list at the root attaches to its last item', () => {
  lifts('- x\n\nafter\n', root([], [node('item', 'x', [p('after')])]))
})
