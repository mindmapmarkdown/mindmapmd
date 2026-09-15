// The tree, and the encoding §2.6 gives it.
//
// A tree is an abstract structure. This module holds the one notation the
// specification defines for it — the fixture encoding of §2.6 — together with
// the equality E-7 requires and the well-formedness S-1 and S-2 demand.
//
// Licensed under Apache-2.0. See LICENSE.

/** The synthetic root (L-4): no label, no kind, no text of its own. */
export function root(content = [], children = []) {
  return { content, children }
}

/** A node (E-2): exactly four members, all present even when empty. */
export function node(kind, label, content = [], children = []) {
  return { kind, label, content, children }
}

/** A content entry (E-5): exactly two members. */
export function block(name, source) {
  return { block: name, source }
}

// ── E-7 · equality ──────────────────────────────────────────────────
//
// Objects have the same set of member names and each corresponding value is
// equal; arrays have the same length and are equal element-wise in order;
// strings are identical sequences of code points. NO UNICODE NORMALISATION is
// applied, in either direction, at any point — which is why this is written out
// rather than delegated to a library that might helpfully normalise.

export function equal(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => equal(x, b[i]))
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
    return ka.every((k) => equal(a[k], b[k]))
  }
  return false
}

// ── E-8 · member order ──────────────────────────────────────────────
//
// SHOULD, not MUST, and not significant to E-7. Applied on the way out so that
// a serialised tree reads the way the specification writes one.
// PROTOTYPE (RFC 0039): an ordered item's `ordinal` and `delimiter` follow its
// label.

export function ordered(tree) {
  const entry = (e) => ({ block: e.block, source: e.source })
  const walk = (n) => {
    if (!('kind' in n)) return { content: n.content.map(entry), children: n.children.map(walk) }
    const out = { kind: n.kind, label: n.label }
    if ('ordinal' in n) out.ordinal = n.ordinal
    if ('delimiter' in n) out.delimiter = n.delimiter
    out.content = n.content.map(entry)
    out.children = n.children.map(walk)
    return out
  }
  return walk(tree)
}

export const stringify = (tree) => JSON.stringify(ordered(tree))

// ── Lists (PROTOTYPE, RFC 0039) ─────────────────────────────────────

/** The largest number a CommonMark list marker can carry: nine digits. */
export const MAX_ORDINAL = 999_999_999

const isOrdered = (item) => item.ordinal !== undefined

/** Whether two sibling items are of one list type: both bullet, or both ordered with one delimiter. */
const sameType = (a, b) => isOrdered(a) === isOrdered(b) && a.delimiter === b.delimiter

/**
 * The CommonMark lists a run of sibling items divides into. An item continues
 * the list before it when both are of one type and, if ordered, its ordinal is
 * one more than the previous item's.
 */
export function listsOf(items) {
  const out = []
  for (const item of items) {
    const current = out[out.length - 1]
    const prev = current?.[current.length - 1]
    if (prev && sameType(prev, item) && (!isOrdered(item) || item.ordinal === prev.ordinal + 1)) {
      current.push(item)
    } else {
      out.push([item])
    }
  }
  return out
}

/** Whether `next` follows `list` as a list CommonMark would merge into it — a restart. */
export const restarts = (list, next) => sameType(list[list.length - 1], next[0])

/** The deepest last descendant of an item: the nearest node preceding what follows it. */
export const deepestLast = (n) => (n.children.length ? deepestLast(n.children[n.children.length - 1]) : n)

// ── S-1, S-2, S-4, S-5, S-6 · well-formedness ───────────────────────

export const MAX_SECTION_DEPTH = 6

export const FRONT_MATTER = 'front_matter'

/**
 * Every way `tree` fails S-1, S-2, S-4, S-5 or S-6, as sentences. Empty means
 * well-formed.
 *
 * Reported rather than thrown, because S-3 requires an implementation to
 * reject such a tree and a caller deserves to be told everything that is wrong
 * with it rather than only the first thing.
 */
