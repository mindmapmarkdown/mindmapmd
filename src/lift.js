// lift — the rules by which a document determines exactly one tree (§2.2, §2.3).
//
// CommonMark is not reimplemented here. §1.5.1 layers this specification on
// CommonMark and does not modify it, so the block structure comes from the
// reference parser and these rules run over its output.
//
// Licensed under Apache-2.0. See LICENSE.

import { Parser } from 'commonmark'
import { block, node, root } from './tree.js'

const parser = new Parser()

/**
 * L-9 — a hard line break is one construct however it is spelled. Lift records
 * it in the backslash form, because the other is invisible: a break carried by
 * trailing spaces is silently destroyed by an editor that trims them.
 *
 * Applied only where inline content lives. A code block's trailing spaces are
 * not a line break and must survive — which P-8, as written, forbids in
 * canonical output. RFC 0038 part 3 proposes exempting code block content.
 */
const INLINE_BLOCKS = new Set(['paragraph', 'heading', 'block_quote'])
const hardBreaks = (text) => text.replace(/[ ]{2,}\n/g, '\\\n')

/**
 * L-10 — front matter. A document opening with a line of exactly three hyphens
 * and carrying a later such line holds that run of lines as one opaque block.
 *
 * It is taken off before the parser sees the text rather than found afterwards,
 * because CommonMark does not read it as one block at all: the opening fence is
 * a thematic break and the closing fence, following a paragraph, is a setext
 * heading underline — so the parser hands back a heading whose text is the
 * block's contents, and L-1 makes a node of it.
 *
 * Trailing spaces and tabs come off each line, for the reason L-9 exists: P-9
 * writes the recorded source back and P-8 forbids a line ending in whitespace.
 *
 * Nothing here parses the block. It is opaque text at a known position.
 *
 * @returns {{source: string, rest: string}|null} null when there is no front
 *   matter, in which case the first line is read as CommonMark reads it.
 */
const FRONT_MATTER_FENCE = /^---[ \t]*$/
function frontMatter(markdown) {
  const all = markdown.split('\n')
  if (!FRONT_MATTER_FENCE.test(all[0] ?? '')) return null
  for (let i = 1; i < all.length; i++) {
    if (!FRONT_MATTER_FENCE.test(all[i])) continue
    return {
      source: all
        .slice(0, i + 1)
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n'),
      rest: all.slice(i + 1).join('\n'),
    }
  }
  return null
}

/**
 * Remove up to `k` columns of leading whitespace from `line`. Tabs advance to
 * the next multiple of four, as CommonMark counts them; a tab that would cross
 * column `k` leaves behind the spaces that fall past it.
 */
function stripColumns(line, k) {
  let col = 0
  let i = 0
  while (col < k && i < line.length) {
    if (line[i] === ' ') {
      col++
      i++
    } else if (line[i] === '\t') {
      const next = col + (4 - (col % 4))
      if (next > k) return ' '.repeat(next - k) + line.slice(i + 1)
      col = next
      i++
    } else {
      break
    }
  }
  return line.slice(i)
}

/**
 * The lines a block occupies, as written, with no line losing more than the
 * first did. The first line is cut at the column where the block begins; every
 * later line loses up to that many columns of leading whitespace.
 *
 * PROTOTYPE for RFC 0038 part 1. Before it, later lines kept the indentation of
 * the list item that contains the block, projection added the item's
 * indentation again, and any multi-line block inside a list item failed the
 * tree round-trip.
 */
function linesOf(n, lines) {
  const [[sl, sc], [el, ec]] = n.sourcepos
  if (sl === el) return lines[sl - 1].slice(sc - 1, ec)
  const k = sc - 1
  const out = [lines[sl - 1].slice(k)]
  for (let i = sl; i < el - 1; i++) out.push(stripColumns(lines[i], k))
  out.push(stripColumns(lines[el - 1].slice(0, ec), k))
  return out.join('\n')
}

/**
 * PROTOTYPE for RFC 0038 part 2 — a code block, fenced or indented, is recorded
 * in the one form P-5 permits.
 *
 * The content is CommonMark's own: the lines between the fences, or the lines of
 * an indented block, with the indentation CommonMark removes already removed —
 * including a list item's. The fence is backticks, or tildes when the info
 * string holds a backtick (a backtick fence cannot carry one); its length is
 * three, or one more than the longest run of that character in the content.
 */
