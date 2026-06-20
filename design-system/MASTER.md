# Survey App Design System

## Brand

- Primary: `#003B8E`
- Accent: `#D50000`
- Primary soft: `#EAF2FE`

## Typography (NativeWind)

- Display / H1–H3 / Body / Helper / Caption / Label — see `tailwind.config.js`

## Spacing

- 4px grid via `space(n) = n × 4`

## Touch targets

- Primary actions: 52px height
- Secondary: 44px minimum

## Motion

- Wizard stack: `slide_from_right`
- Respect `prefers-reduced-motion` for Reanimated transitions

## Survey UX

- One question per screen in `/wizard/flow`
- Progress: "Question X of Y" + percentage bar
- Local auto-save on every field change; debounced cloud sync when online
