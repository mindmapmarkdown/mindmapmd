// RFC 0057 Part 2 measured without Part 1 underneath it — spec#59, spec#57.
//
// P-8 forbids a line ending in whitespace outside a code block and P-9 writes a
// recorded source back as it stands, so a `source` whose line ends in
// whitespace has no canonical projection at all. L-9 and L-10 each resolved
// this collision for one construct; Part 2 resolves it for the rest.
//
// Part 1 of the same RFC is NOT in this configuration. It is about where a
// label's later lines are written, it is objected to, and keeping it out is the
// point: these tests say what Part 2 does on its own.
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

