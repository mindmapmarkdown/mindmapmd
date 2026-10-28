// The same two questions the sweep asks, put to real Markdown instead of
// generated Markdown.
//
//   node tools/corpus.mjs <dir> [<dir> ...]
//   node tools/corpus.mjs --list <dir>      also print every failing path
//
// A generator reaches shapes nobody writes; a corpus reaches shapes nobody
// would think to generate. Neither is a substitute for the other, and a rule
// measured only against one of them has been measured against half the
// question. RFC 0085 asked for this file by name so that the next proposal is
// measured against real documents before it is measured against invented ones.
//
// What it counts, per file:
//
//   refused      lift threw — the document is not a conforming document
//   ill-formed   lift produced a tree S-7 rejects (only where S-7 exists)
//   broke        the tree does not survive its own projection, or the second
//                projection is not byte-identical
//   no canon     the projection is not a canonical document: a line ends in
//                whitespace outside a code block, or the file does not end in
//                exactly one line feed (P-8)
//
// Licensed under Apache-2.0. See LICENSE.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { Parser } from 'commonmark'
import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal } from '../src/tree.js'

// S-7 lives in its own module and only on branches that have it (RFC 0043).
let problems = null
try {
  ;({ problems } = await import('../src/wellformed.js'))
} catch {
  // no S-7 here; the round trip is still checked
}

const LF = String.fromCharCode(10)
const TRAILING = new RegExp('[ ' + String.fromCharCode(9) + ']$')

/** P-8 on the projection. Code block lines come from the parser, not a guess. */
function breaksP8(out) {
  if (!out.length) return null
  if (!out.endsWith(LF)) return 'the document does not end in a line feed'
  if (out.endsWith(LF + LF)) return 'the document ends in more than one line feed'
  const exempt = new Set()
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.next) {
      if (c.type === 'code_block' && c.sourcepos) {
        for (let i = c.sourcepos[0][0]; i <= c.sourcepos[1][0]; i++) exempt.add(i)
      }
      walk(c)
    }
  }
  walk(new Parser().parse(out))
  const lines = out.slice(0, -1).split(LF)
  for (let i = 0; i < lines.length; i++) {
    if (!exempt.has(i + 1) && TRAILING.test(lines[i])) return 'a line ends in whitespace'
  }
  return null
}

/** Every `.md` file under `dir`, `.git` excluded and `node_modules` kept. */
function markdownUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue
    const path = join(dir, name)
    let s
    try {
      s = statSync(path)
    } catch {
      continue // a broken link, or a path too long for this platform
    }
    if (s.isDirectory()) markdownUnder(path, out)
    else if (name.toLowerCase().endsWith('.md')) out.push(path)
  }
  return out
}

/** What is wrong with one file, or null. */
function verdict(md) {
  let tree
  try {
    tree = lift(md)
  } catch (e) {
    return { kind: 'refused', why: e.message.split(LF)[0] }
  }
  if (problems) {
    const found = problems(tree)
    if (found.length) return { kind: 'ill-formed', why: found[0] }
  }
  let out
  try {
    out = project(tree)
  } catch (e) {
    return { kind: 'broke', why: `project threw — ${e.message.split(LF)[0]}` }
  }
  const p8 = breaksP8(out)
  if (p8) return { kind: 'no canon', why: `P-8: ${p8}` }
  let back
  try {
    back = lift(out)
  } catch (e) {
    return { kind: 'broke', why: `the projection is not conforming — ${e.message.split(LF)[0]}` }
  }
  if (!equal(back, tree)) return { kind: 'broke', why: 'the projection lifts to a different tree' }
  if (project(back) !== out) return { kind: 'broke', why: 'the second projection is not byte-identical' }
  return null
}

const args = process.argv.slice(2)
const list = args.includes('--list')
const dirs = args.filter((a) => a !== '--list').map((a) => resolve(a))
if (!dirs.length) {
  console.error('usage: node tools/corpus.mjs <dir> [<dir> ...] [--list]')
  process.exit(2)
}

const counts = { refused: 0, 'ill-formed': 0, broke: 0, 'no canon': 0 }
const failures = []
let files = 0
let bytes = 0

for (const dir of dirs) {
  for (const path of markdownUnder(dir)) {
    let md
    try {
      md = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    files++
    bytes += md.length
    // A file that does not end in a line feed is not about any rule here; the
    // last line is completed so that the question asked is the document's.
    const bad = verdict(md.endsWith(LF) || !md.length ? md : md + LF)
    if (!bad) continue
    counts[bad.kind]++
    failures.push({ path: relative(process.cwd(), path), ...bad })
  }
}

const pct = (n) => (files ? ((n / files) * 100).toFixed(1) : '0.0')
console.log(
  `${files} files · ${(bytes / 1e6).toFixed(1)} MB · ` +
    `${counts.refused} refused · ${counts['ill-formed']} ill-formed · ` +
    `${counts['no canon']} with no canonical projection · ${counts.broke} failed the round trip`,
)
console.log(`S-7: ${problems ? 'active' : 'not in this build'}`)

const byWhy = new Map()
for (const f of failures) {
  const key = `${f.kind}: ${f.why.slice(0, 120)}`
  byWhy.set(key, (byWhy.get(key) ?? 0) + 1)
}
for (const [why, n] of [...byWhy].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}×  ${why}`)
}
if (failures.length) console.log(`  ${pct(failures.length)}% of the corpus`)
if (list) for (const f of failures) console.log(`    ${f.kind.padEnd(10)} ${f.path}`)