export function problems(tree) {
  const found = []

  // S-4 — a front_matter entry MUST be the first entry of the root's content,
  // and MUST NOT appear anywhere else. Front matter is defined by its position
  // in the document (L-10), so an entry elsewhere encodes a tree no document
  // lifts to and P-11 could not write back.
  const matter = (n, path, isRoot) => {
    for (const [i, entry] of n.content.entries()) {
      if (entry.block !== FRONT_MATTER) continue
      if (isRoot && i === 0) continue
      found.push(
        `S-4: front_matter entry at ${path}/content/${i}, which is not the first ` +
          `entry of the root's content`,
      )
    }
  }
  matter(tree, '', true)

  // PROTOTYPE S-6 (RFC 0039) — `ordinal` and `delimiter` appear together, only
  // on items; the ordinal is a non-negative integer, the delimiter `.` or `)`;
  // and the first item of each CommonMark list carries a number a marker can
  // hold.
  // PROTOTYPE S-5 — a list that restarts its numbering with the same delimiter
  // as the list before it must be separable from that list: the nearest node
  // preceding it must have content (P-12).
  const lists = (n, path) => {
    const items = n.children.map((c, i) => [c, i]).filter(([c]) => c.kind === 'item')
    for (const [c, i] of n.children.map((c, i) => [c, i])) {
      const at = `${path}/${i}`
      const has = ['ordinal' in c, 'delimiter' in c]
      if (has[0] !== has[1]) found.push(`S-6: node at ${at} has one of ordinal and delimiter without the other`)
      if (has[0] && c.kind !== 'item') found.push(`S-6: ${c.kind} at ${at} has an ordinal; only items may`)
      if (has[0] && !(Number.isInteger(c.ordinal) && c.ordinal >= 0)) {
        found.push(`S-6: item at ${at} has ordinal ${JSON.stringify(c.ordinal)}, not a non-negative integer`)
      }
      if (has[1] && c.delimiter !== '.' && c.delimiter !== ')') {
        found.push(`S-6: item at ${at} has delimiter ${JSON.stringify(c.delimiter)}, not "." or ")"`)
      }
    }
    const runsOf = []
    for (const [c, i] of items) {
      const lastRun = runsOf[runsOf.length - 1]
      if (lastRun && lastRun.end === i - 1) {
        lastRun.nodes.push(c)
        lastRun.end = i
      } else runsOf.push({ nodes: [c], end: i })
    }
    for (const run of runsOf) {
      const groups = listsOf(run.nodes)
      for (const [g, group] of groups.entries()) {
        const first = group[0]
        if (first.ordinal !== undefined && first.ordinal > MAX_ORDINAL) {
          found.push(`S-6: an ordered list at ${path} starts at ${first.ordinal}, which no marker can carry`)
        }
        if (g > 0 && restarts(groups[g - 1], group)) {
          const d = deepestLast(groups[g - 1][groups[g - 1].length - 1])
          if (!d.content.length) {
            found.push(
              `S-5: the ordered list starting at ${first.ordinal}${first.delimiter} under ${path || 'the root'} ` +
                `restarts the list before it, and ${JSON.stringify(d.label)} — the node preceding it — has no content to separate them`,
            )
          }
        }
      }
    }
  }

  const walk = (n, path, sectionDepth, underItem) => {
    lists(n, path)
    for (const [i, child] of n.children.entries()) {
      const at = `${path}/${i}`
      matter(child, at, false)
      if (child.kind === 'section') {
        // S-1 — a section MUST NOT have an item ancestor
        if (underItem) {
          found.push(`S-1: section ${JSON.stringify(child.label)} at ${at} has an item ancestor`)
        }
        // S-2 — a section MUST NOT be deeper than 6
        const depth = sectionDepth + 1
        if (depth > MAX_SECTION_DEPTH) {
          found.push(`S-2: section ${JSON.stringify(child.label)} at ${at} is at depth ${depth}`)
        }
        walk(child, at, depth, underItem)
      } else {
        walk(child, at, sectionDepth, true)
      }
    }
  }
  walk(tree, '', 0, false)
  return found
}

export const wellFormed = (tree) => problems(tree).length === 0

/** S-3 — reject, and never coerce the offending nodes to `item`. */
export function assertWellFormed(tree) {
  const found = problems(tree)
  if (found.length) {
    throw new Error(`tree is not well-formed (spec.md §2.4):\n  ${found.join('\n  ')}`)
  }
  return tree
}
