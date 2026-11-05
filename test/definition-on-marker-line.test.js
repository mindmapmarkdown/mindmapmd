// mindmapmd#18 — a link reference definition that begins on a list marker's
// line. It used to be dropped, or recorded without its first line, because the
// marker line was counted as cover when looking for the gaps a definition hides
// in. `- [x]: /x` recorded nothing and projected to `-`, so every
// reference-style link that resolved through the definition broke.
//
// L-13 — a definition produces no node; it is node content, one entry with
// `block` equal to `link_reference_definition` and `source` the definition's
// lines as written, attached as L-3 attaches any block. A run of definitions
// that no blank line separates is one entry.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

const defs = (n, out = []) => {
  for (const c of n.content ?? []) {
    if (c.block === 'link_reference_definition') out.push(c.source)
  }
  for (const k of n.children ?? []) defs(k, out)
  return out
}

test('L-13 · a definition on a bullet marker\'s line is recorded', () => {
  const tree = lift('- [x]: /x\n')
  assert.deepEqual(defs(tree), ['[x]: /x'])
})

test('L-13 · it attaches to the item it is written inside', () => {
  const tree = lift('- [x]: /x\n')
  const item = tree.children[0]
  assert.equal(item.kind, 'item')
  assert.equal(item.label, '')
  assert.equal(item.content.length, 1)
  assert.equal(item.content[0].block, 'link_reference_definition')
})

test('L-13 · the marker is not part of the recorded source', () => {
  assert.deepEqual(defs(lift('1. [x]: /x\n')), ['[x]: /x'])
  assert.deepEqual(defs(lift('- - [x]: /x\n')), ['[x]: /x'])
})

test('L-13 · a definition on the marker line joins the one below it', () => {
  // One entry, not two: no blank line separates them.
  assert.deepEqual(defs(lift('- [x]: /x\n  [y]: /y\n')), ['[x]: /x\n[y]: /y'])
})

test('L-13 · a run stops at the next marker, one entry per item', () => {
  const tree = lift('- [x]: /x\n- [y]: /y\n')
  assert.deepEqual(defs(tree), ['[x]: /x', '[y]: /y'])
  assert.deepEqual(defs(tree.children[0]), ['[x]: /x'])
  assert.deepEqual(defs(tree.children[1]), ['[y]: /y'])
})

test('a bare marker is an empty item, not a definition', () => {
  const tree = lift('-\n')
  assert.deepEqual(defs(tree), [])
  assert.equal(tree.children[0].content.length, 0)
})

test('a non-paragraph block on the marker line is still a block (mindmapmd#17)', () => {
  const tree = lift('- > q\n')
  assert.deepEqual(defs(tree), [])
  assert.equal(tree.children[0].content[0].block, 'block_quote')
  assert.equal(tree.children[0].content[0].source, '> q')
})

test('L1 · the document round-trips and the definition survives projection', () => {
  const src = '# D\n\nSee [g].\n\n- [g]: /g\n'
  const tree = lift(src)
  const out = project(tree)
  assert.match(out, /\[g\]: \/g/)
  assert.ok(equal(tree, lift(out)), 'the projection lifts to the same tree')
  assert.equal(project(lift(out)), out, 'the second pass is byte-stable')
})

test('L1 · a definition on the marker line of an ordered item round-trips', () => {
  const tree = lift('1. [x]: /x\n')
  const out = project(tree)
  assert.ok(equal(tree, lift(out)))
  assert.equal(project(lift(out)), out)
})
