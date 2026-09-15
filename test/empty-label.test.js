// P-1, P-8 — a node whose label is empty.
//
// E-4 lets a label be empty: CommonMark reads `-` as an empty list item and
// `##` as an empty ATX heading, and an item whose first block is a list has no
// inline content of its own. Written as marker, space, label, such a node ends
// its line in whitespace, which P-8 forbids. The canonical spelling is the bare
// marker, and these tests hold projection to it.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const item = (label, children = []) => ({ kind: 'item', label, content: [], children })
const section = (label, children = []) => ({ kind: 'section', label, content: [], children })
const root = (children) => ({ content: [], children })

/** P-8, then L1 both ways: the output lifts back, and projects again unchanged. */
function holds(tree, expected) {
  const once = project(tree)
  assert.equal(once, expected)
  const trailing = once.split('\n').filter((line) => /[ \t]$/.test(line))
  assert.deepEqual(trailing, [], 'a line ends in whitespace (P-8)')
  assert.ok(equal(lift(once), tree), `lifted back to ${stringify(lift(once))}`)
  assert.equal(project(lift(once)), once, 'second projection is not byte-stable')
}

test('P-8 · an empty item is the bare marker', () => {
  holds(root([item('')]), '-\n')
})

test('P-8 · an empty heading is the bare marker', () => {
  holds(root([section('')]), '#\n')
  holds(root([section('A', [section('', [item('x')])])]), '# A\n\n##\n\n- x\n')
})

test('P-8 · nested empty items', () => {
  // The shape `- 2026. 1. 15. 오전 10:00` lifts to: CommonMark reads each
  // `N. ` as an ordered list opening inside the one before it.
  const tree = lift('# 기록\n\n- 2026. 1. 15. 오전 10:00\n- 회의 시작\n')
  assert.ok(
    equal(tree, root([section('기록', [item('', [item('', [item('', [item('오전 10:00')])])]), item('회의 시작')])])),
    `lifted to ${stringify(tree)}`,
  )
  holds(tree, '# 기록\n\n-\n  -\n    -\n      - 오전 10:00\n- 회의 시작\n')
})

test('P-8 · an empty item beside labelled siblings, at every depth', () => {
  holds(root([item('a'), item('')]), '- a\n-\n')
  holds(root([item(''), item('b')]), '-\n- b\n')
  holds(root([item('a', [item('b', [item('c')]), item('')])]), '- a\n  - b\n    - c\n  -\n')
})

test('P-8 · an empty item whose first block was a list', () => {
  holds(lift('- - x\n'), '-\n  - x\n')
})

// PROTOTYPE (RFC 0046, mindmapmarkdown/spec#45) — an empty item as the first
// child of a labelled item. Under P-7 as written no spelling round-trips: `- a`
// then `  -` is a setext heading underline. The proposed exception puts one blank
// line between the label and the nested list.

test('RFC 0046 · an empty first child is separated from the label by a blank line', () => {
  holds(lift('- a\n\n  -\n'), '- a\n\n  -\n')
})

test('RFC 0046 · siblings after it stay tight', () => {
  holds(lift('- a\n\n  -\n- b\n'), '- a\n\n  -\n- b\n')
  holds(root([item('a', [item(''), item('c')]), item('b')]), '- a\n\n  -\n  - c\n- b\n')
})

test('RFC 0046 · an empty first child with children of its own', () => {
  holds(lift('- a\n\n  -\n    - b\n'), '- a\n\n  -\n    - b\n')
})

test('RFC 0046 · at any depth', () => {
  holds(lift('- x\n  - a\n\n    -\n'), '- x\n  - a\n\n    -\n')
  holds(root([section('S', [item('a', [item('')])])]), '# S\n\n- a\n\n  -\n')
})

test('RFC 0046 · not when the empty item is not the first child', () => {
  holds(root([item('a', [item('b'), item('')])]), '- a\n  - b\n  -\n')
})

test('RFC 0046 · not when the parent label is empty too', () => {
  holds(root([item('', [item('')])]), '-\n  -\n')
})
