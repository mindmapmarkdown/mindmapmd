// project — the rules by which a tree determines exactly one Markdown document
// (§2.5). This is canonical projection: one tree, one spelling.
//
// Licensed under Apache-2.0. See LICENSE.

import { assertWellFormed } from './tree.js'

/** P-5, P-9 — a code block comes back fenced with backticks, whatever it was. */
function fenced(source) {
  if (/^(```|~~~)/.test(source)) return source // already fenced; P-9 keeps it
  // An indented code block's recorded source carries no fence. What it should
  // carry is an open question (mindmapmarkdown/spec#19); until that is decided,
  // the only reading that satisfies P-5 is to fence it here.
  const ticks = '`'.repeat(Math.max(3, longestRun(source) + 1))
  return `${ticks}\n${source}\n${ticks}`
}

const longestRun = (s) => (s.match(/`+/g) ?? ['']).reduce((n, r) => Math.max(n, r.length), 0)

/** P-9 — each entry written as the block it records, retaining line structure. */
const contentBlocks = (content) =>
  content.map((e) => (e.block === 'code_block' ? fenced(e.source) : e.source))

/**
 * Whether a run of sibling items is loose. P-7 — a list MUST be tight unless an
 * item carries block content, in which case the list MUST be loose.
 */
const loose = (run) => run.some((item) => item.content.length > 0)

/** Split children into runs, so that each maximal run of items is one list. */
function runs(children) {
  const out = []
  for (const child of children) {
    const last = out[out.length - 1]
    if (last && last.kind === child.kind) last.nodes.push(child)
    else out.push({ kind: child.kind, nodes: [child] })
  }
  return out
}

/**
 * A heading or list item line: its marker, then its label. An empty label is
 * the bare marker — `-` is an empty list item and `##` an empty ATX heading in
 * CommonMark, whereas the space before an empty label would end the line in
 * whitespace, which P-8 forbids.
 */
const marked = (marker, label) => (label ? `${marker} ${label}` : marker)

const indent = (text, pad) =>
  text
    .split('\n')
    .map((line) => (line.length ? pad + line : line)) // P-8 — no line ends in whitespace
    .join('\n')

/**
 * Project a tree to its canonical Markdown document.
 *
 * @param {{content: Array, children: Array}} tree
 * @returns {string} the document, ending in exactly one line feed (P-8)
 */
export function project(tree) {
  assertWellFormed(tree) // S-3 — reject, never coerce

  /**
   * Blocks of a node's own content, then its children. P-10.
   *
   * P-11 needs no code of its own here. S-4, enforced above, puts a
   * `front_matter` entry first in the root's content and nowhere else, so this
   * writes it at the first line of the document, and the `\n\n` join below is
   * the single blank line P-11 asks for after it.
   */
  const body = (n, sectionDepth) => {
    const out = [...contentBlocks(n.content)]
    for (const run of runs(n.children)) {
      if (run.kind === 'section') {
        for (const section of run.nodes) out.push(...sectionOf(section, sectionDepth + 1))
      } else {
        out.push(list(run.nodes, sectionDepth))
      }
    }
    return out
  }

  /** P-1, P-2, P-6 — a section is an ATX heading whose level is its depth. */
  const sectionOf = (n, depth) => {
    const heading = marked('#'.repeat(Math.min(depth, 6)), n.label)
    return [heading, ...body(n, depth)]
  }

  /**
   * P-3, P-4 — one list, marker `-`, each nesting level indented by exactly two
   * spaces relative to its parent item's marker.
   */
  const list = (nodes, sectionDepth) => {
    const sep = loose(nodes) ? '\n\n' : '\n'
    return nodes
      .map((item) => {
        const own = contentBlocks(item.content)
        const nested = runs(item.children)
          .filter((r) => r.kind === 'item')
          .map((r) => list(r.nodes, sectionDepth))
        const head = marked('-', item.label)
        if (!own.length && !nested.length) return head
        // A nested list under an item with no content of its own follows
        // immediately: P-7 asks for a blank line between *blocks of content*,
        // and a sublist is not one. Content, when present, is a block and takes
        // its blank lines.
        if (!own.length) return `${head}\n${indent(nested.join('\n'), '  ')}`
        return `${head}\n\n${indent([...own, ...nested].join('\n\n'), '  ')}`
      })
      .join(sep)
  }

  // P-7 — a single blank line separates a heading from what follows it and each
  // block of node content from the next. P-8 — exactly one trailing line feed.
  const document = body(tree, 0).join('\n\n')
  return document ? `${document}\n` : ''
}
