// L-10, S-4, P-11 — the parts the conformance suite cannot reach.
//
// spec.md carries two front-matter examples: the construct, and the guard where
// an opening fence has no closer. Everything else about the rule is stated in
// prose and tested nowhere, and S-4 cannot be tested by the suite at all —
// §2.4 says lift cannot produce a tree that violates it, so only a tree built by
// hand can.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { block, node, root, stringify } from '../src/tree.js'

const matter = (tree) => tree.content[0]

// ── L-10 · what is front matter ─────────────────────────────────────

test('L-10 · trailing whitespace comes off each recorded line', () => {
  const tree = lift('---\ntitle: x   \n---\n\n# A\n')
  assert.equal(matter(tree).source, '---\ntitle: x\n---')
})

test('L-10 · the opening fence may carry trailing spaces and tabs', () => {
  const tree = lift('---  \na: 1\n---\n\n# A\n')
  assert.equal(matter(tree).block, 'front_matter')
})

test('L-10 · the FIRST later fence closes the block, not the last', () => {
  const tree = lift('---\na: 1\n---\nb\n---\nc\n')
  assert.equal(matter(tree).source, '---\na: 1\n---')
})

test('L-10 · an empty block is still front matter', () => {
  assert.equal(matter(lift('---\n---\n\n# A\n')).source, '---\n---')
})

test('L-10 · a document may be nothing but front matter', () => {
  const tree = lift('---\na: 1\n---\n')
  assert.equal(tree.children.length, 0)
  assert.equal(matter(tree).block, 'front_matter')
})

test('L-10 · no closing fence, so the first line is read as CommonMark reads it', () => {
  assert.equal(matter(lift('---\n\n# A\n')).block, 'thematic_break')
})

test('L-10 · the first line must not be indented — three hyphens exactly', () => {
  // CommonMark allows up to three spaces before a thematic break. L-10 does not
  // borrow that latitude: it speaks of the document's first line.
  assert.equal(matter(lift('  ---\na: 1\n---\n\n# A\n')).block, 'thematic_break')
})

test('L-10 · nothing parses the block — its contents may be anything', () => {
  const tree = lift('---\n: : not yaml : :\n\t\n---\n\n# A\n')
  assert.equal(matter(tree).block, 'front_matter')
  assert.equal(matter(tree).source, '---\n: : not yaml : :\n\n---')
})

// ── The defect L-10 exists to stop ──────────────────────────────────

test('front matter produces no node', () => {
  const tree = lift('---\ntitle: Deploy\n---\n\n# Preparation\n')
  assert.equal(tree.children.length, 1)
  assert.equal(tree.children[0].label, 'Preparation')
})

// ── P-11 · where it is written back ─────────────────────────────────

test('P-11 · written first, at line 1, with one blank line after it', () => {
  const doc = project(lift('---\na: 1\n---\n\n# A\n'))
  assert.equal(doc, '---\na: 1\n---\n\n# A\n')
})

test('P-11 · a missing blank line after the fence is supplied', () => {
  assert.equal(project(lift('---\na: 1\n---\n# A\n')), '---\na: 1\n---\n\n# A\n')
})

test('§1.2.4 L1 · a document with front matter round-trips byte for byte', () => {
  for (const doc of [
    '---\na: 1\n---\n\n# A\n\n- one\n',
    '---\n---\n\n# A\n',
    '---\na: 1\n---\n',
  ]) {
    const tree = lift(doc)
    assert.equal(project(tree), doc)
    assert.equal(stringify(lift(project(tree))), stringify(tree))
  }
})

test('a document whose front matter carried trailing whitespace settles in one round-trip', () => {
  const tree = lift('---\na: 1   \n---\n\n# A\n')
  const once = project(tree)
  assert.equal(once, '---\na: 1\n---\n\n# A\n')
  assert.equal(project(lift(once)), once)
})

// ── S-4 · where it may appear in a tree ─────────────────────────────

const fm = () => block('front_matter', '---\na: 1\n---')

test('S-4 · rejected when it is not the first entry of the root content', () => {
  const tree = root([block('paragraph', 'p'), fm()], [])
  assert.throws(() => project(tree), /S-4/)
})

test('S-4 · rejected when it hangs off a node rather than the root', () => {
  const tree = root([], [node('section', 'A', [fm()])])
  assert.throws(() => project(tree), /S-4/)
})

test('S-4 · rejected deep in the tree, not only at the top', () => {
  const inner = node('item', 'i', [fm()])
  const tree = root([], [node('section', 'A', [], [node('section', 'B', [], [inner])])])
  assert.throws(() => project(tree), /S-4/)
})

test('S-4 · every violation is reported, not only the first (S-3)', () => {
  const tree = root([block('paragraph', 'p'), fm()], [node('section', 'A', [fm()])])
  assert.throws(() => project(tree), (e) => e.message.match(/S-4/g).length === 2)
})

test('S-4 · the position lift produces is accepted', () => {
  assert.doesNotThrow(() => project(lift('---\na: 1\n---\n\n# A\n')))
})
