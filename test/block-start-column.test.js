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
  // Both lines are indented with one tab, which is four columns. The item's
  // content column is two, so two columns come off and the other two are the
  // author's — they stay in the source, and P-4 puts the item's two back.
  // Before RFC 0079 the first line’s four came off every line, and the
  // number removed did not match the number projection added.
  const tree = roundTrips('- item\n\n\tpara\n\tmore\n')
  assert.deepEqual(contentOf(tree.children[0]), [['paragraph', 'para\n  more']])
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
  // RFC 0051 records the definition, so it is the entry before the paragraph.
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[x]: /x'],
    ['paragraph', 'abcd'],
  ])
})

test('the same over two lines, where the reported range runs backwards', () => {
  const tree = roundTrips('  [x]: /x\nab\ncd\n')
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[x]: /x'],
    ['paragraph', 'ab\ncd'],
  ])
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
  // And with RFC 0051 the definition the empty paragraph was hiding is
  // recovered, rather than dropped with it.
  const tree = roundTrips('[x]: /x\n---\n')
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[x]: /x'],
    ['thematic_break', '---'],
  ])
})

test('two definitions and a break, likewise', () => {
  const tree = roundTrips('[a]: /a\n[b]: /b\n---\n')
  assert.deepEqual(contentOf(tree), [
    ['link_reference_definition', '[a]: /a\n[b]: /b'],
    ['thematic_break', '---'],
  ])
})

test('under a heading and inside an item', () => {
  assert.deepEqual(contentOf(roundTrips('# Guide\n\n[x]: /x\n---\n').children[0]), [
    ['link_reference_definition', '[x]: /x'],
    ['thematic_break', '---'],
  ])
  assert.deepEqual(contentOf(roundTrips('- i\n\n  [x]: /x\n  ---\n').children[0]), [
    ['link_reference_definition', '[x]: /x'],
    ['thematic_break', '---'],
  ])
})

test('a paragraph that only looks empty is still a block', () => {
  // `===` after a definition is not a setext underline for it, because the
  // definition consumed nothing: the paragraph holds the text `===`.
  const tree = roundTrips('[x]: /x\n===\n')
  assert.deepEqual(contentOf(tree), [['paragraph', '[x]: /x\n===']])
})

// ── RFC 0079 · E-5 removes what P-4 will add (spec#74) ──────────────

test('a top-level paragraph keeps the indentation projection will not restore', () => {
  // `  cont` with `    - n3` under it is one paragraph: the second line is a
  // lazy continuation. The first line gave up two columns to nothing — there
  // is no container — so removing two from the second line and writing the
  // result at column 0 put the marker where a list interrupts a paragraph.
  const tree = roundTrips('  cont\n    - n3\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'cont\n    - n3']])
})

test('a block inside an item loses exactly the item’s content column', () => {
  assert.deepEqual(contentOf(roundTrips('- i\n\n  para\n  more\n').children[0]), [
    ['paragraph', 'para\nmore'],
  ])
  // Indented further than the item's content column: the excess is the
  // author's, and it stays.
  assert.deepEqual(contentOf(roundTrips('- i\n\n   para\n     more\n').children[0]), [
    ['paragraph', 'para\n   more'],
  ])
})

test('a block attached from outside an item uses that item’s column', () => {
  // L-3 attaches this paragraph to the empty item and P-4 will indent it by
  // two, so two is what comes off — even though CommonMark puts the paragraph
  // at the top level. Containment and attachment are different things, and it
  // is attachment that projection follows.
  const tree = roundTrips('-\na\nb\n')
  assert.deepEqual(contentOf(tree.children[0]), [['paragraph', 'a\nb']])
})

test('an ordered item’s wider marker takes more columns off', () => {
  assert.deepEqual(contentOf(roundTrips('10. i\n\n    para\n    more\n').children[0]), [
    ['paragraph', 'para\nmore'],
  ])
})

// ── Neither number alone is the right one (spec#74) ──────────────────
//
// E-5 removes, from each later line, the lesser of what the block's first line
// gave up and what P-4 will put back. Each half of that has a case the other
// half gets wrong, and both are below.

test('more columns than P-4 will add are not removed', () => {
  // The paragraph is attached to the root, so P-4 adds nothing — and the two
  // columns the first line gave up were given to nothing. Removing them anyway
  // brought the second line back at two columns, where a list marker opens a
  // list: the content became a node. This is the case on spec#74.
  const tree = roundTrips('  cont\n    - n3\n')
  assert.deepEqual(contentOf(tree), [['paragraph', 'cont\n    - n3']])
})

test('more columns than the first line gave up are not removed either', () => {
  // The block quote begins at column 0 and L-3 attaches it to the item above,
  // so P-4 will add the item's two columns to a block that gave up none. Taking
  // two off the continuation line left it two columns past the content column
  // once P-4 had written it — close enough to column 0 to open a list.
  //
  // Four columns past the content column is what made the line a continuation
  // line, and it is what has to come back.
  const tree = roundTrips('- a\n> q\n> r\n    - n3\n')
  assert.deepEqual(
    tree.children[0].content.map((e) => [e.block, e.source]),
    [['block_quote', '> q\n> r\n    - n3']],
  )
})
