// RFC 0038 prototype — what a content block's source contains.
//
// NOT CONFORMANCE. These cases test a proposal that is still in its comment
// period (mindmapmarkdown/spec, RFC 0038). If the RFC is rejected, this file and
// the prototype go with it.
//
// Every case is checked on what a reader of the document would notice, not only
// on what the tree says. Equal source strings can still mean different code: a
// fence indented two spaces used to lift and project to an equal tree while the
// code gained two spaces of indentation.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'
import { Parser } from 'commonmark'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { stringify } from '../src/tree.js'

const parser = new Parser()

/** Each code block's content and info string, as CommonMark reads them. */
function codeOf(md) {
  const found = []
  const walker = parser.parse(md).walker()
  let ev
  while ((ev = walker.next())) {
    if (ev.entering && ev.node.type === 'code_block') {
      // An indented block reports info as null, a fenced block without one as
      // ''. Both mean no info string.
      found.push({ literal: ev.node.literal, info: ev.node.info || '' })
    }
  }
  return found
}

/** Lines outside a code block's content that end in whitespace (P-8). */
function trailingOutsideCode(md) {
  const bad = []
  let open = null
  for (const line of md.split('\n')) {
    const m = line.match(/^ *(`{3,}|~{3,})(.*)$/)
    if (open === null && m) {
      open = m[1]
      continue
    }
    if (open !== null && m && m[1][0] === open[0] && m[1].length >= open.length && !m[2].trim()) {
      open = null
      continue
    }
    if (open === null && /[ \t]$/.test(line)) bad.push(line)
  }
  return bad
}

/** Fences that are tildes although their info string has no backtick (P-5). */
function needlessTildes(md) {
  return md.split('\n').filter((l) => /^ *~{3,}/.test(l) && !/^ *~{3,}\s*$/.test(l) && !l.includes('`'))
}

const cases = {
  'indented code': '# A\n\n    make all\n    make test\n',
  'tilde fence': '# A\n\n~~~py\nx = 1\n~~~\n',
  'tilde fence whose info string holds a backtick': '# A\n\n~~~ a`b\nx\n~~~\n',
  'backtick fence longer than needed': '# A\n\n````js\nx\n````\n',
  'content that holds a backtick fence': '# A\n\n````\n```\ninner\n```\n````\n',
  'fence indented two spaces': '# A\n\n  ```\n  x\n    y\n  ```\n',
  'unclosed fence': '# A\n\n```\nx\n',
  'unclosed fence swallowing a heading': '# A\n\n```\nx\n\n# B\n',
  'empty fenced block': '# A\n\n```\n```\n',
  'one blank line of content': '# A\n\n```\n\n```\n',
  'code block inside a list item': '- item\n\n  ```\n  code\n  more\n  ```\n',
  'code in a list item with a blank line inside': '- item\n\n  ```\n  a\n\n  b\n  ```\n',
  'indented code inside a list item': '- item\n\n      code\n',
  'two-line paragraph inside a list item': '- item\n\n  para one\n  para two\n',
  'block quote inside a list item': '- item\n\n  > a\n  > b\n',
  'lazy continuation line': '- item\n\n  para one\npara two\n',
  'nested item with a two-line paragraph': '- a\n  - b\n\n    one\n    two\n',
  'ordered item, marker three wide': '1. item\n\n   one\n   two\n',
  'code content with trailing spaces': '# A\n\n```\nx  \n```\n',
  'tab-indented code': '# A\n\n\tmake all\n',
  'info string with a backslash escape': '# A\n\n```a\\_b\nx\n```\n',
  'multi-line item label': '- line one\n  line two\n',
  'suite example: a block quote and a code block': '# Install\n\n> Requires Node 20.\n\n```bash\nnpm i\n```\n',
}

for (const [name, md] of Object.entries(cases)) {
  test(`RFC 0038 · ${name}`, () => {
    const tree = lift(md)
    const once = project(tree)

    assert.equal(stringify(lift(once)), stringify(tree), 'tree round-trip')
    assert.equal(project(lift(once)), once, 'second projection is byte-stable')
    assert.deepEqual(codeOf(once), codeOf(md), 'code content and info string survive projection')
    assert.deepEqual(needlessTildes(once), [], 'P-5 as amended — backticks unless the info string holds one')
    assert.deepEqual(trailingOutsideCode(once), [], 'P-8 as amended — trailing whitespace only inside code')
  })
}

// ── The examples RFC 0038 proposes for spec.md ─────────────────────

const examples = [
  {
    name: 'indented code is recorded fenced',
    md: '# Build\n\n    make all\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Build","content":[{"block":"code_block","source":"```\nmake all\n```"}],"children":[]}]},
    canonical: false,
  },
  {
    name: 'a tilde fence is recorded with backticks',
    md: '# Run\n\n~~~py\nprint(1)\n~~~\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Run","content":[{"block":"code_block","source":"```py\nprint(1)\n```"}],"children":[]}]},
    canonical: false,
  },
  {
    name: 'blocks inside a list item carry no indentation of the item',
    md: '- Install\n\n  Run this\n  from the root:\n\n  ```sh\n  npm i\n  ```\n',
    tree: {"content":[],"children":[{"kind":"item","label":"Install","content":[{"block":"paragraph","source":"Run this\nfrom the root:"},{"block":"code_block","source":"```sh\nnpm i\n```"}],"children":[]}]},
    canonical: true,
  },
  {
    name: 'trailing whitespace inside code is content',
    md: '# Patch\n\n```diff\n-old  \n+new\n```\n',
    tree: {"content":[],"children":[{"kind":"section","label":"Patch","content":[{"block":"code_block","source":"```diff\n-old  \n+new\n```"}],"children":[]}]},
    canonical: true,
  },
]

for (const e of examples) {
  test(`RFC 0038 example · ${e.name}`, () => {
    assert.equal(stringify(lift(e.md)), stringify(e.tree))
    assert.equal(project(lift(e.md)) === e.md, e.canonical, e.canonical ? 'canonical' : 'not canonical')
  })
}
