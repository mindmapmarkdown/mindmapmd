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
  assert.deepEqual(contentOf(tree), [['paragraph', 'para']])
})

test('four spaces after a definition is still a paragraph, and loses them', () => {
  // CommonMark reads this as a paragraph, not an indented code block: an
  // indented code block cannot interrupt a paragraph, and the definition was
  // read out of one. Keeping the four spaces made projection write a code
  // block instead — the content changed, not only its spelling.
  const tree = roundTrips('[x]: https://example.com\n    indented\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'indented']])
})

test('the same under a heading, where the node is not the root', () => {
  const tree = roundTrips('# Guide\n\n[x]: https://example.com\n  para\n')
  assert.deepEqual(contentOf(tree.children[0]), [['paragraph', 'para']])
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

test('a column carried over from an indented definition does not cut the line', () => {
  // commonmark.js reports this paragraph at column 3 — the *definition's*
  // indentation — on a line whose own content begins at column 1. Slicing there
  // silently dropped `ab`. What precedes a block on its first line is its
  // container's indentation, so a column with text before it cannot be where
  // the block begins.
  const tree = roundTrips('  [x]: /x\nabcd\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'abcd']])
})

test('the same over two lines, where the reported range runs backwards', () => {
  const tree = roundTrips('  [x]: /x\nab\ncd\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'ab\ncd']])
})

test('a block legitimately indented keeps the reported column', () => {
  // Three columns of indentation is still a paragraph, and the columns before
  // it are whitespace, so nothing is repaired here.
  assert.deepEqual(contentOf(roundTrips('# A\n\n   para\n').children[0]), [
    ['paragraph', 'para'],
  ])
})

test('an empty paragraph left behind by a definition is not a block', () => {
  // commonmark.js reports a paragraph with no children for `[y]: /y` when the
  // next line closes it without being a setext underline. A paragraph with no
  // inline content does not exist in CommonMark's own terms, and an entry for
  // it recorded a `source` that is the definition — which is not a paragraph.
  const tree = roundTrips('[x]: /x\n---\n')
  assert.deepEqual(contentOf(tree), [['thematic_break', '---']])
})

test('two definitions and a break, likewise', () => {
  const tree = roundTrips('[a]: /a\n[b]: /b\n---\n')
  assert.deepEqual(contentOf(tree), [['thematic_break', '---']])
})

test('under a heading and inside an item', () => {
  assert.deepEqual(contentOf(roundTrips('# Guide\n\n[x]: /x\n---\n').children[0]), [
    ['thematic_break', '---'],
  ])
  assert.deepEqual(contentOf(roundTrips('- i\n\n  [x]: /x\n  ---\n').children[0]), [
    ['thematic_break', '---'],
  ])
})

test('a paragraph that only looks empty is still a block', () => {
  // `===` after a definition is not a setext underline for it, because the
  // definition consumed nothing: the paragraph holds the text `===`.
  const tree = roundTrips('[x]: /x\n===\n')
  assert.deepEqual(contentOf(tree), [['paragraph', '[x]: /x\n===']])
})

// ── The same column, in a label (E-4) ────────────────────────────────
//
// `labelOf` trusted the column the block-start tests above taught `linesOf` to
// measure. A label is read with `rawSourceOf`, which sliced from the reported
// column, so the stale column cut a character off the front of the label — and
// unlike a content entry, a label that loses a backslash becomes a different
// construct when it is written back.

const labelOf = (tree) => tree.children[0].label

test('a label on the line below a definition keeps its first character', () => {
  // The ordered item is empty, the tab-indented definition is its content, and
  // `\\-` is a lazy continuation line of the paragraph the definition came
  // out of — so it is the item's first inline content, and its label.
  //
  // Sliced at the stale column the label was `-`, projection wrote `1. -`, and
  // that lifts to a nested item: a label became a node.
  const tree = lift('1.\n\t[z]: /z\n\\-\n')
  assert.equal(labelOf(tree), '\\-')
  roundTrips('1.\n\t[z]: /z\n\\-\n')
})

test('a label still starts after the markers that share its line', () => {
  // The column is measured, not discarded: everything to the left of a label is
  // whitespace and list markers, and there can be several of them.
  assert.equal(labelOf(lift('- \\- a\n')), '\\- a')
  assert.equal(labelOf(lift('   - a\n')), 'a')
  assert.equal(labelOf(lift('10) \\*x\n')), '\\*x')

  // `- 2026. 1. 15. x` opens three ordered lists inside the item, so the
  // innermost label sits to the right of four markers.
  let n = lift('- 2026. 1. 15. x\n').children[0]
  while (n.children.length) n = n.children[0]
  assert.equal(n.label, 'x')
})

test('a heading label is unaffected', () => {
  assert.equal(labelOf(lift('# \\# x\n')), '\\# x')
  assert.equal(labelOf(lift('## Title \\#\n')), 'Title \\#')
  assert.equal(labelOf(lift('Set\n===\n')), 'Set')
})
