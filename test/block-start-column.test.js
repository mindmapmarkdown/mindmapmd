// Where a block begins, and what that means for `source`. E-5.
//
// `E-5` says a content entry's `source` is the block's Markdown source with the
// first line beginning at the column where the block begins, and with no later
// line keeping more leading whitespace than the first line gave up. A block
// therefore never begins with whitespace: the columns before its first character
// belong to whatever contains it.
//
// commonmark.js reports a column that falls short in one case. A link reference
// definition is taken out of the document before the tree is built, and a
// paragraph on the line below it is reported at the column of the paragraph the
// definition came out of rather than at its own. Lift measured nothing and
// trusted that column, so `[x]: /x` followed by an indented line recorded two
// spaces that were not part of the paragraph — and projection, writing them back
// as source, produced a document that lifts to a different tree.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const contentOf = (tree) => tree.content.map((e) => [e.block, e.source])

/** L1 both ways: the tree projects to a document that lifts back to it. */
function roundTrips(md) {
  const tree = lift(md)
  const out = project(tree)
  const back = lift(out)
  assert.ok(equal(back, tree), `projected:\n${out}\nlifted back to ${stringify(back)}`)
  assert.equal(project(back), out, 'second projection is not byte-stable')
  return tree
}

test('a paragraph after a definition does not keep the definition’s column', () => {
  const tree = roundTrips('[x]: https://example.com\n  para\n')
  // RFC 0051 records the definition, so it is the entry before the paragraph.
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[x]: https://example.com'],
    ['paragraph', 'para'],
  ])
})

test('four spaces after a definition is still a paragraph, and loses them', () => {
  // CommonMark reads this as a paragraph, not an indented code block: an
  // indented code block cannot interrupt a paragraph, and the definition was
  // read out of one. Keeping the four spaces made projection write a code
  // block instead — the content changed, not only its spelling.
  const tree = roundTrips('[x]: https://example.com\n    indented\n')
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[x]: https://example.com'],
    ['paragraph', 'indented'],
  ])
})

test('the same under a heading, where the node is not the root', () => {
  const tree = roundTrips('# Guide\n\n[x]: https://example.com\n  para\n')
  assert.deepEqual(contentOf(tree.children[0]), [
    ['link_reference_definition', '[x]: https://example.com'],
    ['paragraph', 'para'],
  ])
})

test('a multi-line block in a list item still loses exactly the first line’s columns', () => {
  const tree = roundTrips('- item\n\n  para\n  more\n')
  assert.deepEqual(contentOf(tree.children[0]), [['paragraph', 'para\nmore']])
})

test('a tab’s worth of indentation is four columns, not one character', () => {
  // Both lines of the paragraph are indented with one tab, which is four
  // columns. Counting characters would say the first line gave up one column
  // and leave three behind on the second.
  const tree = roundTrips('- item\n\n\tpara\n\tmore\n')
  assert.deepEqual(contentOf(tree.children[0]), [['paragraph', 'para\nmore']])
})

test('a block quote inside an item keeps its own structure', () => {
  const tree = roundTrips('- item\n\n  > q\n  > r\n')
  assert.deepEqual(contentOf(tree.children[0]), [['block_quote', '> q\n> r']])
})
