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
 * not a line break and must survive, and P-8 now exempts a content line of a
 * code block for exactly that reason (RFC 0038 Part 3).
 */
const INLINE_BLOCKS = new Set(['paragraph', 'heading', 'block_quote'])
const hardBreaks = (text) => text.replace(/[ ]{2,}\n/g, '\\\n')

/**
 * PROTOTYPE (spec#59) — no line of a recorded string ends in whitespace.
 *
 * `P-8` forbids a line ending in whitespace outside a code block, and `P-9`
 * writes a recorded source back as it stands, so a `source` with a line ending
 * in whitespace has **no** canonical projection at all: the P-rules are
 * unsatisfiable for that tree. This is the collision `L-9` and `L-10` each
 * resolved for one construct, resolved for the rest.
 *
 * Applied after `hardBreaks`, so the two or more spaces that spell a hard break
 * have already become a backslash and are not removed here.
 */
const trimLines = (text) => text.replace(/[ \t]+$/gm, '')

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
  // PROTOTYPE (RFC 0048) — the line after the opening fence must not be blank.
  // Front matter written by Jekyll, Hugo or Obsidian opens on its first key. A
  // note that opens with a thematic break and carries a later one has a blank
  // line there, and its author means both fences as rules, not as a block —
  // reported on the Obsidian forum, mindmapmarkdown/spec#35.
  if (!/\S/.test(all[1] ?? '')) return null
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
 * The columns `line` occupies before character `i`, a tab advancing to the next
 * multiple of four as CommonMark counts it. E-5 measures columns, and a line
 * indented with one tab has given up four of them, not one.
 */
function columnsBefore(line, i) {
  let col = 0
  for (let j = 0; j < i; j++) col += line[j] === '\t' ? 4 - (col % 4) : 1
  return col
}

/**
 * The lines a block occupies, as written, with no line losing more than the
 * first did. The first line is cut at the column where the block begins; every
 * later line loses up to that many columns of leading whitespace.
 *
 * E-5, as amended by RFC 0038 Part 1. Before that amendment, later lines kept
 * the indentation of the list item containing the block, projection added the
 * item's indentation again, and any multi-line block inside a list item failed
 * the tree round-trip.
 *
 * Where the block begins is measured rather than taken from the parser. **A
 * block never begins with whitespace** — the columns before its first character
 * belong to whatever contains it, which is what E-5 says — and commonmark.js
 * reports a column that falls short in one case: a paragraph whose first line
 * follows a link reference definition is reported at the column of the paragraph
 * the definition was taken out of, so `[x]: /x` then `␣␣para` reported the
 * paragraph at column 1 and its source kept two spaces that are not its own.
 */
function linesOf(n, lines) {
  const [[sl, sc], [el, ec]] = n.sourcepos
  const first = lines[sl - 1]
  let i = sc - 1
  while (i < first.length && (first[i] === ' ' || first[i] === '\t')) i++
  if (sl === el) return first.slice(i, Math.max(i, ec))
  const k = columnsBefore(first, i)
  const out = [first.slice(i)]
  for (let j = sl; j < el - 1; j++) out.push(stripColumns(lines[j], k))
  out.push(stripColumns(lines[el - 1].slice(0, ec), k))
  return out.join('\n')
}

/**
 * L-11, added by RFC 0038 Part 2 — a code block, fenced or indented, is
 * recorded in the one form P-5 permits.
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
  if (n.type === 'code_block') return codeSourceOf(n, lines) // L-11; P-8 exempts its content
  const text = linesOf(n, lines)
  return trimLines(INLINE_BLOCKS.has(n.type) ? hardBreaks(text) : text)
}

/**
 * Source of a heading or item label.
 *
 * PROTOTYPE (spec#55) — a label's later lines lose up to as many columns as the
 * first line gave up, which is what `E-5` already does for a content block.
 * Before this, a label below the top level kept its item's content column on
 * every line after the first, projection indented the item again, and the tree
 * did not survive its own projection.
 */
function rawSourceOf(n, lines) {
  const [[sl, sc], [el, ec]] = n.sourcepos
  const first = lines[sl - 1]
  let i = sc - 1
  while (i < first.length && (first[i] === ' ' || first[i] === '\t')) i++
  let text
  if (sl === el) {
    text = first.slice(i, Math.max(i, ec))
  } else {
    const k = columnsBefore(first, i)
    const out = [first.slice(i)]
    for (let j = sl; j < el - 1; j++) out.push(stripColumns(lines[j], k))
    out.push(stripColumns(lines[el - 1].slice(0, ec), k))
    text = out.join('\n')
  }
  return trimLines(INLINE_BLOCKS.has(n.type) ? hardBreaks(text) : text)
}

/**
 * E-4 — the node's inline content exactly as it appears in the source, with
 * leading and trailing whitespace removed. Inline markup is NOT interpreted.
 *
 * The marker is not inline content, so an ATX heading loses its hashes and a
 * setext heading loses its underline.
 *
 * An ATX heading's closing sequence is a run of `#` that is the whole content or
 * is preceded by a space or tab. A `#` escaped with a backslash is not part of
 * one: CommonMark reads `## Title \#` as the heading text `Title #`, so the label
 * is `Title \#`, and `# C#` keeps its `#` because nothing separates it.
 */
const ATX_OPENER = /^[ ]{0,3}#{1,6}(?=[ \t]|$)/

