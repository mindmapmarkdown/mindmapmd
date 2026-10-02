// L-10, guarded — the line after the opening fence must not be blank.
//
// Proposed by mindmapmarkdown/spec RFC 0048, after a reader on the Obsidian
// forum reported the shape spec#35 describes: every note opens with `---` as a
// rule, and a second `---` separates it later. Under L-10 as written, the run
// between the two fences is front matter and the prose in it stops being
// content.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const matter = (md) => lift(md).content.find((e) => e.block === 'front_matter')
const blocks = (md) => lift(md).content.map((e) => e.block)

// ── What the guard turns away ───────────────────────────────────────

test('the reported shape is not front matter', () => {
  // forum.obsidian.md/t/…/118692, post 4 — quoted in spec#35
  const md = [
    '---',
    '',
    'Yada yada some content that is not frontmatter.',
    '',
    '---',
    '',
    'Yada yada some more content.',
    '',
  ].join('\n')
  assert.equal(matter(md), undefined)
  assert.deepEqual(blocks(md), ['thematic_break', 'paragraph', 'thematic_break', 'paragraph'])
})

test('a note that opens with three rules', () => {
  // spec#35, reported on the issue itself: notes that open this way, which the
  // author takes for an unused YAML block left behind plus a rule of his own
  const md = '---\n\n---\n\n---\n\n…content\n'
  assert.equal(matter(md), undefined)
  assert.deepEqual(blocks(md), ['thematic_break', 'thematic_break', 'thematic_break', 'paragraph'])
  assert.equal(project(lift(md)), md)
})

test('the prose in it stays prose, and the document round-trips', () => {
  const md = '---\n\nOpening note.\n\n---\n\n# Heading\n\nBody.\n'
  const tree = lift(md)
  assert.deepEqual(
    tree.content.map((e) => e.source),
    ['---', 'Opening note.', '---'],
  )
  assert.equal(tree.children[0].label, 'Heading')
  const back = lift(project(tree))
  assert.ok(equal(back, tree), `lifted back to ${stringify(back)}`)
})

test('a blank line of spaces or tabs counts as blank', () => {
  assert.equal(matter('---\n   \ntitle: x\n---\n\n# A\n'), undefined)
  assert.equal(matter('---\n\t\ntitle: x\n---\n\n# A\n'), undefined)
})

// ── What still is front matter ──────────────────────────────────────

test('front matter as Jekyll, Hugo and Obsidian write it', () => {
  assert.equal(matter('---\ntitle: x\n---\n\n# A\n').source, '---\ntitle: x\n---')
  assert.equal(matter('---\ntags: [a, b]\ndate: 2026-09-27\n---\n\n# A\n').block, 'front_matter')
})

test('an empty block is still front matter — the fences are adjacent', () => {
  assert.equal(matter('---\n---\n\n# A\n').source, '---\n---')
})

test('a document that is nothing but front matter', () => {
  assert.equal(matter('---\na: 1\n---\n').block, 'front_matter')
})

test('the opening fence may carry trailing spaces, and the key line may be indented', () => {
  assert.equal(matter('---  \na: 1\n---\n\n# A\n').block, 'front_matter')
  assert.equal(matter('---\n  a: 1\n---\n\n# A\n').block, 'front_matter')
})

test('a commented-out first key is still non-blank, so the block is front matter', () => {
  assert.equal(matter('---\n# title: x\na: 1\n---\n\n# A\n').block, 'front_matter')
})

// ── L1 both ways for each shape ─────────────────────────────────────

for (const [what, md] of [
  ['guarded away', '---\n\nOpening note.\n\n---\n\nMore.\n'],
  ['real front matter', '---\ntitle: x\n---\n\n# A\n'],
  ['empty block', '---\n---\n\n# A\n'],
]) {
  test(`L1 · ${what}`, () => {
    const tree = lift(md)
    const back = lift(project(tree))
    assert.ok(equal(back, tree), `projected:\n${project(tree)}\nlifted back to ${stringify(back)}`)
    assert.equal(project(lift(project(tree))), project(tree), 'second projection is not byte-stable')
  })
}
