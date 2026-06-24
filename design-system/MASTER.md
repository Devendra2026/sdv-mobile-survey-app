# Survey App Design System

Government field-survey mobile app — professional, accessible, high-contrast.

## Colors

| Token                        | Value                 | Use                            |
| ---------------------------- | --------------------- | ------------------------------ |
| brand                        | `#003B8E`             | Headers, primary actions       |
| brand-soft                   | `#E6EBF4`             | Selected rows, chips           |
| page-light / page-dark       | `#F5F7FA` / `#0F172A` | Screen backgrounds             |
| surface-light / surface-dark | `#FFFFFF` / `#1E293B` | Cards, modals                  |
| success                      | `#16A34A`             | Complete steps, sync indicator |
| warning                      | `#F59E0B`             | In-progress steps              |
| danger                       | `#DC2626`             | Errors, QC rejected            |

## Typography

- Display / H1 / H2 for screen titles (500 weight)
- Body 15px for form labels and inputs
- Caption / helper 11–12px for hints and metadata
- Label 11px uppercase for section headers

## Touch targets

- Minimum 44px height for buttons and chips (`touch-sm` / `touch-md` / `touch`)
- Wizard footer: primary Next action gets flex priority

## Wizard UX patterns

1. Progress bar + "Step X of 9" with tappable step sheet — **all steps freely navigable**
2. Step chips: completed (checkmark), in-progress (warning dot); never lock steps during collection
3. Cloud sync: "Save draft" → "Update cloud" after first sync; green cloud-done badge in footer
4. Photos: auto-sync draft when online before capture
5. Scroll: form content uses `wizardScrollContentStyle` (no `flexGrow: 1`); 140px bottom padding clears save bar + keyboard

## Anti-patterns

- Do not use `flexGrow: 1` on wizard ScrollView content — it blocks vertical scrolling
- Do not block step navigation during field collection — validate only on Next/Submit