function codeSourceOf(n, lines) {
  const content = n.literal ?? ''
  let info = ''
  if (n.info != null) {
    // The info string as written, not CommonMark's unescaped `info`: an escape or
    // an entity in it is part of what the author wrote.
    const first = lines[n.sourcepos[0][0] - 1].slice(n.sourcepos[0][1] - 1)
    info = first.replace(/^ *(`{3,}|~{3,})/, '').trim()
  }
  const char = info.includes('`') ? '~' : '`'
  const runs = content.match(char === '`' ? /`+/g : /~+/g) ?? []
  const fence = char.repeat(Math.max(3, 1 + runs.reduce((m, r) => Math.max(m, r.length), 0)))
  const body = content === '' ? [] : content.replace(/\n$/, '').split('\n')
  return [fence + info, ...body, fence].join('\n')
}

/** Source of a block recorded as node content. E-5. */
function sourceOf(n, lines) {
  if (n.type === 'code_block') return codeSourceOf(n, lines)
  const text = linesOf(n, lines)
  return INLINE_BLOCKS.has(n.type) ? hardBreaks(text) : text
}

/** Source of a heading or item label, unchanged by the prototype. */
function rawSourceOf(n, lines) {
  const [[sl, sc], [el, ec]] = n.sourcepos
  let text
  if (sl === el) {
    text = lines[sl - 1].slice(sc - 1, ec)
  } else {
    const out = [lines[sl - 1].slice(sc - 1)]
    for (let i = sl; i < el - 1; i++) out.push(lines[i])
    out.push(lines[el - 1].slice(0, ec))
    text = out.join('\n')
  }
  return INLINE_BLOCKS.has(n.type) ? hardBreaks(text) : text
}

/**
 * E-4 — the node's inline content exactly as it appears in the source, with
 * leading and trailing whitespace removed. Inline markup is NOT interpreted.
 *
 * The marker is not inline content, so an ATX heading loses its hashes and a
 * setext heading loses its underline.
 */
function labelOf(n, lines) {
  const text = rawSourceOf(n, lines)
  if (n.type !== 'heading') return text.trim()
  return text
    .replace(/^#{1,6}[ \t]*/, '')
    .replace(/[ \t]*#*[ \t]*$/, '')
    .replace(/\n[=\-]+[ \t]*$/, '')
    .trim()
}

/**
 * Lift a document to the tree this specification prescribes for it.
 *
 * L-8 — a function of the document text alone. Nothing here resolves, fetches,
 * or otherwise depends on any resource the document references.
 *
 * @param {string} markdown
 * @returns {{content: Array, children: Array}}
 */
export function lift(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('lift expects a string')

  // L-10 — front matter is the root's first content entry and produces no node.
  // Everything after it is an ordinary document, and the line numbers the parser
  // reports are line numbers in that remainder.
  const matter = frontMatter(markdown)
  const text = matter ? matter.rest : markdown

  const lines = text.replace(/\n$/, '').split('\n')
  const doc = parser.parse(text)
  const tree = root()
  if (matter) tree.content.push(block('front_matter', matter.source))

  // Sections open and close by nesting, not by level (L-5).
  const open = []
  const current = () => (open.length ? open[open.length - 1].node : tree)

  const items = (list, parent, inItem) => {
    for (let li = list.firstChild; li; li = li.next) {
      const item = node('item', '')
      let labelled = false
      for (let b = li.firstChild; b; b = b.next) {
        if (b.type === 'list') {
          items(b, item, true) // L-7 — depth is nesting within the list
          continue
        }
        if (b.type === 'heading') {
          // L-1 says this produces a section, and S-1 says a section may not
          // have an item ancestor. §2.4 explains why the document itself is not
          // conforming: the nesting does not survive an unmodified renderer,
          // which L0 forbids. Lift is defined over conforming documents.
          throw new Error(
            'not a conforming document (spec.md §2.4): a heading inside a list ' +
              `item would lift to a section under an item, which S-1 forbids — ` +
              `heading ${JSON.stringify(labelOf(b, lines))}`,
          )
        }
        if (!labelled) {
          item.label = labelOf(b, lines)
          labelled = true
          continue
        }
        item.content.push(block(b.type, sourceOf(b, lines))) // L-3
      }
      parent.children.push(item)
    }
    void inItem
  }

  for (let b = doc.firstChild; b; b = b.next) {
    if (b.type === 'heading') {
      // L-5 — a heading at or below the open section's level closes it
      while (open.length && open[open.length - 1].level >= b.level) open.pop()
      const section = node('section', labelOf(b, lines)) // L-2
      current().children.push(section)
      open.push({ level: b.level, node: section })
    } else if (b.type === 'list') {
      items(b, current(), false)
    } else {
      // L-3 — every other block is content, attached to the nearest node
      // preceding it; content before any node attaches to the root
      current().content.push(block(b.type, sourceOf(b, lines)))
    }
  }

  return tree
}
