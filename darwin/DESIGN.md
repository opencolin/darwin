# Darwin — Design Brief

**STATUS: ESTABLISHED (2026-10-11).** Tokens live in `src/client/index.css`
(Tailwind v4 `@theme`). Keep this file and that file in sync.

## Aesthetic Direction: *the naturalist's ledger*

Darwin is a governance console for a self-improving agent harness: generations,
lineages, promotions and rollbacks, all recorded. The look is a 19th‑century
expedition field journal (the domain is `darwin.voyage`) crossed with a modern
instrument panel. Warm paper and ink, hairline rules, specimen-tag labels, a
single oceanic accent ("tide"), and monospace for anything the machine wrote:
traces, tool calls, diffs. The engineering is the ornament.

Why: it reads at projector distance (high contrast, big serif numerals), it is
*not* the dark neon dashboard every agent demo ships, and it carries the story
("evolution", "lineage", "voyage") without costume. Tone: calm, precise,
slightly literary. Nothing bounces; things *settle*.

Dark mode is "night watch": deep blue‑black paper with warm off‑white ink, for
the phone at night. Light is the default and the demo mode.

## Color Palette (`@theme` tokens → `bg-paper`, `text-ink`, `border-line` …)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-paper` | `#F3EDE1` | `#121619` | page background |
| `--color-surface` | `#FBF7EF` | `#1A2024` | cards, sheets |
| `--color-surface-2` | `#EDE5D5` | `#232B30` | wells, code blocks, inset rows |
| `--color-ink` | `#1E1B16` | `#ECE6D8` | primary text, solid buttons |
| `--color-ink-2` | `#5C554A` | `#B5AC9C` | secondary text |
| `--color-ink-3` | `#8A8275` | `#80786B` | labels, placeholders, tags |
| `--color-line` | `#D8CEBB` | `#2E3740` | hairlines, card borders |
| `--color-line-strong` | `#B9AD95` | `#45505A` | emphasized rules, focus halo base |
| `--color-tide` | `#0F6E73` | `#49B3B8` | accent: links, primary actions, running state |
| `--color-tide-ink` | `#0A4F53` | `#7FD0D3` | accent hover / pressed |
| `--color-tide-soft` | `#D7ECEC` | `#143538` | accent tint backgrounds, selection |
| `--color-promote` | `#2E6B3F` | `#6DBF7E` | promoted patch, PASS, `+` diff |
| `--color-promote-soft` | `#DCEBDD` | `#1C3323` | tints for the above |
| `--color-rollback` | `#A8472B` | `#E07A5A` | rolled back, FAIL, `−` diff, destructive |
| `--color-rollback-soft` | `#F2DCD3` | `#3B2219` | tints |
| `--color-pending` | `#A9731C` | `#D9A64A` | awaiting approval, `~` diff, frozen banner |
| `--color-pending-soft` | `#F4E6C9` | `#3A2E14` | tints |
| `--color-violation` | `#8F1D1D` | `#E36A6A` | safety violation (never softened to orange) |
| `--color-violation-soft` | `#F1D5D5` | `#3D1A1A` | tints |

Rules: one accent (tide) for interaction; the four semantic hues are *status
only* and never decorative. Violation is distinct from rollback on purpose: a
rollback is routine, a violation is the thing Darwin exists to prevent.
Theme switch: `<html data-theme="light|dark">` set by an inline script before
paint; absent attribute follows `prefers-color-scheme`.

## Typography (Google Fonts, imported at the top of `index.css`)

- **Display — Fraunces** (variable, `opsz` 9–144). Headings, generation
  numbers, scores, the wordmark. Use `font-display`; headings get
  `font-variation-settings: "opsz" 72` and `-0.01em` tracking from the base
  layer. Big numerals (scores) at 600 weight.
- **Body — Instrument Sans.** All UI text, `font-sans`. 400 body, 500 labels,
  600 buttons.
- **Mono — IBM Plex Mono.** Traces, tool calls, diffs, IDs, and the *specimen
  tag* (`.tag`: 11px, uppercase, `0.08em` tracking, `ink-3`). Use `font-mono`.
- Fallback stacks are real (Iowan Old Style / Georgia; Helvetica Neue /
  system-ui; Menlo) because venue Wi‑Fi can block font CDNs.
- Scale: body 15px/1.5 on phone, 16px desktop; h1 `text-4xl`–`text-6xl`; the
  score numeral up to `text-7xl`. Never center long text.

## Spacing & Radius

- 4px base (Tailwind scale), 8px rhythm. Page gutter 16px on phone, 24–32px
  desktop; content max‑width 72rem for the desktop view, 28rem for `/m`.
- Radii are tight (instrument, not bubble): `--radius-xs` 2px tags,
  `--radius-sm` 4px buttons/inputs, `--radius-md` 8px cards,
  `--radius-lg` 14px phone sheets/dialogs, `rounded-full` only for dots/avatars.
- Depth comes from 1px `line` borders and `surface` vs `paper`, not shadows.
  One shadow token, `--shadow-lift`, reserved for overlays and the sticky
  approval bar on the phone.
- Hairline rules (`.rule`) separate sections; section titles are a `.tag`
  above a `rule`, like a ledger heading.

## Signature Elements

1. **Gen tag** — `GEN 03` in mono uppercase inside a 2px‑radius chip with a
   `line` border; the active harness gets a `tide` chip, rolled‑back gets a
   hollow chip with a `rollback` strike-through.
2. **Score meter** — a Fraunces numeral (`72%`) with a hairline underneath and
   a delta (`+17`) in `promote`/`rollback`. Numbers animate with `animate-tick`
   when they change.
3. **Lineage** — a vertical hairline with one node per harness version (SVG
   stroke drawn with `animate-draw`); promoted nodes filled `tide`, rolled‑back
   hollow `rollback`, pending ringed `pending` with `animate-pulse-tide`.
4. **Diff ledger** — mono rows: `+` on `promote-soft`, `−` on `rollback-soft`,
   `~` on `pending-soft` (`.diff-add/.diff-del/.diff-mod`).
5. **Approval card (phone)** — rationale set in Fraunces italic like a quoted
   journal entry, diff ledger below, held‑out score before/after, then a sticky
   bar with **Promote** (solid `promote`) and **Reject** (outline `rollback`).
6. **Freeze** — a `pending-soft` banner with a `.tag` "HARNESS FROZEN" when
   the meta‑agent is locked out; the switch itself uses `tide` when live.

## Component library mapping (`src/client/components/ui/_shared`)

`variants.ts`: `solid/neutral` = `bg-ink text-paper`; `primary` = `tide`;
`destructive` = `rollback`; `soft` = the matching `*-soft` tint; `outline`
uses `border-line-strong`. Focus ring: 2px `tide` offset on `paper`. Retune
those maps rather than styling controls individually.

## Motion & Animation (`--animate-*`)

- `animate-fade-in` 240ms — overlays, tab panels.
- `animate-rise` 320ms — cards and rows entering; `.stagger` adds
  `calc(var(--i) * 60ms)` delay, set `style={{ "--i": index }}`.
- `animate-pulse-tide` 1.6s loop — the "generation running" dot and the pending
  lineage node. The only looping animation on screen.
- `animate-tick` 480ms — a number that changed (score, pass count).
- `animate-draw` 900ms — SVG lineage stroke (`stroke-dasharray: 1; pathLength=1`).
- Hover/press: 120ms `transition-colors`; no scale transforms on buttons.
- `prefers-reduced-motion` disables all of the above (base layer).
