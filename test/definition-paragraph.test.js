// A paragraph directly after a link reference definition — mindmapmarkdown/spec#56.
//
// NOT CONFORMANCE. These cases test a proposal in its comment period (RFC 0058).
// They sit on top of the RFC 0051 prototype, because the rule is about a
// definition and the paragraph CommonMark leaves behind when it takes one out.
//
// A definition is removed before the block structure is built, so the paragraph
// it was written in can be left with a first line that is a paragraph only
// *because* it cannot interrupt one: an empty ordered item, or an ordered list
// that does not start at 1. Written after a blank line, that line opens a list —
// the paragraph stops being content and becomes a node, and the tree does not
// survive its own projection.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const DEF = 'link_reference_definition'
const entries = (node) => node.content.map((e) => [e.block, e.source])

/** L1 both ways, and byte stability. */
function roundTrips(md) {
  const tree = lift(md)
  const out = project(tree)
  const back = lift(out)
  assert.ok(equal(back, tree), `projected:\n${out}\nlifted back to ${stringify(back)}`)
  assert.equal(project(back), out, 'second projection is not byte-stable')
  return tree
}

test('an empty ordered item left behind by a definition stays a paragraph', () => {
  const md = '[x]: /x\n1. \n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '1. '],
  ])
  assert.equal(project(tree), md, 'and the document is canonical')
})

test('an ordered list not starting at 1, likewise', () => {
  const md = '[x]: /x\n2. a\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '2. a'],
  ])
  assert.equal(project(tree), md)
})

test('ordinary prose after a definition is written the same way', () => {
  // The rule is not conditional on what the paragraph's first line looks like:
  // a rule that asked would be a second, partial grammar of CommonMark.
  const md = '[x]: /x\nSee [x].\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', 'See [x].'],
  ])
  assert.equal(project(tree), md)
})

test('a blank line between them is conforming and not canonical', () => {
  // Two documents, one tree. The bytes settle on the first round trip, as with
  // L-9 and L-10.
  const tree = roundTrips('[x]: /x\n\nSee [x].\n')
  assert.equal(project(tree), '[x]: /x\nSee [x].\n')
})

test('the paragraph keeps its own line structure', () => {
  const md = '[x]: /x\npara\nmore\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', 'para\nmore'],
  ])
  assert.equal(project(tree), md)
})

test('inside a list item, P-4 indents both lines', () => {
  const md = '- i\n\n  [x]: /x\n  1. \n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[x]: /x'],
    ['paragraph', '1. '],
  ])
  assert.equal(project(tree), md)
})

test('under a heading', () => {
  const md = '# Guide\n\n[x]: /x\n1. \n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[x]: /x'],
    ['paragraph', '1. '],
  ])
  assert.equal(project(tree), md)
})

test('a block that is not a paragraph still takes its blank line', () => {
  // A block quote can interrupt a paragraph, so it is a block of its own and
  // P-7 is unchanged for it.
  const md = '[x]: /x\n\n> q\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['block_quote', '> q'],
  ])
  assert.equal(project(tree), md)
})

test('a definition before a node is unaffected', () => {
  const tree = roundTrips('[x]: /x\n- a\n')
  assert.deepEqual(entries(tree), [[DEF, '[x]: /x']])
  assert.equal(project(tree), '[x]: /x\n\n- a\n')
})

test('adjacent definitions are one entry, and the paragraph joins that', () => {
  const tree = roundTrips('[a]: /a\n[b]: /b\npara\n')
  assert.deepEqual(entries(tree), [
    [DEF, '[a]: /a\n[b]: /b'],
    ['paragraph', 'para'],
  ])
})

test('a paragraph not preceded by a definition is unchanged', () => {
  const md = '# Guide\n\nText.\n\n[x]: /x\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [
    ['paragraph', 'Text.'],
    [DEF, '[x]: /x'],
  ])
  assert.equal(project(tree), md)
})

// ── An empty label's first content entry (spec#61) ──────────────────

test('an empty label’s first content entry follows the bare marker', () => {
  // A blank line there, plus the blank line before the nested list, leaves two
  // in a row once the definition is read out again — and two blank lines end
  // the item, so its children come back as siblings.
  const md = '-\n  [x]: /x\n\n  - b\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: /x']])
  assert.equal(tree.children[0].children.length, 1, 'the child is still a child')
  assert.equal(project(tree), md)
})

test('the same with no child', () => {
  const md = '-\n  [x]: /x\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: /x']])
  assert.equal(project(tree), md)
})

test('a non-empty label keeps its blank line', () => {
  const md = '- a\n\n  [x]: /x\n\n  - b\n'
  const tree = roundTrips(md)
  assert.equal(tree.children[0].label, 'a')
  assert.equal(project(tree), md)
})
