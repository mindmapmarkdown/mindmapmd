// RFC 0039 prototype — ordered lists keep their numbers.
//
// NOT CONFORMANCE. These cases test a proposal still in its comment period
// (mindmapmarkdown/spec, RFC 0039). If it is rejected, this file goes with it.
//
// Every case checks what CommonMark itself renders, not only the tree: the
// projected document must show a reader the same number on every item as the
// original. Equal trees with different numbers on screen would be the failure
// this RFC exists to prevent. Whether those numbers come from one CommonMark
// list or two is not checked — a list interrupted by a paragraph and continued
// is one numbering, and projection is free to write it as one list.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'
import { Parser } from 'commonmark'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { block, node, problems, root, stringify } from '../src/tree.js'

const parser = new Parser()

/** Every list item a reader sees, in document order: its bullet, or its rendered number and delimiter. */
function renderedNumbers(md) {
  const out = []
  const walker = parser.parse(md).walker()
  let ev
  while ((ev = walker.next())) {
    const n = ev.node
    if (!ev.entering || n.type !== 'list') continue
    let number = n.listStart
    for (let li = n.firstChild; li; li = li.next) {
      out.push(n.listType === 'ordered' ? `${number++}${n.listDelimiter}` : '•')
    }
  }
  return out
}

const item = (label, ordinal, delimiter, content = [], children = []) => {
  const n = node('item', label, content, children)
  if (ordinal !== undefined) {
    n.ordinal = ordinal
    n.delimiter = delimiter
  }
  return n
}

// ── The examples RFC 0039 proposes for spec.md ─────────────────────

const examples = [
  {
    name: 'an ordered list records each item number and its delimiter',
    md: '# Setup\n\n1. Install\n2. Configure\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Setup","content":[],"children":[{"kind":"item","label":"Install","ordinal":1,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Configure","ordinal":2,"delimiter":".","content":[],"children":[]}]}]},
    canonical: true,
  },
  {
    name: 'a list that starts at 3 keeps its start',
    md: '# Steps\n\n3. Test\n4. Ship\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Steps","content":[],"children":[{"kind":"item","label":"Test","ordinal":3,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Ship","ordinal":4,"delimiter":".","content":[],"children":[]}]}]},
    canonical: true,
  },
  {
    name: 'numbers written on later items are not read',
    md: '# Steps\n\n1. One\n1. Two\n1. Three\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Steps","content":[],"children":[{"kind":"item","label":"One","ordinal":1,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Two","ordinal":2,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Three","ordinal":3,"delimiter":".","content":[],"children":[]}]}]},
    canonical: false,
  },
  {
    name: 'the parenthesis delimiter is kept',
    md: '# Steps\n\n1) One\n2) Two\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Steps","content":[],"children":[{"kind":"item","label":"One","ordinal":1,"delimiter":")","content":[],"children":[]},{"kind":"item","label":"Two","ordinal":2,"delimiter":")","content":[],"children":[]}]}]},
    canonical: true,
  },
  {
    name: 'a list nested in an ordered item is indented by the marker width plus one',
    md: '# Steps\n\n9. Prepare\n   - Back up\n10. Deploy\n    - Swap\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Steps","content":[],"children":[{"kind":"item","label":"Prepare","ordinal":9,"delimiter":".","content":[],"children":[{"kind":"item","label":"Back up","content":[],"children":[]}]},{"kind":"item","label":"Deploy","ordinal":10,"delimiter":".","content":[],"children":[{"kind":"item","label":"Swap","content":[],"children":[]}]}]}]},
    canonical: true,
  },
  {
    name: 'a list interrupted by a paragraph and continued is one numbering',
    md: '1. Overview\n\nOverview text.\n\n2. Detail\n',
    tree: {"content":[],"children":[{"kind":"item","label":"Overview","ordinal":1,"delimiter":".","content":[{"block":"paragraph","source":"Overview text."}],"children":[]},{"kind":"item","label":"Detail","ordinal":2,"delimiter":".","content":[],"children":[]}]},
    canonical: false,
  },
  {
    name: 'a list that restarts is written with the interrupting content unindented',
    md: '# Rollout\n\n1. Build\n2. Verify\n\nThen, on each server:\n\n1. Stop\n2. Swap\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Rollout","content":[],"children":[{"kind":"item","label":"Build","ordinal":1,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Verify","ordinal":2,"delimiter":".","content":[{"block":"paragraph","source":"Then, on each server:"}],"children":[]},{"kind":"item","label":"Stop","ordinal":1,"delimiter":".","content":[],"children":[]},{"kind":"item","label":"Swap","ordinal":2,"delimiter":".","content":[],"children":[]}]}]},
    canonical: true,
  },
  {
    name: 'a line that starts with a date keeps every number',
    md: '# Log\n\n- 2026. 1. 15. 10:00\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Log","content":[],"children":[{"kind":"item","label":"","content":[],"children":[{"kind":"item","label":"","ordinal":2026,"delimiter":".","content":[],"children":[{"kind":"item","label":"","ordinal":1,"delimiter":".","content":[],"children":[{"kind":"item","label":"10:00","ordinal":15,"delimiter":".","content":[],"children":[]}]}]}]}]}]},
    canonical: false,
  },
]

