// mindmapmd#17 — a block that shares the marker's line must not record the
// marker, and RFC 0072 (spec#72) is what makes that reachable.
//
// Before RFC 0072 a content block never began on a list marker's line: the
// first block of an item was its label. Under Part 1 a non-paragraph first
// block is content, so it does, and `linesOf`'s test for a stale column —
// "anything but whitespace to the left" — put the marker inside the block.
//
// The fix asks the parser which items actually open on that line, at which
// columns. Matching anything marker-shaped was tried on 2026-10-07 and was
// worse, because a column left behind by a link reference definition can land
// on text that begins with a marker-like character.
//
// Licensed under Apache-2.0. See LICENSE.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lift } from '../src/lift.js'
import { project } from '../src/project.js'
import { equal, stringify } from '../src/tree.js'

const F = '`'.repeat(3)
const entry = (md) => lift(md).children[0].content[0]
const roundTrips = (md) => {
  const t = lift(md)
  const out = project(t)
  const back = lift(out)
  assert.ok(equal(back, t), `projected:\n${out}\nlifted back to ${stringify(back)}`)
  assert.equal(project(back), out, 'the second projection is not byte-stable')
  return out
}

test('#17 · a thematic break on the marker line', () => {
  assert.deepEqual([entry('- ***\n').block, entry('- ***\n').source], ['thematic_break', '***'])
  roundTrips('- ***\n')
  assert.deepEqual([entry('1) ---\n').block, entry('1) ---\n').source], ['thematic_break', '---'])
  roundTrips('1) ---\n')
})

test('#17 · a block quote on the marker line, over one line and two', () => {
  assert.equal(entry('- >\n').source, '>')
  assert.equal(entry('- > q\n  > r\n').source, '> q\n> r')
  roundTrips('- >\n')
  roundTrips('- > q\n  > r\n')
})

test('#17 · an HTML block on the marker line', () => {
  assert.equal(entry('- <a>\n').source, '<a>')
  roundTrips('- <a>\n')
})

test('#17 · a fenced block on the marker line, which never had the defect', () => {
  // codeSourceOf does not go through linesOf, so this one round-tripped
  // already. Pinned so that a later change to either path cannot break it
  // quietly.
  assert.equal(entry('- ' + F + '\n  x\n  ' + F + '\n').source, F + '\nx\n' + F)
  roundTrips('- ' + F + '\n  x\n  ' + F + '\n')
})

test('#17 · the stale-column cases the fix must not break', () => {
  // These are why the marker-shaped test was rejected: the column a definition
  // leaves behind lands on a line whose own text starts at column 1.
  assert.equal(lift('[x]: /x\n  para\n').content[1].source, 'para')
  assert.equal(lift('  [x]: /x\nabcd\n').content[1].source, 'abcd')
  roundTrips('[x]: /x\n  para\n')
})
