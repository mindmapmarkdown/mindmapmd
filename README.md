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
| Lift — every example in the suite | **21 / 21** |
| Tree round-trip — project, lift back, compare | **21 / 21** |
| Byte identity, where the example is canonical | **17 / 17** |
| Idempotence — the second round-trip is byte-stable | **pass** |

**17 of the 21 examples are canonical**, so byte identity is tested on those
seventeen and nowhere else. The other four are deliberately non-canonical — a
setext heading, a hard break spelled with trailing spaces, a skipped heading
level, and a heading with no blank line after it — and exist to show that a
conforming document need not be a canonical one.

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

On this branch that includes S-7, proposed by
[RFC 0043](https://github.com/mindmapmarkdown/spec/pull/43): a tree whose
projection would lift to a different tree is rejected too. An item labelled
`1. Install` is one — its projection `- 1. Install` is an empty item holding a
numbered list. `1\. Install` is a different label, and a well-formed one.

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

**One place the specification decides and the decision is known to be wrong.**
`L-10` recognises front matter by position, so a document that opens with a
thematic break and carries a later one is swallowed whole and a heading inside it
stops being a node. This implementation reproduces that faithfully rather than
guarding against it, because a guard is a Normative change and belongs upstream:
[spec#35](https://github.com/mindmapmarkdown/spec/issues/35).

## Layout

| Path | |
|---|---|
| `src/lift.js` | §2.2, §2.3 — what becomes a node, and at what depth |
| `src/project.js` | §2.5 — canonical projection |
| `src/tree.js` | §2.6 — the encoding, E-7 equality, S-1/S-2/S-4 structure |
| `src/wellformed.js` | §2.4 — the structural rules plus S-7, and S-3's rejection |
| `test/conformance.test.js` | the suite, run against all of the above |
| `test/fixtures/examples.json` | generated from `spec.md`; **never hand-edited** |

---

Licensed under [Apache-2.0](LICENSE).