for (const e of examples) {
  test(`RFC 0039 example · ${e.name}`, () => {
    const t = lift(e.md)
    assert.equal(stringify(t), stringify(e.tree), 'tree')
    const p = project(t)
    assert.equal(p === e.md, e.canonical, e.canonical ? 'canonical' : 'not canonical')
    assert.equal(stringify(lift(p)), stringify(t), 'tree round-trip')
    assert.equal(project(lift(p)), p, 'second projection is byte-stable')
    assert.deepEqual(renderedNumbers(p), renderedNumbers(e.md), 'a reader sees the same number on every item')
  })
}

// ── Cases beyond the examples ──────────────────────────────────────

const cases = {
  'bullet list then ordered list': '# A\n\n- a\n\n2. b\n3. c\n',
  'ordered then bullet then ordered': '# A\n\n1. a\n\n- b\n\n1. c\n',
  'delimiter change splits the list': '# A\n\n1. a\n2. b\n1) c\n',
  'restart inside a nested list': '- parent\n  1. a\n  2. b\n\n  Next:\n\n  1. c\n',
  'restart after an item with children': '1. a\n   - sub\n\nMore:\n\n1. b\n',
  'blank lines alone do not restart': '1. a\n2. b\n\n\n1. c\n',
  'start at zero': '0. zero\n1. one\n',
  'nine-digit start': '999999999. a\n',
  'later item beyond nine digits': '999999999. a\n1. b\n',
  'escaped number stays label text': '- 1\\. literal\n',
  'block after a list attaches to the last item (L-3)': '# H\n\n- a\n- b\n\nafter.\n',
  'block after a nested list attaches to the deepest last item': '- a\n  - b\n\nafter.\n',
  'ordered item holding a one-line block quote': '1. run\n\n   > careful\n2. done\n',
}

for (const [name, md] of Object.entries(cases)) {
  test(`RFC 0039 · ${name}`, () => {
    const t = lift(md)
    assert.deepEqual(problems(t), [], 'lift produces a well-formed tree')
    const p = project(t)
    assert.equal(stringify(lift(p)), stringify(t), 'tree round-trip')
    assert.equal(project(lift(p)), p, 'second projection is byte-stable')
    assert.deepEqual(renderedNumbers(p), renderedNumbers(md), 'a reader sees the same number on every item')
    assert.ok(!/[ \t]$/m.test(p), 'no line ends in whitespace')
  })
}

// Multi-line content inside an ordered item keeps the item's indentation on its
// later lines, and projection adds it again — the defect RFC 0038 Part 1 fixes.
// This prototype is branched from main, without RFC 0038, so the case is
// recorded rather than hidden.
test('RFC 0039 · ordered item holding a multi-line code block', { todo: 'depends on RFC 0038 Part 1 (container indentation)' }, () => {
  const md = '1. run\n\n   ```sh\n   make\n   ```\n2. done\n'
  const t = lift(md)
  assert.equal(stringify(lift(project(t))), stringify(t))
})

// ── Well-formedness of hand-built trees ─────────────────────────────

test('S-5 · a restart with nothing to separate it is rejected', () => {
  const t = root([], [item('a', 1, '.'), item('b', 1, '.')])
  assert.throws(() => project(t), /S-5/)
})

test('S-5 · the same restart with content on the preceding item is accepted', () => {
  const t = root([], [item('a', 1, '.', [block('paragraph', 'x')]), item('b', 1, '.')])
  assert.doesNotThrow(() => project(t))
  assert.equal(stringify(lift(project(t))), stringify(t))
})

test('S-6 · a first item beyond nine digits is rejected', () => {
  assert.throws(() => project(root([], [item('a', 1_000_000_000, '.')])), /S-6/)
})

test('S-6 · ordinal without delimiter, or on a section, is rejected', () => {
  const half = node('item', 'a')
  half.ordinal = 1
  assert.throws(() => project(root([], [half])), /S-6/)
  const section = node('section', 'a')
  section.ordinal = 1
  section.delimiter = '.'
  assert.throws(() => project(root([], [section])), /S-6/)
})

test('S-6 · a delimiter other than . or ) is rejected', () => {
  assert.throws(() => project(root([], [item('a', 1, ':')])), /S-6/)
})
