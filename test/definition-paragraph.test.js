// A paragraph directly after a link reference definition — mindmapmarkdown/spec#56.
//
// NOT CONFORMANCE. These cases test a proposal in its comment period (RFC 0058).
// They sit on top of the RFC 0051 prototype, because the rule is about a
// definition and the paragraph CommonMark leaves behind when it takes one out.
//
// A definition is removed before the block structure is built, so the paragraph
// it was written in can be left with a first line that is a paragraph only
// *because* it cannot interrupt one: an empty ordered item, or an ordered list
// that does not start at 1. Written below the definition at column 0, that line
// opens a
// list — the paragraph stops being content and becomes a node, and the tree
// does not survive its own projection. So it is written as a lazy continuation
// line, indented four columns: the fewest at which no CommonMark block begins.
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
  // RFC 0057 Part 2 removes the trailing space, so this document's canonical
  // spelling has none — and the defect is the same without it.
  const md = '[x]: /x\n1.\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '1.'],
  ])
  // Conforming, and not canonical: canonical form indents the continuation
  // line four columns.
  assert.equal(project(tree), '[x]: /x\n    1.\n')
})

test('an ordered list not starting at 1, likewise', () => {
  const md = '[x]: /x\n2. a\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '2. a'],
  ])
  assert.equal(project(tree), '[x]: /x\n    2. a\n')
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
  assert.equal(project(tree), '[x]: /x\n    See [x].\n')
})

test('a blank line between them is conforming and not canonical', () => {
  // Two documents, one tree. The bytes settle on the first round trip, as with
  // L-9 and L-10.
  const tree = roundTrips('[x]: /x\n\nSee [x].\n')
  assert.equal(project(tree), '[x]: /x\n    See [x].\n')
})

test('the paragraph keeps its own line structure', () => {
  const md = '[x]: /x\npara\nmore\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', 'para\nmore'],
  ])
  // Only the first line is indented. A later line of a paragraph opens no block
  // however it is spelled, and four columns there are four columns E-5 would
  // have to remove without P-4 having added them.
  assert.equal(project(tree), '[x]: /x\n    para\nmore\n')
})

test('inside a list item, the four columns come after the two P-4 adds', () => {
  const tree = roundTrips('- i\n\n  [x]: /x\n  1.\n')
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[x]: /x'],
    ['paragraph', '1.'],
  ])
  assert.equal(project(tree), '- i\n\n  [x]: /x\n      1.\n')
})

test('under a heading', () => {
  const tree = roundTrips('# Guide\n\n[x]: /x\n1.\n')
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[x]: /x'],
    ['paragraph', '1.'],
  ])
  assert.equal(project(tree), '# Guide\n\n[x]: /x\n    1.\n')
})

// ── The two shapes the revision was made for (2026-10-05) ──────────

test('a line that would open a list', () => {
  // `- a` indented four columns continues the paragraph; at column 0 it opens a
  // list, and the paragraph becomes a node. This document is canonical.
  const md = '[x]: /x\n    - a\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '- a'],
  ])
  assert.equal(project(tree), md)
})

test('a line that would underline a setext heading', () => {
  // At column 0, `=` makes the definition's line a heading and swallows it:
  // two content entries came back as one paragraph.
  const tree = roundTrips('[x]: /x\n\n=\n')
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '='],
  ])
  assert.equal(project(tree), '[x]: /x\n    =\n')
})

test('a line that would open a thematic break', () => {
  const tree = roundTrips('[x]: /x\n    ***\n')
  assert.deepEqual(entries(tree), [
    [DEF, '[x]: /x'],
    ['paragraph', '***'],
  ])
  assert.equal(project(tree), '[x]: /x\n    ***\n')
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

// ── An empty label with content and children (spec#61) ─────────────

test('an empty-labelled item with a definition and a child keeps the child', () => {
  // P-7's blank line before the content, plus the blank line before the nested
  // list, leaves two in a row once the definition is read out again — and two
  // blank lines end a list item, so the child came back as a sibling.
  const md = '-\n  [x]: /x\n\n  - b\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: /x']])
  assert.equal(tree.children[0].label, '')
  assert.equal(tree.children[0].children.length, 1, 'the child is still a child')
  assert.equal(tree.children[0].children[0].label, 'b')
  assert.equal(project(tree), md)
})

test('two definitions are one entry, and the child still survives', () => {
  const tree = roundTrips('-\n  [x]: /x\n  [y]: /y\n\n  - b\n')
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: /x\n[y]: /y']])
  assert.equal(tree.children[0].children.length, 1)
})

test('with no child, the blank line stays', () => {
  // One blank line is all that is left behind, and an empty item survives it.
  // Removing it here would be a change with no defect behind it.
  const md = '-\n\n  [x]: /x\n'
  const tree = roundTrips(md)
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: /x']])
  assert.equal(project(tree), md)
})

test('a non-empty label with content and children is unaffected', () => {
  const md = '- a\n\n  [x]: /x\n\n  - b\n'
  const tree = roundTrips(md)
  assert.equal(tree.children[0].label, 'a')
  assert.equal(project(tree), md)
})

test('an empty label whose content is not a definition keeps its blank line', () => {
  // Such an item has no children: any block that could sit between the marker
  // and a nested list becomes the label instead, and a definition is the one
  // block CommonMark does not report. These are the cases the second condition
  // of the rule protects.
  for (const md of ['-\n\n  para\n', '-\n\n  > q\n']) {
    const tree = roundTrips(md)
    assert.equal(tree.children[0].label, '')
    assert.equal(tree.children[0].children.length, 0)
    assert.equal(project(tree), md)
  }
})
