// §2.4 — well-formedness, and the rejection S-3 requires.
//
// S-1, S-2 and S-4 constrain the shape of a tree and are checked where the tree
// lives (tree.js). S-7 is not about shape: a tree is well-formed only if its
// canonical projection lifts back to it. Checking that needs both directions, so
// it lives here, where importing lift and projection does not pull either into
// tree.js.
//
// Licensed under Apache-2.0. See LICENSE.

import { lift } from './lift.js'
import { write } from './project.js'
import { equal, structuralProblems } from './tree.js'

/**
 * Every way `tree` fails §2.4, as sentences. Empty means well-formed.
 *
 * S-7 is read only for a tree that satisfies the structural rules: projection is
 * not asked to write a section under an item, and a tree that fails S-1 is not
 * well-formed whatever its projection would do.
 */
export function problems(tree) {
  const found = structuralProblems(tree)
  if (found.length) return found

  let back
  try {
    back = lift(write(tree))
  } catch (e) {
    return [`S-7: the canonical projection is not a document lift accepts — ${e.message}`]
  }
  if (!equal(back, tree)) {
    found.push(`S-7: the canonical projection lifts to a different tree — ${difference(tree, back)}`)
  }
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

/** The first place two trees part, for a message a person can act on. */
function difference(want, got, path = '') {
  const at = path || '/'
  const show = JSON.stringify
  if ('kind' in want && want.kind !== got.kind) {
    return `${at}: ${want.kind} comes back as ${got.kind}`
  }
  if ('label' in want && want.label !== got.label) {
    return `${at}: label ${show(want.label)} comes back as ${show(got.label)}`
  }
  if (!equal(want.content, got.content)) {
    return `${at}: content ${show(want.content)} comes back as ${show(got.content)}`
  }
  const shared = Math.min(want.children.length, got.children.length)
  for (let i = 0; i < shared; i++) {
    if (!equal(want.children[i], got.children[i])) {
      return difference(want.children[i], got.children[i], `${path}/${i}`)
    }
  }
  return `${at}: ${want.children.length} children come back as ${got.children.length}`
}
