# Brewing Water Chemistry Calculator

Plan a treated brewing-water batch from a starting water report, a target profile, and the ingredients in your drawer. The calculator runs in the browser and saves changes locally.

## Run locally

Use Node.js 24 LTS. Run these commands from the repository root.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm start
```

Open [the local calculator](http://127.0.0.1:4173/). The static server listens on loopback and serves `src/index.html` and its assets. Keep the same scheme, host, and port when revisiting a saved batch. Use **Export backup** and **Import backup** to move data between browsers or origins. A prototype save under `wcStaticV1` migrates on the same origin and remains available in its original form.

## Plan a batch

1. In **Starting Water**, select a source or enter a water report. Use the basis beside Alkalinity, and leave missing values blank. Save a named profile to reuse it.
2. In **Treated Water**, set the final batch volume and target ranges. Enable the optional pH target to include it in Calculate.
3. Use **Calculate additions** to replace the current recipe with a stock-bounded recipe. Adjust the amounts in **Additions**, using zero to skip an ingredient. The drawer controls which ingredients Calculate can use. Changing drawer stock preserves the current recipe and shows any quantities to buy.

A new drawer starts with unlimited stock. Use **Deselect all** to build a finite inventory, **Select all** to mark everything on hand, or **Set selected to unlimited** to update the stock mode for selected products. Use **Settings** to choose System, Light, or Dark appearance and show ingredient references. Use Ctrl+Z or Cmd+Z to undo a committed change and Ctrl+Shift+Z or Cmd+Shift+Z to redo it. A reload restores the last saved batch and starts a fresh history.

## Calculation notes

- Volumes are stored in liters. The blend scales source concentrations by the fraction of the batch supplied by the source. Ingredient forms use documented formula weights and liquid strengths. The catalog lists recipe units, increments, and batch-scaled calculation ceilings. These ceilings bound the search. Chalk remains available in inventory while its modeled contribution stays unevaluated. [Ingredient catalog](src/catalog.js) · [Chalk dissolution study](https://braukaiser.com/documents/effect_of_water_and_grist_on_mash_pH.pdf)
- The pH model uses a closed carbonate system at about 25 °C and a water-blank-corrected alkalinity endpoint of pH 4.30. It uses ideal dissolved ions and ignores precipitation, including calcium phosphate. The result estimates water pH before contact with the grist. [Published citric-acid calculation](https://brewery.org/library/AcidifWaterAJD0497.html) · [USGS alkalinity field manual](https://www.usgs.gov/publications/chapter-a6-section-66-alkalinity-and-acid-neutralizing-capacity)
- Treatment uses the disinfectant residual and its reporting basis, the amount of source water in the batch, and the product’s potassium metabisulfite content. The profile credits sulfate, chloride, and modeled acid equivalents for the reacted portion. Free chlorine uses the HOCl reaction convention. Legacy rates are retained in backup data in mg/gal. [Dechlorination experiments](https://cdn.homebrewtalk.com/data/attach/663/663189-Chlorine-Chloramine-Removal.pdf) · [EPA reaction and dosing reference](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P100NGUZ.txt)
- The solver first minimizes squared range misses. Each unevaluated goal contributes one point. It then minimizes squared distance from the preferred values. The scales for calcium, magnesium, sodium, sulfate, chloride, alkalinity, and pH are 50, 15, 25, 100, 50, 50 mg/L, and 0.5 pH units respectively. Ties favor fewer additions, then fewer total dose increments, then lexicographic dose order in the catalog. The worker enumerates up to 12,000 combinations exactly and uses a bounded 14,000-evaluation search for larger problems.
- The information button next to a missed target shows stock options with tested doses and projected results. The worker compares products individually and can also test combinations, sharing a budget of up to 16,000 evaluations for stock advice. Options preserve targets already in range. Optional adjustments use a recipe that already meets the ranges as their starting point.

## Release checks

The chemistry fixtures cover a 100 mg/L calcium source diluted from 8 L to 10 L, the mass added by 1 g of gypsum and both calcium chloride forms (within 0.0001 mg/L in a 10 L batch), the published 225.94 mg/L citric acid example (within 0.04 pH units), and chlorine and monochloramine treatment fixtures (within 0.0001 mg/L for modeled reaction products). Small solver fixtures compare rounded recipes with independent exhaustive enumeration.

Use a staging origin that serves the same `src/` directory. Set `CALCULATOR_URL` to the staged URL before running `npm run test:browser`. The browser suite covers desktop, a 390 × 844 touch viewport, backup transfer, migration and revisits, keyboard focus, dose editing, and history. Publish the contents of `src/` to the stable production origin after staging passes.

The release candidate passed `npm ci`, `npx playwright install chromium`, `npm test` (20 tests), and `npm run test:browser` (22 tests) on Node.js 24.11.1 and Playwright Chromium 141.0.7390.37. The same 22 browser tests passed with `npm start` serving the staging origin at `http://127.0.0.1:4174/`. Coverage includes a 1280 × 720 desktop viewport, a 390 × 844 touch viewport, and visual inspection at 1280 × 900 and 390 × 844. Physical devices, other browser engines, and a hosted staging origin remain outside this verification.

The continuation passed 27 unit tests and 32 browser tests on a separate loopback staging origin. The added checks cover water-report labels and units, older recipe migration, bulk drawer edits, theme contrast, and target-specific stock disclosures by keyboard and touch.
