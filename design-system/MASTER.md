# Survey App Design System

## Brand

- Primary: `#003B8E`
- Accent: `#D50000`
- Primary soft: `#EAF2FE`
- Success: `#16A34A` · Warning: `#D97706` · Danger: `#DC2626`

## Typography (NativeWind)

- Display / H1–H3 / Body / Helper / Caption / Label — see `tailwind.config.js`
- Field forms: `text-body` for inputs, `text-caption` for helpers
- Admin tables/lists: `text-[13px]` primary, `text-caption` secondary

## Spacing & layout

- 4px grid via `space(n) = n × 4`
- Screen padding: `14px` horizontal
- Card radius: `rounded-xl` (12px) field · `rounded-2xl` (16px) admin
- Card elevation: `border border-line-subtle shadow-sm`

## Touch targets

- Primary actions: 52px height (`size="lg"`)
- Secondary: 44px minimum
- Step chips: min 44px wide

## Status semantics

| Status    | Tone    | Usage               |
| --------- | ------- | ------------------- |
| draft     | warning | In-progress surveys |
| submitted | info    | Awaiting QC         |
| approved  | success | Locked records      |
| rejected  | danger  | Needs revision      |

## Motion

- Wizard stack: `slide_from_right`
- Press feedback: `active:opacity-90` (no layout shift)
- Respect `prefers-reduced-motion` for Reanimated transitions

## Survey UX

- One question per screen in `/wizard/flow`
- Progress: step indicator + "Question X of Y" bar
- Local auto-save on every field change; debounced cloud sync on all wizard steps when district+ULB set
- Locked future wizard steps until prior steps complete

## Anti-patterns (avoid)

- Emoji as icons — use Ionicons only
- Light-mode body text below `#475569` contrast
- Invisible borders in light mode
- Scale transforms on press that shift layout

## Stack

- React Native + Expo + NativeWind
- Copy-own primitives in `src/components/ui/primitives.tsx` (21st.dev-style)
