// What a recorded string may contain — mindmapmarkdown/spec#55 and #59.
//
// NOT CONFORMANCE. These cases test a proposal in its comment period (RFC 0057).
//
// `P-8` forbids a line ending in whitespace outside a code block, and `P-9`
// writes a recorded source back as it stands. A `source` or `label` carrying a
// line that ends in whitespace therefore has **no** canonical projection at all:
// the P-rules are unsatisfiable for that tree. `L-9` and `L-10` each resolved
// this collision for one construct; Part 2 resolves it for the rest.
//
// Part 1 is the other half: a label's later lines do not keep the indentation of
// the item that holds them, which is what `E-5` already does for content.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const SP = ' '
const TAB = String.fromCharCode(9)
const BS = String.fromCharCode(92)

const contentOf = (node) => node.content.map((e) => [e.block, e.source])

/** L1 both ways, byte stability, and P-8 outside code. */
function holds(md) {
  const tree = lift(md)
  const out = project(tree)
  const back = lift(out)
  assert.ok(equal(back, tree), `projected:\n${out}\nlifted back to ${stringify(back)}`)
  assert.equal(project(back), out, 'second projection is not byte-stable')
  if (!out.includes('```')) {
    const bad = out.split('\n').filter((l) => /[ \t]$/.test(l))
    assert.deepEqual(bad, [], 'a line ends in whitespace (P-8)')
  }
  return tree
}

// ── Part 2 · no recorded line ends in whitespace ────────────────────

test('a paragraph ending in two spaces', () => {
  const tree = holds('para' + SP + SP + '\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'para']])
})

test('a paragraph ending in one space, and in a tab', () => {
  assert.deepEqual(contentOf(holds('para' + SP + '\n')), [['paragraph', 'para']])
  assert.deepEqual(contentOf(holds('para' + TAB + '\n')), [['paragraph', 'para']])
})

test('one space on a line that is not the last is not a hard break', () => {
  const tree = holds('para' + SP + '\nmore\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'para\nmore']])
})

test('two spaces on a line that is not the last still are one', () => {
  // L-9 runs first, so the break is recorded in the backslash form and there
  // is no trailing whitespace left for Part 2 to remove.
  const tree = holds('para' + SP + SP + '\nmore\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'para' + BS + '\nmore']])
})

test('a block quote, a table and a list item’s content', () => {
  assert.deepEqual(contentOf(holds('> q' + SP + SP + '\n')), [['block_quote', '> q']])
  assert.deepEqual(contentOf(holds('|h|\n|-|\n|v|' + SP + '\n')), [
    ['paragraph', '|h|\n|-|\n|v|'],
  ])
  assert.deepEqual(contentOf(holds('- i\n\n  para' + SP + SP + '\n').children[0]), [
    ['paragraph', 'para'],
  ])
})

test('a code block keeps it, because there it is the code', () => {
  const tree = holds('```\nx' + SP + SP + '\n```\n')
  assert.deepEqual(contentOf(tree), [['code_block', '```\nx' + SP + SP + '\n```']])
})

test('an HTML block does not keep it — the stated cost', () => {
  // Inside a `<pre>` those spaces were significant to a browser. Exempting
  // html_block would put the tree back in the state this fixes: P-8 would
  // forbid writing it, so the tree would have no canonical projection.
  const tree = holds('<pre>\nx' + SP + SP + '\n</pre>\n')
  assert.deepEqual(contentOf(tree), [['html_block', '<pre>\nx\n</pre>']])
})

// ── Part 1 · a label does not carry its item's indentation ──────────

test('a multi-line label below the top level', () => {
  const tree = holds('- x\n  - a\n    b\n')
  assert.equal(tree.children[0].children[0].label, 'a\nb')
})

test('at depth one, and at depth three', () => {
  assert.equal(holds('- a\n  b\n').children[0].label, 'a\nb')
  assert.equal(
    holds('- x\n  - y\n    - a\n      b\n').children[0].children[0].children[0].label,
    'a\nb',
  )
})

test('a line indented further than the first keeps the excess', () => {
  // The first line gives up two columns; a tab is four, so two remain.
  assert.equal(holds('- a\n' + TAB + 'b\n').children[0].label, 'a\n  b')
})

test('a hard break inside a label, in both spellings', () => {
  assert.equal(holds('- x\n  - a' + BS + '\n    b\n').children[0].children[0].label, 'a' + BS + '\nb')
  assert.equal(
    holds('- x\n  - a' + SP + SP + '\n    b\n').children[0].children[0].label,
    'a' + BS + '\nb',
  )
})

test('three lines, a sibling after it, and content beside it', () => {
  assert.equal(holds('- a\n  b\n  c\n').children[0].label, 'a\nb\nc')
  const sib = holds('- x\n  - a\n    b\n  - c\n').children[0]
  assert.deepEqual([sib.children[0].label, sib.children[1].label], ['a\nb', 'c'])
  const withContent = holds('- a\n  b\n\n  para\n').children[0]
  assert.equal(withContent.label, 'a\nb')
  assert.deepEqual(contentOf(withContent), [['paragraph', 'para']])
})

test('inline markup is not interpreted, across lines either', () => {
  assert.equal(holds('- [a](/a)\n  [b](/b)\n').children[0].label, '[a](/a)\n[b](/b)')
  assert.equal(holds('- a\n  *b*\n').children[0].label, 'a\n*b*')
})

test('a setext heading’s label is the first line, with no underline', () => {
  assert.equal(holds('Head\n====\nmore\n').children[0].label, 'Head')
})
