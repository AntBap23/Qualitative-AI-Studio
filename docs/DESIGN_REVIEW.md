# Research notebook redesign: audit and validation

## Original design audit

| Issue | Effect | Implemented response |
| --- | --- | --- |
| Purple accent, sparkle mark, repeated rounded cards | An interchangeable startup interface | Typographic q. mark, warm white/charcoal/rust palette, ruled material registers |
| Invented example interview quotes | Could be mistaken for participant evidence despite an example label | Removed the public mock transcript; explain the real comparative method instead |
| Large app sidebar and guest account treatment on public pages | Research tools appear before the product is explained | Compact public masthead; authenticated sidebar only inside the desk |
| Repeated active study, next action, and status panels | Competing entry points and duplicated information | One active-study context, one next action, material counts in a compact index |
| Repetitive feature grid | Weak relationship to the research method | Asymmetric method register and a sequential prepare/simulate/interpret workflow |
| Multiple stacked CSS themes and unused pointer effects | Hard to maintain consistent identity | One replacement stylesheet and removed spotlight event registration |
| Weak mobile composition | Navigation dominated the opening screen | Accessible Navigation disclosure, persistent study selector, stacked task columns |
| Generic page slogans and raw JSON error details | Indirect task orientation and technical feedback | Specific task headings, human-readable API details, announced status/error messages |

## Product understanding

FastAPI serves thirteen static HTML pages and one shared browser module. No frontend build pipeline or framework is present. Supabase provides authentication; the server handles storage, uploads, AI calls, and study ownership. Frontend changes preserve API paths, form names, input names, and submission contracts. No backend, schema, auth policy, or model behavior changes are part of this redesign.

The audience is qualitative researchers comparing persona-conditioned AI interviews with human evidence. The core journey is study creation, protocol/material preparation, simulation, comparison, and researcher interpretation. The design expresses the four actual research lenses: Catch, Miss, Strengths, Weaknesses.

## Reference research

Five live references were retrieved and read before implementation. Their public structures and content informed principles, not copied branding or proprietary assets:

- [Dovetail](https://dovetail.com/): evidence and research-object orientation.
- [ATLAS.ti](https://atlasti.com/): researcher intent, source documents, recognizable analytic vocabulary.
- [Are.na](https://www.are.na/): content organization rather than ornamental presentation.
- [Linear](https://linear.app/): compact workflow navigation and concrete work objects.
- [NN/g visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): reading order through scale, contrast, and proximity.

The application itself was visually reviewed in the browser. Reference research used the retrieved live page content; it was not a systematic cross-device usability study of those products.

## Implemented direction

A research notebook: serif reading hierarchy, system sans-serif controls, open surfaces, narrow rules, restrained rust actions, and source columns for paired evidence. Native forms and explicit study scope remain central. See `../DESIGN_GUIDELINES.md` for tokens, typography, grid, component, motion, and responsive rules.

## Modified source files

- `frontend/app.js`
- `frontend/comparisons.html`
- `frontend/dashboard.html`
- `frontend/index.html`
- `frontend/interview-guide.html`
- `frontend/personas.html`
- `frontend/protocol.html`
- `frontend/settings.html`
- `frontend/sign-in.html`
- `frontend/simulations.html`
- `frontend/studies.html`
- `frontend/styles.css`
- `frontend/support.html`
- `frontend/transcripts.html`
- `frontend/workspace.html`
- `DESIGN_GUIDELINES.md` (new)
- `docs/DESIGN_REVIEW.md` (new)

All thirteen HTML pages have their cache version updated; several also have task-oriented copy, semantic structure, and layout changes. Existing `frontend/styles 2.css` is unused and was left alone.

## Validation performed

- Browser review of all thirteen major pages.
- 33 authenticated-page viewport checks across 375px, 768px, and 1440px; zero page overflow and one H1 per page.
- Six public homepage/sign-in viewport checks at the same widths; no page overflow.
- Desktop screenshots reviewed for dashboard, workspace, protocol, personas, guide, transcripts, simulations, comparisons, settings, and support; homepage/sign-in reviewed directly in browser.
- Mobile navigation opens/closes, exposes its state, and reveals destinations. Keyboard focus is visible. The skip link explicitly focuses the main content.
- Account-mode switching updates its heading, pressed state, password autocomplete, and minimum password length.
- A study was created and selected successfully in an isolated local preview.
- Populated comparison rendering and note persistence were checked with explicitly labeled synthetic UI fixtures stored only in a temporary local directory. These are not research findings and are not part of application source or production data.
- Comparison notes survived reload. Populated report did not overflow on mobile.
- JavaScript syntax: `node --check frontend/app.js` passed.
- HTML parsing: no duplicate IDs; exactly one main heading per page; form/input/select/textarea contracts match the prior version.
- CSS parses without syntax errors. The stylesheet decreased from 53,592 to approximately 33,329 bytes before the final small refinements. No new dependencies or remote font requests.
- Public pages/assets/health return 200 in FastAPI's test client. Unauthenticated protected page redirects (303) and API rejection (401) remain intact.
- Loading/error announcement and button restoration checks passed. No JavaScript console errors were observed in the browser review.
- Token contrast checks: body 14.33:1; secondary copy 5.64:1; white on primary button 6.89:1; input boundary 3.05:1; focus color against the page 6.55:1.

There is no project frontend lint/type/build setup; this is buildless HTML/CSS/JavaScript. Syntax, parse, browser, and HTTP checks are the applicable validation.

## Critical review and second refinement

The first pass still showed too much mobile navigation and a missing Support H1. Both were corrected. A skip-link keyboard check led to explicit main-content focus. Input borders were darkened to exceed 3:1, raw error JSON was replaced with readable API messages, and duplicate dashboard recommendations were removed. No decorative assets were introduced. Layout variety comes from the needs of evidence, forms, and indexes.

## Remaining limits

- WCAG 2.2 AA is the target, not a certification. Full screen-reader testing, browser/device coverage, and usability sessions with qualitative researchers remain future work.
- Supabase account sign-in and paid AI generation were not exercised in this frontend pass. Temporary local auth fixtures were used for protected-screen QA; production authentication is unchanged.
- No model output quality or privacy promises can be inferred from the visual redesign.
- Validation in this report was performed locally before publication. Consult GitHub history and Render deployment status for the published version.

## Review artifacts

- `outputs/studio-before.jpg`: before, showing the prior feature-card section.
- `outputs/studio-redesign.jpg`: prior iteration's opening screen.
- `outputs/studio-after.jpg`: final desktop homepage.
- `outputs/studio-mobile-after.jpg`: final mobile homepage.
- `outputs/desk-after.jpg`: simplified dashboard.
- `outputs/comparison-after.jpg`: populated report layout with synthetic QA fixtures.
