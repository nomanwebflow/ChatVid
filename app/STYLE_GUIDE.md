# ChatVid — UI Style Guide

The editor UI runs on a **design-token system** (CSS custom properties), not a
component framework. All tokens live at `:root` in `src/editor.css` and are the
single source of truth — components reference tokens, never raw values. This is
the same CSS-variable method shadcn/ui uses, without pulling Tailwind into an
app that is otherwise hand-written CSS.

Icons: [`lucide-react`](https://lucide.dev), one stroke weight (`1.9`) across the
whole editor chrome (`svg.lucide { stroke-width:1.9 }`).

## Color

Two ramps plus state colors. Components use the **semantic aliases**, not the
ramp steps directly.

### Neutral (warm green-grey)
| Token | Hex | Use |
|---|---|---|
| `--n-0` | `#ffffff` | surfaces, controls |
| `--n-25` | `#f8faf7` | subtle row hover |
| `--n-50` | `#f4f6f1` | app background |
| `--n-100` | `#eef1ec` | faint fills, tracks, dividers |
| `--n-150` | `#e4e8e2` | borders |
| `--n-200` | `#d9e0d9` | strong border, icon hover |
| `--n-400` | `#8a948c` | muted icons |
| `--n-500` | `#55605a` | secondary text |
| `--n-900` | `#141a17` | primary text / ink |

### Brand (green)
| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#eaf4ee` | selected row, chips |
| `--brand-100` | `#cfe6d8` | soft borders |
| `--brand-500` | `#1f7a4d` | primary accent, buttons |
| `--brand-600` | `#1a6a43` | accent hover |
| `--brand-900` | `#0c3a24` | accent ink |

### State
`--danger-500 #b4443a` / `--danger-50 #f6ded9` · `--warn-fg #9a5a12` / `--warn-bg #fdf3ec`

### Semantic aliases (use these in components)
`--ink` `--ink-2` · `--line` `--line-2` · `--surface` `--bg` ·
`--accent` `--accent-hover` `--accent-ink` `--accent-soft` `--accent-soft-border` ·
`--danger` `--chip` `--focus`

## Spacing — 4px base scale
`--sp-1 4` · `--sp-2 8` · `--sp-3 12` · `--sp-4 16` · `--sp-5 20` · `--sp-6 24` · `--sp-8 32` · `--sp-10 40`

## Type scale
| Token | px | Use |
|---|---|---|
| `--fs-xs` | 11 | uppercase labels, meta |
| `--fs-sm` | 12 | captions, chips, timeline |
| `--fs-base` | 13 | body, form controls |
| `--fs-md` | 15 | brand wordmark, emphasis |
| `--fs-lg` | 16 | dialog titles |

Weights: `--fw-medium 600`, `--fw-bold 700`. Line height: `--lh-tight 1.2`, `--lh-base 1.4`.
Fonts: `--font-sans` (system UI stack), `--font-mono` (code/CSS fields).

## Radius
`--r-xs 6` · `--r-sm 7` · `--r-md 9` · `--r-lg 12` · `--r-xl 16` · `--r-pill 999`

## Elevation
`--sh-1` hairline · `--sh-2` popover · `--sh-pop` floating menu · `--sh-modal` dialog

## Motion
`--ease` = `.12s ease` for hover/press transitions.

## Patterns
- **Buttons**: `.tb-btn` (default / `.primary`), 34px tall, `--r-md`, icon+label centered.
- **Icon buttons**: `.icon-btn` 28px square, `.danger` variant for destructive.
- **Inputs**: `.field` wraps an uppercase `label` + control; 2px `--focus` ring on focus.
- **Switch**: `.switch` / `.switch.on` — 42×24 pill.
- **Dialogs**: `.scrim` + `.dialog`, `--sh-modal`, `--r-xl`.

When adding UI: pick the nearest token, never a new raw value. If none fits, add a
token here first, then use it.
