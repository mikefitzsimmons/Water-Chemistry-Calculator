# Homebrew Water Chemistry Calculator Implementation Plan

Implement the browser-only v1 described in [the product plan](PLAN.md). The commit sequence keeps the calculator usable as storage, chemistry, inventory, and the interface change. Beta accounts, profile sharing, retailer links, custom ingredient requests, inventory deduction, and locale-based or kitchen measures remain roadmap items in the product plan.

## Working agreements

- Keep `src/index.html` as the browser entry point and serve it over HTTP during development. Use plain HTML, CSS, and JavaScript modules. Keep the evaluator and solver usable independently of the DOM and browser storage. Replace the prototype's standalone HTML download with backup export and import when introducing modules.
- Use liters internally for volume, mg/L for ion concentrations, and explicitly labeled alkalinity in mg/L as CaCO₃. Keep each ingredient's dose and stock in the same catalog-defined unit and convert at input, display, or legacy import boundaries. Preserve missing measurements separately from zero. Use stable IDs for profiles, ingredients, and ingredient forms.
- Keep planned doses, per-batch enablement, and drawer stock separate in state. Use one forward evaluator for manual edits, calculated recipes, and results. Derive shortfalls, starting volume, calculated profile, and solver diagnostics from their inputs.
- Add focused tests in the commit that changes behavior. Run the unit suite and the relevant browser tests before each commit. Keep existing passing checks green. A reviewer should be able to understand or revert each commit by its stated purpose.

## Commit sequence

### Commit 01 Establish the test harness

`test: add a static calculator test harness`

