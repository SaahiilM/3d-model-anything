# Optional Vastu review — proposed plan

Status: apartment analysis remains a design proposal. The local browser inspector has an optional, customizable room-only exploratory overlay and copyable context; neither establishes an apartment center or produces compliance verdicts. The current preview is browser-scoped. Native iPhone support is future work.

## Purpose and boundaries

Help compare rentals against explicitly chosen traditional Vastu preferences. Directional measurements and geometry are facts with uncertainty; interpretations are traditional preferences, not scientifically established predictions about health, wealth or luck. Do not generate a universal compliance percentage.

Vastu review defaults off on each opening. Direction capture is separately optional and defaults off on every capture session. Reviewing a saved scan never starts sensors. Ordinary capture, exports and viewing remain usable without Vastu. Do not silently upload scans or call an external agent.

## Research findings

Eight 45-degree radial sectors, a 3×3 nine-cell grid and more detailed mandalas are different constructions. Do not present them as interchangeable. Let the user choose radial sectors or a grid for the exploratory view and retain that selection in its copyable context. A 3×3 grid has three rows and columns; radial mode has eight 45° wedges clockwise from north, centered at 0° with boundaries at ±22.5°. Do not require or silently switch to radial mode when the user chooses a grid. A Brahmasthan is a central area defined by a chosen grid convention, not simply the center point or an arbitrary circle.

There is no universally agreed irregular-plan center. Offer polygon centroid and north-aligned bounds midpoint as geometric choices, plus a manually movable center. Preserve the original suggested center separately from the current center so the user can compare or reset after moving it. Never call a geometric default the authoritative Vastu center. Show the selected method and center, and compare whether findings change. A centroid can fall outside a concave footprint: require boundary/center review in that case. Define balcony, terrace, shaft and common-area inclusion explicitly before calculating anything.

Use the private apartment boundary and entrance, distinguishing the apartment door from the building gate. Record both entrance location relative to apartment center and outward door-facing bearing; these are different quantities. Room-level subanalysis must identify its separate center and must not replace whole-apartment placement.

Common assessment subjects include kitchen placement (often SE, with NW accepted by some modern practitioners), prayer area (often NE), bedroom use (often SW for the principal bedroom), toilet placement and central obstructions. Rules vary by school, particularly modern bathroom applications. Each enabled rule needs its own source, scope, accepted alternatives and interpretation; these are candidate rules pending a reviewed rule catalog, not a normative standard.

