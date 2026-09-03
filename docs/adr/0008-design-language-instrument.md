# ADR-0008 — The Instrument design language

**Date** 2026-09-01 · **Status** Accepted

## Context

Nextly has no brand. The explicit requirement was that the result must not look
vibe-coded or AI-boilerplated.

The supplied reference was a five-colour palette: deep navy `#125488` through
cyan `#37CAEC` to teal `#3DD9D6`.

## Decision

A dense, technical, near-monochrome language called **Instrument**.

1. **Neutrals are tinted to hue 207°**, the hue of `#125488`. Not grey. This is
   the highest-leverage decision in the system: grey chrome reads as a default,
   while a consistently tinted ramp reads as designed even to someone who could
   not say why.
2. **The five palette colours are reserved for data visualisation.** Charts
   carry all the colour; chrome carries none.
3. **One accent** (`#37CAEC`, darkened in light mode for contrast) for the
   primary button, the active nav rule, focus rings and links.
4. **Instrument Sans and JetBrains Mono.** Inter and Geist are excellent
   typefaces and are the visual signature of a generated dashboard; a reader
   recognises the default before reading a word.
5. **Every number is tabular monospace.** Columns align on the decimal, and an
   outlier is physically wider, so it is seen before it is read.
6. **Small radii** (2 / 6 / 10px) and **one elevation step**, with borders doing
   the work. A soft shadow in light mode; a 1px inner top highlight in dark,
   because shadows are invisible against near-black and only add mud.
7. **Both themes are designed, not inverted.** Saturation and lightness are
   tuned per theme.

## Consequences

- `src/styles/tokens.css` is the only place a colour is defined.
- `<Money>` is the only way an amount reaches the screen.
- `/design-system` renders every token and primitive in both themes and is
  reachable in every environment.
- The wordmark is a deliberately provisional type lockup plus a signal glyph. A
  generated logo would have been the fastest possible route to looking
  templated, and this is one file to delete when real identity work happens.

## Rejected

An **Editorial** direction (serif display numerals, generous whitespace) —
beautiful, and wrong for a screen whose job is to show a whole stock position
without scrolling.