Add a private npm manifest and lockfile, a small loopback-only static server, the built-in Node test runner, and Playwright as a development dependency. Use Node 24 LTS and the same localhost origin for repeat visits in browser tests. Add a prototype-shaped `wcStaticV1` fixture with saved starts, custom targets, drawer quantities, and a working recipe. Establish a smoke test for loading the calculator, opening the drawer, and changing and reloading a batch. [Node.js releases](https://nodejs.org/en/about/previous-releases) · [Playwright local web server](https://playwright.dev/docs/test-webserver)

The commit passes when the app opens over HTTP, the smoke test runs in a clean browser context, and the fixture can seed a second independent context.

### Commit 02 Version local saves and add data backups

`feat: migrate local saves and add data backup import and export`

Move the inline application script to a module as a mechanical change and extract browser storage into its own module. Read the versioned record first, with `wcStaticV1` as the legacy migration path. Preserve the original browser record, active recipe, drawer settings, saved starts, and custom targets. Map `custom:<index>` selections to stable IDs and preserve an independently edited active target. Keep the legacy bicarbonate basis and convert it explicitly where needed. When adopting mg for metabisulfite stock, convert the legacy grams once. The legacy dosing rate already uses mg/gal.

Replace **Download this file** with **Export backup** and **Import backup**. Validate the entire backup before applying it and treat replacement as one state change. Save on committed changes and show a save status when local storage is unavailable. Keep the app usable in memory. [HTML Web Storage standard](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute)

Test fresh, legacy, and current records, repeated migration and reload, round-trip backup, invalid JSON, unknown versions, storage errors, and explicit zeros. Verify that an invalid import leaves the active data intact and that a failed write preserves the previous persisted record.

### Commit 03 Extract the forward calculation

`fix: use enabled doses for mixing and profile calculations`

Extract pure unit conversion, volume, and dissolved contribution functions. Route live results and the existing Calculate workflow through them. An unchecked addition contributes zero, including distilled water. Derive starting volume from final volume and effective dilution. Cover the full physical dilution range, with zero source contribution at complete dilution. Keep enabled planned doses in the forward calculation after stock changes and bound any new Calculate result before displaying it.

Test that 8 L of source at 100 mg/L calcium plus 2 L distilled gives 80 mg/L in 10 L, and verify no dilution, full dilution, and missing versus zero source values. Reproduce the stale gypsum and distilled regressions after toggling each off and pressing Calculate. Check that gallons-to-liters display changes preserve the underlying volumes and doses.

### Commit 04 Verify ingredient forms and doses

`feat: model documented brewing ingredient forms`

Create the ingredient catalog from the product plan with stable IDs, dose units and increments, verified forms, sources, and supported dose bounds. Identify hydrate forms and record liquid acid concentration and density. Wire formulation choices to the forward evaluator and translate old ingredient IDs to their corresponding forms. Preserve legacy drawer ownership and amounts. Support chalk in the drawer and enable automatic contributions only when a dissolution model has been validated. Apply the same criteria to additional legacy ingredients. [Ingredient and chemistry references](PLAN.md#ingredient-catalog-and-chemistry)

Check every requested ingredient's unit. Verify documented mass contributions with independently calculated fixtures, including gypsum dihydrate and the different calcium contributions from anhydrous and dihydrate calcium chloride. Exercise repeat loads, ingredient form changes, small doses, and the handling of legacy records that lack a formulation.

### Commit 05 Enforce stock on new edits

`feat: add stock caps and preserve recipes with shortages`

Give a fresh drawer unlimited stock and add **Deselect all** as one action. Implement stock limits for numeric edits, slider commits, and the existing Calculate path. Use the largest measurable dose within the cap. Keep the slider maximum fixed for the batch while hatching the over-stock range. Show a warning during a drag. Preserve a current enabled plan when stock falls and show a derived shortfall and shopping quantity, even if the item is now unavailable. Reuse the same rules for distilled dilution. Complete drawer keyboard focus, close actions, and the on-hand count in this commit.

Test 0.25 g of stock with a 0.1 g increment, which permits a new 0.2 g dose. Cover zero, unavailable, and unlimited stock. Lower gypsum stock from an unlimited 6 g plan to 4 g and verify the original treated profile, 2 g shortfall, and a stock-bounded replacement after Calculate. Check the fixed slider maximum and changing hatching for both solids and dilution. Verify that refilling clears the warning, disabling the dose removes it from the list, and the drawer returns focus on close.

### Commit 06 Calculate alkalinity and estimated pH

`feat: estimate treated water pH from additions and dilution`

Implement a pure carbonate equilibrium calculation with documented temperature, CO₂, and alkalinity endpoint assumptions. Use source pH and alkalinity, dilution, and the catalog formulations and doses of acids and bases. Use the same model for forward pH and later pH target evaluation. Show the estimate as read-only and label estimates based on assumed source data. Return an unavailable result with the missing inputs when the model lacks enough information, while continuing to show the supported ion values. [Brewing-water acidification examples](https://brewery.org/library/AcidifWaterAJD0497.html)

Check that untreated water reproduces its input pH under the model assumptions. Test acid and base response, low buffering, full and partial dilution, and missing inputs. Use a published citric acid worked example with matching conventions and independently check the constants and model tolerances before enabling pH targeting.

### Commit 07 Account for dechlorination

`fix: dose metabisulfite for the actual source volume`

Use the product formulation, disinfectant type and reporting basis, concentration, and source volume to calculate potassium metabisulfite treatment in mg. Apply enablement and stock rules and report insufficient stock or missing inputs. Distinguish the dose required for treatment from the dose in the recipe when reporting a shortfall. Use the source volume from the recipe being evaluated, including during solver runs that vary dilution. Treat the dose as a consequence of dechlorination. Include verified changes to the water profile from the dose in the recipe. [Dechlorination experiments](https://cdn.homebrewtalk.com/data/attach/663/663189-Chlorine-Chloramine-Removal.pdf)

Test chlorine and chloramine with known inputs, changes in source volume, an all-distilled batch, disabled treatment, missing formulation or residual, and stock below the calculated dose. Verify the old stock and rate units against the migration fixture.

### Commit 08 Replace the bounded solver

`feat: solve target ranges with measurable doses and stock limits`

Solve over measurable dose increments with bounds for enabled ingredients, stock, validated ingredient doses, and physical dilution. Optimize range misses first and preferred-value distance second, using documented scales so ion concentrations and pH can be compared. Specify a deterministic tie-break and use the forward calculation to score the final recipe, including a pH target when the model can evaluate it. Commit the entire result in one action. For an asynchronous solve, discard results if the inputs changed while it ran. Report each high, low, or unevaluated target. If a search limit prevents proving a result is closest, show the best result found and its actual misses.

For a stock-related shopping suggestion, compare the stock-limited solution with a solve that relaxes only the relevant inventory limits. Use the improvement and the measurable quantities required to explain the shortage. This comparison respects enabled ingredients, chemical bounds, and the batch volume.

Compare small discrete problems against exhaustive enumeration. Test exact and incompatible ranges, ties, insufficient stock, disabled stale doses, unknown targets, full dilution, and a pH-constrained recipe. Verify rounded amounts by feeding the displayed recipe back through the forward calculation. Exercise a realistic multi-ingredient solve and check that the page remains responsive. Test an unreachable target that more inventory fails to improve.

### Commit 09 Build the three section workflow

`feat: finish the starting additions and treated water workflow`

Arrange the controls into **Starting Water**, **Additions**, and **Treated Water**. Default to Distilled and US gallons. Add editable RO and bottled spring-water starting options, with documented assumptions or a published analysis from one source. Support named starting profiles, both water-report alkalinity bases, and optional source pH. Put batch size, preset descriptions, custom target saves, ranges, pH target, and calculated results in Treated Water. Check style and historic targets against their stated sources. Make Calculate the primary action and show the planned-recipe warning alongside results. [Product requirements and preset references](PLAN.md#calculator-layout)

Test source and target preset switching, save and restore of named starts and custom targets, liters and gallons, invalid report or range inputs, and dilution visibility. Check that the source volume follows batch size and that the clean-browser workflow works at a phone viewport and on desktop.

### Commit 10 Add transaction based Undo and Redo

`feat: add undo and redo for recipe and setup edits`

Track committed state transitions in session memory. Include settings, the batch, sources, targets, saved records, and the drawer. Group a slider drag, Calculate, backup import, and **Deselect all** into one step each. Restore and persist the relevant state together and recalculate derived results. Keep redo after a no-op and clear it after a new committed change. Wire disabled button states and the shortcuts from the product plan while preserving native text editing.

Test rapid separate drags, canceled or unchanged edits, undoing a stock reduction, redoing a shortage, undoing and redoing Calculate, and saved profile changes. Verify reload restores the last committed recipe and that a new tab starts with fresh history.

### Commit 11 Verify the release candidate

`test: verify calculator workflows and document release checks`

Run the combined release scenarios below. Add regression tests for any gaps they expose. Document how to run the app and tests in the README. Verify that the static release loads on a staging origin and preserves storage when revisiting that origin. Keep public deployment as a release step after verification.

## Testing plan

### Commands

Commit 01 should provide these commands from the repository root. Run them on a machine with Node and a browser that can launch under Playwright.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm start
```

Use `npm test` for pure calculation, solver, unit conversion, state, and storage tests. Use `npm run test:browser` for Playwright tests against the static server. Use `npm start` for manual desktop and mobile checks. Node was absent from PATH during planning, and installed Chromium browsers failed to start headlessly in the restricted Windows session. Run browser checks in a normal browser session or on a runner that supports Playwright.

### Release scenarios

| Scenario | Expected result |
| --- | --- |
| Fresh browser | Choose a target with Distilled and unlimited stock, calculate, adjust a dose, and reload. The recipe and presets persist and the profile matches the visible doses. |
| Planner to actual stock | Calculate in unlimited mode, use **Deselect all**, and enter finite stock. The planned quantities remain visible with accurate shopping deficits. A subsequent Calculate obeys stock. Undo and Redo restore both outcomes. |
| Saved tap water and dilution | Load an older saved starting profile, add partial dilution, then test full dilution. Check the source volume, treatment dose, unit conversions, and estimated pH or its missing-input state. |
| Infeasible and incomplete targets | Check stock-limited misses, chemistry-limited misses, and goals with missing inputs. The app identifies highs, lows, or unevaluated values and suggests stock purchases where the comparison supports them. |
| Browser data transfer | Seed the legacy fixture, reload after migration, and export to a fresh context. The named profiles, selected target, draft, and drawer agree. Invalid imports and unavailable storage leave the calculator usable. |
| Phone and keyboard | Complete the core workflow in desktop and phone viewports. Check slider keyboard and touch input, visible focus, drawer focus containment and return, Escape and backdrop dismissal, and readable range and shortage feedback. |

Record the commands that passed, the browsers and viewport coverage, the reference fixtures and tolerances used for chemistry, and any verification gaps in the final handoff.
