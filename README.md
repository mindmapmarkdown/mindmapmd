# mindmapmd

The reference implementation of [Mindmap Markdown](https://github.com/mindmapmarkdown/spec) —
**lift** (a document determines one tree) and **canonical projection** (a tree
determines one document).

> **⚠ Nothing is released.** The specification is a Draft with no version number,
> and so is this. It tracks `spec.md` at a recorded commit rather than a tag,
> because there is no tag yet — see [`test/fixtures/EXAMPLES_FROM.txt`](test/fixtures/EXAMPLES_FROM.txt).

## What it claims

| Level | | |
|---|---|---|
| **L0** | Read | A property of documents, not of software — every Markdown tool satisfies it |
| **L1** | Structure | **implemented** — lift, canonical projection, mutually inverse |
| **L2** | Round-trip | not implemented. Diff, merge, and subtree exchange need node matching, and the rules for it are not written |

An L1 claim names a release as well as a level
([`VERSIONING.md` §4](https://github.com/mindmapmarkdown/spec/blob/main/VERSIONING.md)).
**This one names a commit, so it is not yet a claim** — it is a demonstration
that the specification is implementable.

## Conformance

```
node --test test/*.test.js
```

| | |
|---|---|
| Lift — every example in the suite | **18 / 18** |
| Tree round-trip — project, lift back, compare | **18 / 18** |
| Byte identity, where the example is canonical | **7 / 7** |
| Idempotence — the second round-trip is byte-stable | **pass** |

**Only 7 of the 18 examples are canonical**, so byte identity is tested on those
seven and nowhere else. Three of the other eleven are deliberately non-canonical
— a setext heading, a hard break spelled with trailing spaces, a skipped heading
level — and exist to show that a conforming document need not be a canonical one.
The remaining eight are non-canonical for one incidental reason: **no blank line
after a heading**, which P-7 requires. Filed upstream.

## Usage

```js
import { lift, project } from 'mindmapmd'

const tree = lift('# Install\n\nNode.js 20 or later.\n')
// { content: [], children: [ { kind: 'section', label: 'Install', … } ] }

project(tree) // → '# Install\n\nNode.js 20 or later.\n'
```

`lift` throws on a document that is not conforming. `project` throws on a tree
that is not well-formed, and never coerces the offending nodes to `item` — S-3
requires refusal, because silent coercion produces a document that lifts to a
*different* tree from the one projected.

## Design

**CommonMark is not reimplemented.** §1.5.1 layers the specification on
CommonMark and does not modify it, so block structure comes from
[commonmark.js](https://github.com/commonmark/commonmark.js) — the reference
parser — and the rules of Chapter 2 run over its output. That is the only
runtime dependency, and it is a deliberate one: an implementation that parsed
Markdown itself would be testing its own parser rather than the specification.

**Three places the specification does not yet decide**, and what this
implementation does in the meantime:

| | What it does | Upstream |
|---|---|---|
| An indented code block's `source` carries no fence, and P-5 requires fenced output | Fences it at projection — the only reading that satisfies P-5 | [spec#19](https://github.com/mindmapmarkdown/spec/issues/19) |
| A heading inside a list item would lift to a section under an item, which S-1 forbids | Throws, naming §2.4 — the document is not conforming, and lift is defined over conforming documents | — |
| L-9 normalises a hard break spelled with trailing spaces; a code block's trailing spaces are not a break | Normalises only where inline content lives — paragraphs, headings, block quotes | — |

Each is a position taken to make the code run, not a reading the specification
endorses. Where one turns out to be wrong, the fix is upstream first.

## Layout

| Path | |
|---|---|
| `src/lift.js` | §2.2, §2.3 — what becomes a node, and at what depth |
| `src/project.js` | §2.5 — canonical projection |
| `src/tree.js` | §2.6 — the encoding, E-7 equality, S-1/S-2 well-formedness |
| `test/conformance.test.js` | the suite, run against all of the above |
| `test/fixtures/examples.json` | generated from `spec.md`; **never hand-edited** |

---

Licensed under [Apache-2.0](LICENSE).
