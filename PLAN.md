# Homebrew Water Chemistry Calculator Plan

Build a simple, responsive calculator that helps homebrewers turn a starting water profile into a batch of treated brewing water. A brewer can choose a source and a target, calculate additions, then fine-tune the recipe. Batch size is the total volume of treated brewing water. The calculator covers water preparation before the mash.

V1 runs in the browser and saves locally. New users can try a recipe with unlimited stock, then enter their actual inventory when they want to plan a batch. Beta adds optional accounts for backup and cross-device sync.

## Calculator layout

### Starting Water

- Default to **Distilled**. Let users enter, name, save, and reuse multiple starting water profiles. Support calcium, magnesium, sodium, sulfate, chloride, alkalinity, and pH. Accept alkalinity in mg/L as CaCO₃ or bicarbonate in mg/L as HCO₃⁻, with the basis shown. Keep missing report values distinct from measured zeros. [USGS alkalinity field manual](https://www.usgs.gov/publications/chapter-a6-section-66-alkalinity-and-acid-neutralizing-capacity)
- Add **Reverse osmosis (estimate)** as an editable profile for unmineralized, low-mineral RO water. Actual mineral content depends on the feed water and treatment system. Identify the preset assumptions and let users substitute their own report values. [EPA guide to home water treatment](https://www.epa.gov/system/files/documents/2025-01/ws-products-home-water-treatment-guide_v2_508.pdf)
- Add **Bottled spring water (example)** using a published analysis of a specific source. Let users edit it to match the jug they bought. Alkalinity can vary widely even within one brand. Ice Mountain's published samples ranged from 8.7 to 290 mg/L as CaCO₃. [Ice Mountain water analysis](https://a-us.storyblok.com/f/1021132/x/2f82f22dba/icemountain_wqr_2025_en.pdf)
- Display the starting volume as the treated batch volume minus the distilled volume added. Allow the full range from no dilution to all distilled, subject to available dilution stock. Hide the dilution control when Distilled is already the starting profile.

### Additions

- Show usable ingredients and any ingredient still needed by the current recipe. Give each addition a per-batch enable checkbox, a slider, and a numeric dose field. Update the treated profile as the recipe changes. Disabled ingredients contribute zero to the displayed result and to new calculations.
- Open the **Ingredient Drawer** from a button that shows the on-hand count. The drawer slides over a dimmed backdrop and closes via **Done**, the close button, a backdrop tap, or Escape. Keep keyboard focus inside the open drawer and return focus to its button on close.
- Start a new drawer with ingredients selected and unlimited stock. **Deselect all** lets the user start from an empty drawer and select the ingredients they own. Track availability and finite or unlimited stock in the drawer, so a batch checkbox can skip an ingredient without editing inventory. Preserve existing users' drawer settings during migration.
- Keep each slider's maximum fixed for the current batch size when stock changes. Hatch the portion beyond finite stock, including for distilled dilution water. Warn during a drag beyond stock and snap to the largest measurable amount on hand when the drag ends. Apply the same stock cap when a new numeric amount is committed.
- Preserve an existing planned dose if the user later lowers the stock or marks the ingredient unavailable. Keep that row visible, mark the recipe as needing stock, and show a shopping list with the missing quantities. A recipe that calls for 6 g of gypsum with 4 g on hand keeps its 6 g dose and lists 2 g to buy. The treated profile reflects the enabled doses in the plan. **Calculate additions** can replace the plan with a recipe that fits current stock.

### Treated Water

- Put the batch volume here. Default to US gallons and allow a manual switch to liters. Display the calculated profile alongside editable target ranges and their preferred values.
- Offer style presets, historic water profiles such as Burton-on-Trent, and named user-saved targets. Every built-in preset includes a short explanation of why the profile suits the beer or where the water analysis came from. Tie historical numbers to a documented source and let users describe the targets they save. [Historical Burton well analyses](https://www.cyberlibrary.org/en/books/cooley-s-cyclop-dia-of-practical-receipts-and-collateral-inform-4dfe3dab/chapters/83/)
- Make **Calculate additions** the primary action. Show which values are in range, which are high or low, and by how much. Keep the three sections readable on phones and desktop screens.

## Ingredient catalog and chemistry

| Ingredients | Recipe units and modeling |
| --- | --- |
| Gypsum, calcium chloride, Epsom salt, baking soda, chalk, table salt, magnesium chloride, pickling lime, and citric acid | Grams. Account for the salt form and its water of crystallization where applicable. |
| Lactic acid 88% and phosphoric acid 85% | Milliliters. Use verified concentration and density for the named liquid strengths. |
| Potassium metabisulfite | Milligrams. Dose for chlorine or chloramine treatment using the product formulation, source disinfectant level, and volume of source water used. Apply the same inventory rules. |
| Distilled water | Gallons or liters. Replace part of the starting water to dilute the batch. |

Use food-grade brewing products and verify the composition, supported forms, and dose assumptions in the catalog. Make forms explicit where they materially change the dose, such as anhydrous versus dihydrate calcium chloride. Track chalk in the drawer and validate its dissolution model before crediting it in automatic dosing. Use the same criteria for additional homebrew water treatments, including the extras in the prototype. [Calcium chloride supplier specification](https://www.rahrbsg.com/calcium-chloride/p) · [Chalk dissolution experiments](https://braukaiser.com/documents/effect_of_water_and_grist_on_mash_pH.pdf) · [Dechlorination experiments](https://cdn.homebrewtalk.com/data/attach/663/663189-Chlorine-Chloramine-Removal.pdf)

Starting profiles have one editable pH field for the measured, reported, or assumed starting value. The Treated Water section has an editable pH target and a read-only **Estimated pH** for the current recipe. Calculate the estimate from starting pH and alkalinity, dilution, and the additive forms and doses. Use a validated carbonate equilibrium model with stated temperature and CO₂ assumptions. Include pH in the solve when the user sets a target and the source data supports it. When the necessary inputs are missing, show what to enter and continue calculating the supported parts of the profile. Estimates from fallback profiles inherit the uncertainty in their starting values. [Brewing-water acidification model and worked example](https://brewery.org/library/AcidifWaterAJD0497.html)

Calculate dilution and dissolved additions from the amount of starting water, the amount of distilled water, and the final batch volume. Use measurable dose increments and enforce both stock limits and validated ingredient dose bounds. Prioritize reaching the target ranges, then prefer values closer to the selected targets. If the recipe cannot reach every range, return the closest feasible result and identify each miss. Check whether relaxing an inventory limit would improve the fit before attributing a miss to stock or suggesting a purchase.

## Undo and Redo

Provide **Undo** and **Redo** buttons and disable each when its history is empty. Support Ctrl+Z and Cmd+Z for Undo and Ctrl+Shift+Z and Cmd+Shift+Z for Redo. Keep native text field editing shortcuts while a user types.

Include changes to starting water, saved profiles and presets, targets and ranges, batch settings, additions, and drawer stock. Each slider drag, Calculate action, and bulk drawer edit is one history step. Restore the recipe and drawer together so any shortfalls are recalculated. A new committed edit after Undo clears the redo history.

## Browser storage and beta accounts

Use versioned browser storage for the active batch, ingredient inventory, saved starting profiles, custom targets, and preferences. Start with a stable site origin and migrate the existing `wcStaticV1` data for users on that origin. Provide backup export and import for moving to another browser or origin. Keep the calculator usable when the browser blocks saving and surface the save status. [HTML Web Storage standard](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute)

In beta, offer optional accounts for backup and sync and keep the guest workflow available. At first sign-in, let users choose to bring their existing local data into their account. Keep storage operations independent of the calculation so each user can run the same solver in guest or signed-in mode.

## Implementation and release checks

1. Use the prototype as an interaction reference. Put the chemistry, solver, browser storage, and interface in independently testable modules. Fix the prototype behavior where a disabled dose can still contribute to the treated profile after Calculate. [Existing prototype](src/index.html)
2. Validate the model against known water blends, documented ingredient contributions, and published acidification examples. Cover distilled and RO, partial and full dilution, low alkalinity, missing source data, and an unreachable target. Verify results using the same rounded doses the brewer sees.
3. Connect the three-section interface and verify the entire flow on mobile and desktop, including keyboard use in the drawer. Exercise zero and fractional stock, unlimited stock, disabled ingredients, the transition into finite stock, and Undo and Redo across a slider drag, Calculate, and a bulk inventory change.
4. Verify that v1 restores the current batch and saved profiles after reload, migrates prototype data, and continues calculating when browser storage is unavailable. Publish the browser-only release on a stable origin after these checks pass.

## Future wishlist

- **Share water profiles.** Let recipients preview and import a shared profile as an editable copy into **Starting Water** or **Treated Water**. Share the water values, units, and optional source information. If a profile contains ranges, ask for specific values when applying it to Starting Water. Use the imported values as targets in Treated Water, preserving any supplied ranges.
- **Homebrew store and starter sets.** Let users choose their preferred shop from a preset dropdown. Use the shopping list to suggest matching products, forms, strengths, and package sizes. Use commission-earning links where the shop supports them and disclose the relationship next to the links. Offer starter sets that cover a water target from a stated starting profile and batch size. [FTC affiliate-link guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking#affiliate)
- **Custom ingredient requests.** Add a free-text ingredient field at the bottom of the Ingredient Drawer. Label custom entries as inventory only and explain that calculations use the built-in ingredient list. Offer to request a catalog addition. Sending a request requires sign-in with a verified email address.
- **Made this water.** Keep the **Coming later** note in the drawer and below the sliders. The eventual action deducts the quantities used from finite drawer stock once the user confirms they made the batch.
- **Locale and approximate kitchen measures.** Use browser locale for the initial unit preference. Offer teaspoons and other volumetric measures as optional estimates, with their dosing uncertainty shown. Browser language and locale supply the preference without requiring precise location.
