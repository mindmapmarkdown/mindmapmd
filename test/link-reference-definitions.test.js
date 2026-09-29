// Link reference definitions as node content — mindmapmarkdown/spec#40,
// proposed as RFC 0051.
//
// CommonMark takes a definition out of the document before it builds the tree,
// so `L-3` has nothing to attach and projection drops it: a reference-style link
// stops being a link after one round trip. Accepting RFC 0039 made that worse —
// two ordered lists separated by a definition lift to a restart with nothing
// between them, which `S-5` rejects — so the loss can no longer be deferred.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const DEF = 'link_reference_definition'
const entries = (node) => node.content.map((e) => [e.block, e.source])

/** L1 both ways: the tree projects to a document that lifts back to it. */
function roundTrips(md) {
  const tree = lift(md)
  const out = project(tree)
  const back = lift(out)
  assert.ok(equal(back, tree), `projected:\n${out}\nlifted back to ${stringify(back)}`)
  assert.equal(project(back), out, 'second projection is not byte-stable')
  return tree
}

test('a definition before any node is the root’s content', () => {
  const tree = roundTrips('[x]: https://example.com\n\n# Guide\n\nSee [the guide][x].\n')
  assert.deepEqual(entries(tree), [[DEF, '[x]: https://example.com']])
  assert.equal(tree.children[0].label, 'Guide')
})

test('a definition after a paragraph is that node’s content, in order', () => {
  const tree = roundTrips('# Guide\n\nText.\n\n[x]: https://example.com\n')
  assert.deepEqual(entries(tree.children[0]), [
    ['paragraph', 'Text.'],
    [DEF, '[x]: https://example.com'],
  ])
})

test('a definition between two lists belongs to the item before it', () => {
  // The shape that matters for S-5 once RFC 0039 lands: the definition is the
  // content that separates a restart from the list before it.
  const tree = lift('- a\n\n[x]: https://example.com\n\n- b\n')
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: https://example.com']])
  assert.deepEqual(entries(tree.children[1]), [])
  roundTrips('- a\n\n[x]: https://example.com\n\n- b\n')
})

test('a definition inside an item loses the item’s indentation (E-5)', () => {
  const tree = roundTrips('- a\n\n  [x]: https://example.com\n\n- b\n')
  assert.deepEqual(entries(tree.children[0]), [[DEF, '[x]: https://example.com']])
})

test('a definition written over several lines keeps its own line structure', () => {
  const tree = roundTrips('# Guide\n\n[x]:\n  https://example.com\n  "The guide"\n')
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[x]:\n  https://example.com\n  "The guide"'],
  ])
})

test('adjacent definitions are one entry — telling them apart means parsing them', () => {
  const tree = roundTrips('# Guide\n\n[a]: /a\n[b]: /b\n\nText.\n')
  assert.deepEqual(entries(tree.children[0]), [
    [DEF, '[a]: /a\n[b]: /b'],
    ['paragraph', 'Text.'],
  ])
})

test('a definition after a nested list attaches to the deepest last item (L-3)', () => {
  const tree = roundTrips('- a\n  - b\n\n[x]: /x\n\n- c\n')
  assert.deepEqual(entries(tree.children[0].children[0]), [[DEF, '[x]: /x']])
})

test('an empty item is still an empty item, not a definition', () => {
  // The bare marker is a line no block covers; the container's marker line is
  // what keeps it from being read as a definition.
  const tree = roundTrips('- a\n-\n')
  assert.equal(tree.children[1].label, '')
  assert.deepEqual(entries(tree.children[1]), [])
})

test('a document with no definition is unchanged', () => {
  const tree = lift('# Guide\n\nText.\n\n- a\n')
  assert.deepEqual(entries(tree.children[0]), [['paragraph', 'Text.']])
})