Primary-text check (2026-10-29): [Bṛhat Saṃhitā, chapter 53, N. Chidambaram Iyer translation (1884)](https://www.wisdomlib.org/hinduism/book/brihat-samhita/d/doc229297.html). Verse 42 describes an 81-square site grid; verses 46–47 assign nine central cells to Brahmā; verse 71 discusses entrance locations within the 81/64-square schemes. Verse 118 places worship in NE and kitchen in SE, with storage uses in SW/NW. This supports keeping a center region and entrance-position analysis distinct from an eight-sector facing label. It does not establish polygon centroid as the traditional irregular-apartment center or justify attributing a modern SW-bedroom rule to verse 118. Contemporary interpretation of apartments needs explicit attribution.

Contemporary practitioner explanations consulted 2026-10-29 (not independent validation):
- https://www.memberofarchitecture.com/blog/6ad269a1addce747b85e-vastu-directions-16-zones-explained — angular divisions, distinction from square mandalas and varying center conventions.
- https://vaastuworld.org/vastu/tips/vastu-for-flats-apartments — private dwelling boundary, entrance distinctions, fixed-service constraints, classical versus modern rule attribution.
- https://www.aparnaenterprisesltd.com/blog/vastu/vastu-for-flats-apartments/ — contemporary apartment checklist and variation in bathroom recommendations.

## Proposed experience

1. Open a saved apartment; optionally enable Vastu review.
2. Confirm scope: complete apartment or partial room scan. Whole-apartment findings require a coherent placement of all rooms, including corridors. Separate unaligned sessions cannot establish the full footprint.
3. Confirm north source (true/magnetic/manual), uncertainty and any independent verification. With aligned compass data, the user may adjust recorded north by a clockwise angle; without it, the user may enter an absolute angle clockwise from model -Z (0° points to -Z). Preserve the recorded sensor estimate and uncertainty unchanged; label an absolute manual bearing as user-defined and unverified.
4. Trace or correct the apartment polygon; identify excluded common areas and included balconies. Show missing or uncertain portions rather than filling them silently.
5. Choose the exploratory overlay: eight radial sectors or a grid. For grid mode, expose row/column dimensions (3×3 for the current preview) and keep its central cell/region distinct from radial wedges and 64/81-cell mandalas. Let the user review and move the center, showing its method, original suggested location and current location. Display preferences such as center marker, labels and opacity affect presentation only.
6. Confirm room uses and mark private entrance, toilet versus bathing area, hob/cooking direction, bed head direction and prayer feature where relevant. Scanned object recognition supplies suggestions requiring confirmation.
7. Display feature overlap across sectors (e.g. kitchen 60% E, 40% SE), not only the centroid sector. Keep feature location and facing direction separate. Let users select a room while retaining the apartment-center overlay.
8. Show sourced findings as matches preference / conflicts with preference / uncertain / missing information. Separate fixed rental constraints from movable furniture options. No unsupported outcome predictions or demolition recommendations.
9. Copy analysis context and optionally export annotated plan plus JSON. Preserve the selected method, center method, original suggested and current center, grid dimensions, recorded versus overridden north, and visual preferences. Instruct any receiving agent to respect the selected method and distinguish a 3×3 grid from eight 45° wedges; do not always demand radial sectors. Keep original scan/compass data intact alongside optional view settings. Copying is explicit, local, and does not send information to any agent automatically.

## Uncertainty policy

Current reconstruction uses maximum retained sensor heading error plus maximum angular spread. The recorded example has 10° sensor error + about 9.5° spread = 19.5°, displayed rounded up as ±20°. This is a conservative heuristic, not a calibrated statistical confidence interval. Averaging cannot remove a shared magnetic bias. Tightening the acceptance threshold rejects data; it does not improve the measurement.

Proposed strict review profile: require estimated combined error <=10° for definitive directional findings, with 5° as a capture target rather than a promise. Existing scans remain visible with their honest error. For each feature, rotate north through its uncertainty interval and recompute sector intersections. Any affected sector assignment is ambiguous. Include boundary and center alternatives as separate sensitivity checks. Sector width is 45°: ±20° can materially change an assignment, especially near boundaries. Do not use 16 zones by default; they are only 22.5° wide.

Improvement procedure: remove magnetic accessories, avoid metal/electrical equipment, follow iOS calibration guidance if shown, collect stable repeated observations at separated positions and phone tilts, compare with an independent verified bearing. Report disagreements rather than selecting the most favorable reading. More samples alone do not establish absolute accuracy.

## Data and implementation sequence

Add optional versioned `vastuReview` metadata alongside existing scan data: scope/completeness, apartment polygon with holes and inclusion decisions, coordinate frame/units, room transforms, sensor and overridden north with provenance, selected exploratory method, center method, original suggested and current center, grid dimensions, display settings, sector definition, confirmed feature polygons/points/orientations, chosen sourced rule profile, uncertainty and missing fields. Keep original scan and sensor observations unchanged.

Phase 1 (browser preview): configurable exploratory grid/radial overlay, editable center and explicit center alternatives, recorded/manual north selection, and visual settings over the measured room polygon; no automatic verdicts. This room-only preview is not apartment analysis.
Phase 1 (future native viewer): port the optional controls and overlay after the browser interaction and settings shape are established.
Phase 2: confirmed room/fixture semantics, overlap calculations, uncertainty sensitivity, copyable context.
Phase 3: versioned sourced rule profiles and rental comparison. Add optional 3D sector overlay after the plan workflow is clear.

Validation when implementing: rectangles and concave plans; polygon holes; centroid outside footprint; room transforms and rotated north; grid dimensions and grid/radial distinction; 359°/0° wrap; features crossing sector boundaries; ±error crossing boundaries; incomplete/unaligned apartments; absent compass with user-defined north; override provenance; preservation of original and moved centers; default-off persistence behavior; unchanged scan and compass data; all existing scan/view/export paths with optional fields absent. Device UI tests require exploration under the applicable mobile-testing rules.

## First browser preview

Open `/inspect.html` with a converted room JSON, choose **Floor plan**, then enable **Vastu preview**. The toggle resets off whenever a file loads or the page reloads. The browser preview exposes the selected exploratory method, center, grid dimensions, north choice, and visual settings; it uses only the measured room polygon and explicitly marks partial-room scope. The overlay does not evaluate rules or confirm an apartment boundary. **Copy review context** copies converted geometry and observations, preserves raw scan data and chosen view settings, and tells a receiving agent to honor the selected method; a selectable text fallback is available if clipboard access fails. No content is sent automatically. This preview is browser-only; native iPhone support remains future work, and the native viewer currently has the separate Recorded north overlay.
