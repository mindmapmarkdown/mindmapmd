// project — the rules by which a tree determines exactly one Markdown document
// (§2.5). This is canonical projection: one tree, one spelling.
//
// Licensed under Apache-2.0. See LICENSE.

import { MAX_ORDINAL, deepestLast, listsOf, restarts } from './tree.js'
import { assertWellFormed } from './wellformed.js'

/** P-5, P-9 — a code block comes back fenced with backticks, whatever it was. */
function fenced(source) {
  if (/^(```|~~~)/.test(source)) return source // already fenced; P-9 keeps it
  // Lift cannot reach this: L-11 records every code block fenced. A tree built
  // by hand can, and whether a well-formedness rule should reject such an entry
  // or projection should normalise it is left open by RFC 0038. Fencing here is
  // the only reading that satisfies P-5 in the meantime.
  const ticks = '`'.repeat(Math.max(3, longestRun(source) + 1))
  return `${ticks}\n${source}\n${ticks}`
}

const longestRun = (s) => (s.match(/`+/g) ?? ['']).reduce((n, r) => Math.max(n, r.length), 0)

/** P-9 — each entry written as the block it records, retaining line structure. */
const contentBlocks = (content) =>
  content.map((e) => (e.block === 'code_block' ? fenced(e.source) : e.source))

/** Split children into runs, so that each maximal run of items is one run. */
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
 * P-3 (RFC 0039, accepted 2026-09-29) — a bullet item's marker is `-`; an
 * ordered item's is its ordinal followed by its delimiter. CommonMark reads only
 * the first item's number, and a marker may carry at most nine digits, so a
 * later item whose ordinal has outgrown that writes the largest number that
 * fits: its ordinal is implied by the first item's, and the written digits are
 * not read.
 */
const markerOf = (item) =>
  item.ordinal === undefined ? '-' : `${Math.min(item.ordinal, MAX_ORDINAL)}${item.delimiter}`

/**
 * Project a tree to its canonical Markdown document.
 *
 * @param {{content: Array, children: Array}} tree
 * @returns {string} the document, ending in exactly one line feed (P-8)
 */
export function project(tree) {
  return write(assertWellFormed(tree)) // S-3 — reject, never coerce
}

/**
 * The writing half of projection, with no well-formedness check. S-7 asks
 * whether a tree's projection lifts back to it, so checking S-7 has to project
 * without first checking S-7. Nothing else should call this.
 *
 * @param {{content: Array, children: Array}} tree
 * @returns {string}
 */
export function write(tree) {
  /**
   * Blocks of a node's own content, then its children. P-10.
   *
   * P-11 needs no code of its own here. S-4, enforced by project, puts a
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
        out.push(listRun(run.nodes))
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
   * Nodes whose content is written after their list rather than inside it —
   * P-12 (RFC 0039). Filled while a run is written.
   */
  const detached = new Set()

  /**
   * A run of sibling items, written as the CommonMark lists it divides into
   * (`listsOf`). Two adjacent lists that CommonMark would otherwise merge — an
   * ordered list that restarts its numbering with the same delimiter — are kept
   * apart by writing the content of the nearest node preceding the second list,
   * which is the first list's deepest last item, unindented between them. L-3
   * attaches that content back to the same node, and it ends the first list.
   */
  const listRun = (nodes) => {
    const groups = listsOf(nodes)
    const pieces = []
    for (const [i, group] of groups.entries()) {
      if (i > 0 && restarts(groups[i - 1], group)) {
        const d = deepestLast(groups[i - 1][groups[i - 1].length - 1])
        detached.add(d)
      }
    }
    for (const [i, group] of groups.entries()) {
      pieces.push(list(group))
      const next = groups[i + 1]
      if (next && restarts(group, next)) {
        const d = deepestLast(group[group.length - 1])
        pieces.push(contentBlocks(d.content).join('\n\n'))
      }
    }
    // Adjacent lists of different kinds are separated by a blank line: without
    // one, an ordered item whose number is not 1 would read as a lazy
    // continuation of the item above it.
    return pieces.join('\n\n')
  }

  /** The content an item writes inside its own list. */
  const ownContent = (item) => (detached.has(item) ? [] : contentBlocks(item.content))

  /**
   * One CommonMark list. P-4 (as amended by RFC 0039) — an item's content and
   * nested lists are indented by the width of its marker plus one space: two for
   * `-`, three for `1.`, four for `10.`. P-7 — tight unless an item carries block
   * content in the list.
   */
  const list = (nodes) => {
    const sep = nodes.some((item) => ownContent(item).length > 0) ? '\n\n' : '\n'
    return nodes
      .map((item) => {
        const marker = markerOf(item)
        const pad = ' '.repeat(marker.length + 1)
        const own = ownContent(item)
        const nested = runs(item.children)
          .filter((r) => r.kind === 'item')
          .map((r) => listRun(r.nodes))
        const head = marked(marker, item.label)
        if (!own.length && !nested.length) return head
        // A nested list under an item with no content of its own follows
        // immediately: P-7 asks for a blank line between *blocks of content*,
        // and a sublist is not one. Content, when present, is a block and takes
        // its blank lines.
        if (!own.length) {
          // RFC 0046 — except when the first nested item has an empty label
          // under a label of this item's own. Written directly below the label,
          // a bare `-` is a setext heading underline, and CommonMark does not
          // let an empty item of any other marker interrupt a paragraph; a blank
          // line is the only spelling that lifts back to this tree. The marker
          // the empty item carries makes no difference, which is why this does
          // not look at it.
          const gap = item.label && item.children[0].label === '' ? '\n\n' : '\n'
          return `${head}${gap}${indent(nested.join('\n'), pad)}`
        }
        return `${head}\n\n${indent([...own, ...nested].join('\n\n'), pad)}`
      })
      .join(sep)
  }

  // P-7 — a single blank line separates a heading from what follows it and each
  // block of node content from the next. P-8 — exactly one trailing line feed.
  const document = body(tree, 0).join('\n\n')
  return document ? `${document}\n` : ''
}
