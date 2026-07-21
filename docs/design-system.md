# Design system

BestScout uses HeroUI v3 exclusively for interactive UI primitives. Layout uses
Tailwind CSS 4 and HeroUI's CSS-first tokens.

## Direction

- Dark by default; no unstyled light flash during startup
- Dense desktop information architecture with accessible hit targets
- Neutral graphite surfaces and a restrained mint accent
- Colour is never the only carrier of state
- Tables prioritize scanning, keyboard navigation and configurable density

## Core tokens

| Token | Value | Purpose |
| --- | --- | --- |
| `--background` | `#080b10` | App canvas |
| `--surface` | `#10151d` | Primary panels |
| `--surface-secondary` | `#151b24` | Raised controls |
| `--accent` | `#73f2a7` | Selection and primary action |
| `--muted` | `#8995a5` | Secondary text |
| `--border` | `#242d3a` | Dividers and panel boundaries |

HeroUI v3 compound components are used as documented; v2 APIs and the former
JavaScript theme plugin are not allowed.