function labelOf(n, lines) {
  const text = rawSourceOf(n, lines)
  if (n.type !== 'heading') return text.trim()
  if (!ATX_OPENER.test(text)) return text.replace(/\n[ ]{0,3}(=+|-+)[ \t]*$/, '').trim()
  return text
    .replace(ATX_OPENER, '')
    .replace(/(^|[ \t])#+[ \t]*$/, '')
    .trim()
}

/**
 * PROTOTYPE (RFC 0051, spec#40) — the lines of a link reference definition.
 *
 * CommonMark takes a definition out of the document before it builds the tree:
 * the parser reports no node for it, and the blocks around it report source
 * positions that skip its lines. Those skipped lines are what this finds — every
 * line no block covers and that is not blank. In a conforming document nothing
 * else can be there, because every other construct is a block.
 *
 * Container blocks are not counted as cover: a list item's range spans the
 * definition inside it, which is the gap being looked for.
 */
// A list and its items are structure — each item becomes a node, and a gap
// between them is where a definition can hide. Every other block is recorded
// with its source intact, a block quote included, so a definition written inside
// one is already part of what is recorded and is not a gap.
const STRUCTURE = new Set(['list', 'item'])
const NON_BLANK = /\S/

function definitionRuns(doc, lines) {
  const covered = new Set()
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.next) {
      if (!c.sourcepos) continue
      if (STRUCTURE.has(c.type)) {
        // Only the marker line: the rest of a list's range is its items and the
        // gaps between them, and a gap is what is being looked for. The marker
        // line itself is covered, or an empty item — a bare `-` — would read as
        // a definition.
        covered.add(c.sourcepos[0][0])
      } else {
        for (let i = c.sourcepos[0][0]; i <= c.sourcepos[1][0]; i++) covered.add(i)
      }
      walk(c)
    }
  }
  walk(doc)

  const runs = []
  for (let i = 1; i <= lines.length; i++) {
    if (covered.has(i) || !NON_BLANK.test(lines[i - 1])) continue
    const start = i
    while (i + 1 <= lines.length && !covered.has(i + 1) && NON_BLANK.test(lines[i])) i++
    runs.push({ start, end: i })
  }
  return runs
}

/**
 * The columns of leading whitespace on a line, counting a tab to the next
 * multiple of four as CommonMark does. E-5 measures a block's starting column,
 * not its leading characters: one tab is four columns, not one.
 */
function leadColumns(line) {
  let col = 0
  for (const ch of line) {
    if (ch === ' ') col++
    else if (ch === '\t') col += 4 - (col % 4)
    else break
  }
  return col
}

/** A definition's source, with its container's indentation removed (E-5). */
function runSource(run, lines) {
  const k = leadColumns(lines[run.start - 1])
  const out = []
  for (let i = run.start; i <= run.end; i++) out.push(stripColumns(lines[i - 1], k))
  return out.join('\n')
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

  // L-3 — a block attaches to the nearest node preceding it in document order.
  // That is the most recently created node: after a heading, its section; after
  // a list, the list's deepest last item, because an item is created before the
  // list nested in it. Content before any node attaches to the root.
  let last = null

  // PROTOTYPE (RFC 0051) — definitions are attached where L-3 puts any block:
  // to the nearest node preceding them. The runs come in document order, so
  // emitting every run that begins before the block about to be read does it.
  const definitions = definitionRuns(doc, lines)
  let pending = 0
  const definitionsBefore = (line) => {
    while (pending < definitions.length && definitions[pending].start < line) {
      const run = definitions[pending++]
      ;(last ?? tree).content.push(block('link_reference_definition', runSource(run, lines)))
    }
  }

  const items = (list, parent, inItem) => {
    // L-12 (RFC 0039, accepted 2026-09-29) — an item of an ordered list records
    // the number CommonMark gives it and its delimiter. The number is the list's
    // start plus the item's position in that CommonMark list; the numbers written
    // on later items are ignored by CommonMark and are not recorded.
    const ordered = list.listType === 'ordered'
    let ordinal = ordered ? list.listStart : null
    for (let li = list.firstChild; li; li = li.next) {
      // A definition inside the item before this one precedes it in document
      // order, so it is emitted before this item becomes the node L-3 sees.
      definitionsBefore(li.sourcepos[0][0])
      const item = node('item', '')
      if (ordered) {
        item.ordinal = ordinal++
        item.delimiter = list.listDelimiter
      }
      last = item
      let labelled = false
      for (let b = li.firstChild; b; b = b.next) {
        definitionsBefore(b.sourcepos[0][0])
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
        // L-3 — this item, or, after a list nested in this item, that list's
        // deepest last item
        last.content.push(block(b.type, sourceOf(b, lines)))
      }
      parent.children.push(item)
    }
    void inItem
  }

  for (let b = doc.firstChild; b; b = b.next) {
    definitionsBefore(b.sourcepos[0][0])
    if (b.type === 'heading') {
      // L-5 — a heading at or below the open section's level closes it
      while (open.length && open[open.length - 1].level >= b.level) open.pop()
      const section = node('section', labelOf(b, lines)) // L-2
      current().children.push(section)
      open.push({ level: b.level, node: section })
      last = section
    } else if (b.type === 'list') {
      items(b, current(), false)
    } else {
      // L-3 — every other block is content, attached to the nearest node
      // preceding it; content before any node attaches to the root
      ;(last ?? tree).content.push(block(b.type, sourceOf(b, lines)))
    }
  }
  definitionsBefore(Infinity) // a definition after every block

  return tree
}
