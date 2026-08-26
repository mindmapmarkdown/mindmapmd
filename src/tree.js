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

export function ordered(tree) {
  const entry = (e) => ({ block: e.block, source: e.source })
  const walk = (n) =>
    'kind' in n
      ? {
          kind: n.kind,
          label: n.label,
          content: n.content.map(entry),
          children: n.children.map(walk),
        }
      : { content: n.content.map(entry), children: n.children.map(walk) }
  return walk(tree)
}

export const stringify = (tree) => JSON.stringify(ordered(tree))

// ── S-1, S-2 · well-formedness ──────────────────────────────────────

export const MAX_SECTION_DEPTH = 6

/**
 * Every way `tree` fails S-1 or S-2, as sentences. Empty means well-formed.
 *
 * Reported rather than thrown, because S-3 requires an implementation to
 * reject such a tree and a caller deserves to be told everything that is wrong
 * with it rather than only the first thing.
 */
export function problems(tree) {
  const found = []
  const walk = (n, path, sectionDepth, underItem) => {
    for (const [i, child] of n.children.entries()) {
      const at = `${path}/${i}`
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
