# Qualitative AI Studio: design guidelines

## Product and purpose

The studio supports study-scoped protocols, personas, interview guides, human transcripts, AI simulations, and comparative analysis. Its audience is qualitative researchers assessing AI as a methodological instrument. Human interviews remain the evidence for lived experience; synthetic interviews are explicitly labeled. The core journey is prepare materials, simulate an interview, compare it with a human transcript, then interpret the evidence.

The application is FastAPI with buildless HTML, a shared JavaScript module, and one stylesheet. Supabase authentication, storage, API routes, and model calls are separate from presentation. Preserve existing form names, IDs, route contracts, ownership boundaries, and event cleanup when editing.

## Identity: the research notebook

A compact index and an open reading surface should feel like a working research instrument. The method, not a decorative mockup, supplies the visual identity. The four comparison lenses are Catch, Miss, Strengths, and Weaknesses. Use them in context rather than as generic feature tiles.

The `q.` typographic mark identifies the studio without a decorative AI sparkle. Do not add glowing effects, hero gradients, invented quotes, simulated product data on public pages, customer logos, testimonials, or unsupported counts. Do not imply institutional endorsement, clinical validity, or privacy guarantees beyond actual implementation.

## Typography

- Reading/display: Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif. Use it for page headings, evidence excerpts, and comparison lens names.
- Controls/body: the system sans-serif stack (-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif). No font download is required.
- Body: 16px, line-height 1.6–1.8. Long prose: about 65 characters per line.
- Page headings: 32–46px; public introduction: 48–70px; mobile introduction: 48px. Avoid forcing line breaks in task headings.
- Section headings: 25–32px; controls: 14–16px; secondary metadata: 12–13px. Uppercase is reserved for short indexing labels.
- Use regular serif weight and medium sans-serif weight. Do not make every heading heavy bold.

## Color and semantics

| Token | Value | Purpose |
| --- | --- | --- |
| Background | `#faf9f6` | Open notebook surface |
| Sidebar | `#efeee8` | Material index |
| Text | `#252722` | Primary reading text |
| Secondary | `#62655d` | Supporting explanations |
| Accent | `#963f2d` | Primary actions, current workflow, links |
| Strong accent | `#753020` | Hovered primary action |
| Rule | `#d9d8d0` | Section and row separation |
| Input boundary | `#92958a` | Visible editable control edges |
| Human evidence / success | `#365e49` | Human source column and positive status |
| Error | `#9a302d` | Error border and message, also identified by text |

Do not depend on color alone. Active links also have weight, an edge/rule, and `aria-current`. Error messages use an alert role. A source label always identifies human vs. synthetic evidence.

## Grid and spacing

Use 4, 8, 12, 16, 20, 24, 32, 40, 56, and 72px as the working spacing scale. Desktop app navigation is 220px wide; the study bar is 76px tall. Keep a consistent content inset of 40px on desktop and 20px on mobile.

Public pages use a publication-style masthead, an asymmetric introduction, and a comparison register. Authenticated pages use a material index, compact study context, and an unobstructed task surface. On the dashboard, list actual material counts in rows and show one primary next action. Do not repeat active-study and next-action panels in multiple locations.

Use rules and proximity before boxes. Separate independent editing and source areas with a two-column layout where there is room. At tablet widths, stack task columns; retain sidebar navigation. At 720px and below, use an explicit Navigation button, a disclosure of all destinations, and a persistent study selector. Avoid a permanently expanded mobile menu that consumes the initial screen.

## Components

- Radius: 2–3px on inputs, buttons, and selected rows. Use a circle only for the account initial.
- Shadows: none for ordinary content. A restrained shadow is permitted for the floating consent notice.
- Buttons: at least 44px tall for primary actions. Text links are appropriate for opening material rows.
- Inputs: white, clearly bounded, labeled, at least 16px text on mobile. File controls retain native behavior.
- Empty states: name the missing material and offer its relevant next action. Never fill empty states with fabricated content.
- Reports: distinguish human and AI source columns, then show interpretation and researcher notes. Notes currently persist only in the browser; say so.
- Forms: announce loading and completion with `role=status`; errors with `role=alert`. Disable an in-progress action and restore it on completion.
- Public navigation: method and account access; no empty guest avatar, study selector, or protected sidebar.

## Interaction and accessibility

Use native links, buttons, forms, disclosures, and validation. Preserve visible focus outlines with sufficient separation. Provide a skip link. The mobile Navigation button exposes `aria-expanded` and controls the real navigation. All destinations remain accessible after resize. Respect reduced motion. Limit motion to loading feedback and brief color changes; no card spotlight, entrance cascade, parallax, or scroll-triggered decoration.

Target WCAG 2.2 AA. Check text contrast, editable boundaries, accessible names, headings, keyboard order, error announcements, zoom/overflow, and target sizes. Automated checks do not establish full compliance.

## Design references reviewed

These references inform principles, not copied layouts or assets:

- [Dovetail](https://dovetail.com/): organize around research material and the path from evidence to interpretation; do not borrow its marketing claims.
- [ATLAS.ti](https://atlasti.com/): make document analysis and researcher intent explicit; use recognizable research vocabulary.
- [Are.na](https://www.are.na/): treat collection and organization as the product, and let content dominate presentation.
- [Linear](https://linear.app/): compact navigation and concrete workflow objects make dense tools legible. Its dark styling and AI imagery are not this studio's identity.
- [Nielsen Norman Group: visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): use scale, contrast, and grouping to establish reading order instead of wrapping everything in equal cards.

## Future-change checklist

1. Is the main task clear before any marketing message?
2. Is every displayed count backed by actual records?
3. Is human evidence clearly distinct from synthetic output?
4. Can a rule or spacing replace this proposed container?
5. Is study scope visible and preserved through navigation?
6. Does this work at 375px, 768px, and 1440px, with keyboard focus visible?
7. Did a CSS edit introduce another competing visual layer? Update this single system rather than appending a new theme.
8. Have form submission, account modes, empty states, loading, and failure feedback been preserved?
