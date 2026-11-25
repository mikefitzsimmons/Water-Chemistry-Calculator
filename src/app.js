import { decodeBackup, encodeBackup, newId, readSave, writeSave } from './storage.js';
import { fromVolumeDisplay, toVolumeDisplay, alkAsCaCO3, alkAsBicarbonate } from './units.js';
import { INGREDIENTS, ingredientById as ingById } from './catalog.js';
import { diagnose } from './solver.js';
import { dechlorination } from './dechlorination.js';
import { evaluate, mixVolumes, usesDilution } from './evaluate.js';
import { stockCap as availableStock, doseMaximum, doseGrid, doseAt, doseIndex, snapDose, shortfalls } from './inventory.js';
import { createHistory } from './history.js';
import { IONS, STARTS, PRESETS, presetById, defaultState } from './data.js';
import { targetAdvisories, targetLimits, validTargetRange } from './targets.js';

const getStorage = () => window.localStorage;
const systemAppearance = window.matchMedia("(prefers-color-scheme: dark)");
const loaded = readSave(getStorage, defaultState());
let S = loaded.state;
const history = createHistory(S);
const saveMessages = {
  ready: "Changes save in this browser.",
  saved: "Saved in this browser.",
  migrated: "Prototype data migrated and saved.",
  unavailable: "Browser save unavailable. Export a backup to keep your changes."
};
let revision = 0;
let lastSolve = null;
let importSequence = 0;
function persistState(){
  $("saveStatus").textContent = saveMessages[writeSave(getStorage, S) ? "saved" : "unavailable"];
}

function updateHistoryButtons(){
  $("undoBtn").disabled = !history.canUndo;
  $("redoBtn").disabled = !history.canRedo;
}

function recordChange({ persistNoop = false, displayOnly = false } = {}){
  const changed = history.commit(S);
  if (changed) {
    if (!displayOnly) {
      revision++;
      lastSolve = null;
      if (!$("solveBtn").disabled) $("solveStatus").textContent = "";
    }
    updateHistoryButtons();
  }
  if (changed || persistNoop) persistState();
}

function restoreHistory(direction){
  const state = history[direction]();
  if (!state) return;
  const active = document.activeElement;
  const drawerControl = active?.closest("#drawerBody")
    ? [...active.attributes].find(attribute => attribute.name.startsWith("data-d-")) : null;
  S = state;
  revision++;
  lastSolve = null;
  if (!$("solveBtn").disabled) $("solveStatus").textContent = "";
  persistState();
  updateHistoryButtons();
  renderAll();
  if (drawerControl) {
    const replacement = $("drawerBody").querySelector("[" + drawerControl.name + '="' + drawerControl.value + '"]:not(:disabled)');
    (replacement ?? $("doneDrawerBtn")).focus({ preventScroll: true });
  }
  toast(direction === "undo" ? "Undone" : "Redone");
}

/* ================= helpers ================= */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function referenceLink(url, name, label = "") {
  return `<a class="reference-link" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(name)} (opens in a new tab)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 4H5v16h13v-8M8 12h3m-3 4h6M15 4h5v5m0-5-7 7"/>
    </svg>${label ? `<span>${esc(label)}</span>` : ""}</a>`;
}
function fmt(n, dp){ if (!Number.isFinite(n)) return "—"; return Number(n.toFixed(dp===undefined?0:dp)).toString(); }
function volLabel(liters){ return fmt(toVolumeDisplay(liters, S.unit), 3) + " " + S.unit; }
var toastTimer = null;
function toast(msg){
  var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2400);
}
function residualAlk(profile){
  return [profile.Alk, profile.Ca, profile.Mg].every(Number.isFinite)
    ? profile.Alk - (profile.Ca/1.4 + profile.Mg/1.7) : null;
}
function sourceVolume(state = S){ return mixVolumes(state).sourceL; }

/* stock caps, expressed in each ingredient's own unit */
function stockCap(g){ return availableStock(S, g.id); }
function sliderMax(g){ return doseMaximum(S, g); }

/* ================= chemistry ================= */
/* ================= rendering: starting ================= */
function renderStart(){
  const { start } = S;
  const bicarbonate = start.alkBasis === "HCO3";
  const reportIons = IONS.filter(ion => ion.id !== "Alk");
  if (!$("start-Ca")) {
    $("startIons").innerHTML = reportIons.map(ion => `<div class="ionfield">
      <label for="start-${ion.id}">${ionLabel(ion)} <span class="unit">(mg/L)</span></label>
      <input type="number" min="0" step="any" id="start-${ion.id}" data-report="${ion.id}">
    </div>`).join("") + `<div class="ionfield">
      <label for="start-pH">Source pH <span class="unit">(optional)</span></label>
      <input type="number" min="0" max="14" step="any" id="start-pH" data-report="pH">
    </div>`;
  }
  for (const { id } of reportIons) $("start-" + id).value = start[id] === null ? "" : fmt(start[id], 6);
  $("start-pH").value = start.pH ?? "";
  const alkalinity = bicarbonate ? alkAsBicarbonate(start.Alk) : start.Alk;
  $("start-Alk").value = alkalinity === null ? "" : fmt(alkalinity, 6);
  $("alkBasis").value = start.alkBasis;
  $("startNameTag").textContent = S.startName;
  const starts = [...STARTS, ...S.savedStarts.map(profile => ({ ...profile, id: "saved:" + profile.id }))];
  $("sourceSelect").innerHTML = starts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("sourceSelect").value = S.startId;
  const source = STARTS.find(p => p.id === S.startId);
  $("sourceInfo").innerHTML = source ? esc(source.description) +
    (source.reference ? " " + referenceLink(source.reference, source.name + " source", "Source") : "") : "";
  $("sourceInfo").hidden = !source;
  $("chlorPpm").value = start.chlorine ?? "";
  $("chlorType").value = start.chlorType;
  $("chlorBasis").value = start.chlorBasis ?? "";
  $("chlorBasis").options[2].textContent = start.chlorType === "chloramine" ? "As NH₂Cl (chloramine)"
    : start.chlorType === "chlorine" ? "As HOCl (hypochlorous acid)" : "As reported compound";
  if (start.chlorType !== "none") $("disinfectant").open = true;
  $("startChips").innerHTML = S.savedStarts.map(p => `<span class="chip">
    <button type="button" class="apply" data-apply-start="${p.id}">${esc(p.name)}</button>
    <button type="button" data-del-start="${p.id}" aria-label="Delete ${esc(p.name)}">✕</button>
  </span>`).join("");
  updateStartTiles();
}
function updateStartTiles(state = S){
  $("startAmt").innerHTML = volLabel(sourceVolume(state)) + ' <small>of ' + volLabel(S.batchL) + '</small>';
}

function ionLabel({ id, name, sym }) {
  return id === "SO4" || id === "Cl" ? name + " <span class=\"ion-symbol\">(" + sym + ")</span>" : name;
}

function currentPresetObj(){
  return presetById(S.targetPreset) ?? S.customPresets.find(p => "custom:" + p.id === S.targetPreset);
}

function renderPresetSelect(){
  const presets = [...PRESETS, ...S.customPresets.map(p => ({ ...p, id: "custom:" + p.id }))];
  $("presetSel").innerHTML = presets.map(p =>
    `<option value="${p.id}">${esc(p.name)} (${p.kind === "Historical" ? "Historical" : p.kind === "Style" ? "Style" : "Custom"})</option>`
  ).join("") + '<option value="__customised" disabled>Edited target</option>';
  $("presetSel").value = S.targetPreset;
  const p = currentPresetObj();
  $("presetInfo").hidden = !p?.blurb;
  const reference = presetById(S.targetPreset)?.source;
  $("presetInfo").innerHTML = p ? esc(p.blurb) +
    (reference ? " " + referenceLink(reference, p.name + " reference", "Reference") : "") : "";
  $("presetChips").innerHTML = S.customPresets.map(saved => `<span class="chip">
    <button type="button" class="apply" data-apply-preset="${saved.id}">${esc(saved.name)}</button>
    <button type="button" data-del-preset="${saved.id}" aria-label="Delete ${esc(saved.name)}">✕</button>
  </span>`).join("");
}

function renderTarget(){
  $("pHTargetEnabled").checked = S.target.pH !== null;
  const ions = S.target.pH ? [...IONS, { id: "pH", name: "pH" }] : IONS;
  const headers = '<span></span><span class="lbl">Minimum</span><span class="lbl">Preferred</span><span class="lbl">Maximum</span>';
  $("targetRows").innerHTML = headers + ions.map(ion => {
    const { id, name } = ion;
    const { min, max } = targetLimits(id);
    const fields = Object.entries({ min: "minimum", ideal: "preferred", max: "maximum" }).map(([key, label]) =>
      `<input type="number" step="any" min="${min}" max="${max}"
        aria-label="${name} target ${label}" data-target-key="${id}" data-target-bound="${key}"
        value="${fmt(S.target[id][key], 5)}">`
    ).join("");
    return `<span class="target-label">${ionLabel(ion)}</span>` + fields;
  }).join("");
  $("targetAdvisories").innerHTML = targetAdvisories(S.target).map(({ text, source }) =>
    `<p>${esc(text)} ${referenceLink(source, "EPA " + text.split(" ", 1)[0] + " reference", "EPA reference")}</p>`
  ).join("");
}

/* ================= rendering: additions ================= */
function sliderBG(frac, stockFrac){
  var layers = [];
  if (stockFrac < 1){
    layers.push("repeating-linear-gradient(45deg, var(--hatch1) 0 5px, var(--hatch2) 5px 10px) right / "+((1-stockFrac)*100).toFixed(1)+"% 100% no-repeat");
  }
  layers.push("linear-gradient(90deg, var(--accent) 0 "+(frac*100).toFixed(1)+"%, var(--track) "+(frac*100).toFixed(1)+"% 100%)");
  return layers.join(", ");
}
function treatmentText(dose, sourceL = sourceVolume()) {
  if (dose.status === "disabled") return "Treatment disabled.";
  if (dose.status === "none") return "No disinfectant dose required.";
  if (dose.status === "missing") return "Enter " + dose.missing.join(" and ") + " to calculate treatment.";
  const quantity = amount => amount + " " + (dose.unit === "tablets" && amount === 1 ? "tablet" : dose.unit);
  return "For " + volLabel(sourceL) + " of source water, the recipe includes " +
    quantity(dose.applied) + ". Required " + quantity(dose.required) + "." +
    (dose.status === "short" ? " Insufficient stock for full treatment." : "");
}

function renderAdds(){
  var html = "";
  var anyOwned = false;
  if (S.start.chlorType !== "none") {
    const dose = dechlorination(S, sourceVolume());
    const { enabled, mode, campdenMg, assayPercent } = S.dechlor;
    const campden = mode === "campden";
    html += `<div class="addrow">
      <div class="mmrow"><label>Dechlorination product <select data-dechlor-mode>
        <option value="skip" ${enabled ? "" : "selected"}>Skip treatment</option>
        ${["kmeta", "campden"].map(id => `<option value="${id}" ${enabled && mode === id ? "selected" : ""}>${esc(ingById(id).name)}</option>`).join("")}
      </select></label>
      ${enabled ? `<label>${campden ? "Active mg per tablet" : "Powder assay (%)"}
        <input type="number" min="0.01" ${campden ? "" : 'max="100"'} step="any"
          value="${(campden ? campdenMg : assayPercent) ?? ""}" data-dechlor-formulation>
      </label>` : ""}</div>
      <p data-treatment class="anote">${esc(treatmentText(dose))}</p>
    </div>`;
  }
  for (const g of INGREDIENTS) {
    const dilution = g.id === "distilled";
    if (g.inventoryOnly) {
      if (S.adds[g.id] > 0) {
        html += `<div class="addrow">
          <strong>${g.name}</strong>
          <p class="small">Legacy planned amount · ${amountLabel(g, S.adds[g.id])}. The model leaves its contribution unevaluated.</p>
          <button type="button" class="btn" data-clear-dose="${g.id}">Clear ${g.name.toLowerCase()} dose</button>
        </div>`;
      }
      continue;
    }
    if (g.auto && !dilution || dilution && !usesDilution(S)) continue;
    const planned = dilution ? Math.min(S.batchL, S.adds[g.id]) : S.adds[g.id];
    if (!S.drawer[g.id].owned && planned <= 0) continue;
    anyOwned = true;

    const max = sliderMax(g);
    const cap = stockCap(g);
    const stockFraction = max > 0 ? Math.min(1, cap / max) : 1;
    const grid = doseGrid(S, g, Infinity);
    const doseLabel = dilution ? dilutionLabel(g, planned) : amountLabel(g, planned);
    const unit = dilution ? S.unit : g.unit;
    const displayed = dilution ? fmt(toVolumeDisplay(planned, S.unit), 6) : planned;
    const entryStep = dilution ? toVolumeDisplay(grid.step, S.unit) : "any";
    html += `<div class="addrow" data-addrow="${g.id}">
      <div class="ahead">
        <span class="aname">${g.name}</span>
        <span class="anote">${g.sub}</span>
        <label class="aamt"><input type="number" min="0" step="${entryStep}" value="${displayed}"
          data-amt="${g.id}" aria-label="${g.name} amount">
          <span class="u">${unit}</span></label>
      </div>
      <input type="range" min="0" max="${grid.last}" step="1" value="${doseIndex(grid, planned)}"
        data-slider="${g.id}" ${grid.last ? "" : "disabled"} aria-label="${g.name} slider"
        aria-valuetext="${esc(doseLabel)}" style="background:${sliderBG(max > 0 ? Math.min(1, planned / max) : 0, stockFraction)}">
      ${dilution && S.unit === "gal" ? `<p class="small dilution-readout" data-dilution-readout ${doseLabel.includes("fl oz") ? "" : "hidden"}>${esc(doseLabel)}</p>` : ""}
      <div class="ends"><span>${cap === Infinity ? "Unlimited stock" : "On hand · " + esc(amountLabel(g, cap))}</span>
        <span>Batch maximum · ${amountLabel(g, max)}</span></div>
      <p class="warn" data-stock-warning ${planned - cap > 1e-9 ? "" : "hidden"}>This amount exceeds your stock.</p>
    </div>`;
  }
  if (!anyOwned && S.start.chlorType === "none") {
    html += '<p class="small">Select ingredients in the drawer to add them to this batch.</p>';
  }
  $("addsList").innerHTML = html;
  const count = INGREDIENTS.filter(g => S.drawer[g.id]?.owned).length;
  $("drawerCount").textContent = count;
}

/* ================= rendering: final ================= */
function amountLabel(g, amount) {
  const unit = g.id === "distilled" ? S.unit : g.unit;
  const quantity = g.id === "distilled" ? toVolumeDisplay(amount, S.unit) : amount;
  const value = quantity > 0 && quantity < 0.000001 ? "<0.000001" : fmt(quantity, 6);
  return value + " " + unit;
}

function dilutionLabel(ingredient, amount) {
  if (S.unit !== "gal") return amountLabel(ingredient, amount);
  const ouncesPerGallon = 128;
  const fluidOunces = toVolumeDisplay(amount, "gal") * ouncesPerGallon;
  const rounded = Math.round(fluidOunces);
  if (!Number.isSafeInteger(rounded) || Math.abs(fluidOunces - rounded) > 1e-7) {
    return amountLabel(ingredient, amount);
  }
  const gallons = Math.floor(rounded / ouncesPerGallon);
  const remainder = rounded % ouncesPerGallon;
  if (!remainder) return gallons + " gal";
  return (gallons ? gallons + " gal " : "") + remainder + " fl oz";
}

function diagnosticText(check) {
  if (check.difference === null || check.difference === 0) return check.status;
  const unit = check.key === "pH" ? "pH units" : "mg/L";
  return (check.difference < 0.01 ? "<0.01" : fmt(check.difference, 2)) + " " + unit + " " + check.status;
}

const resultName = key => IONS.find(ion => ion.id === key)?.name ?? key;
const resultValue = ({ key, value }) => fmt(value, 2) + (key === "pH" ? "" : " mg/L");

function renderStockOptions(key, name, options) {
  const items = options.map(({ purchases, after, changes, doseChanges }) => {
    const products = purchases.map(({ id, amount, dose }) => {
      const ingredient = ingById(id);
      return `<p><strong>${esc(ingredient.name)}</strong> <span class="small">${esc(ingredient.sub)}</span><br>
        Buy ${esc(amountLabel(ingredient, amount))} · Dose ${esc(amountLabel(ingredient, dose))}</p>`;
    }).join("");
    const projection = after.status === "in range" ? `${name} would reach ${resultValue(after)} and be in range.`
      : `${name} would reach ${resultValue(after)} and still be ${diagnosticText(after)}.`;
    const adjust = doseChanges.map(({ id, dose }) => {
      const ingredient = ingById(id);
      return ingredient.name + " " + amountLabel(ingredient, dose);
    }).join(", ");
    const related = changes.map(change => resultName(change.key) + " " + resultValue(change) +
      (change.status === "in range" ? "" : ` (${diagnosticText(change)})`)).join(", ");
    return `<li>${purchases.length > 1 ? '<strong>Combined adjustment</strong>' : ''}${products}
      <p>${esc(projection)}</p>
      ${adjust ? `<p class="small">Other doses in this recipe · ${esc(adjust)}</p>` : ""}
      ${related ? `<p class="small">Other projected values · ${esc(related)}</p>` : ""}</li>`;
  }).join("");
  return `<div id="stock-options-${key}" class="stock-options" hidden><ul>${items}</ul></div>`;
}

function renderOptionalAdjustments(advice) {
  const panel = $("optionalAdjustments");
  panel.hidden = !advice?.optional.length;
  if (!advice?.optional.length) {
    panel.replaceChildren();
    return;
  }
  const reference = advice.reference.map(({ id }) => ingById(id).name).join(" and ");
  const items = advice.optional.map(({ purchase, key, before, value }) => {
    const ingredient = ingById(purchase.id);
    return `<li><strong>${esc(ingredient.name)} is optional.</strong> ${esc(resultName(key))} is already in range.
      A ${esc(amountLabel(ingredient, purchase.dose))} dose in the adjusted recipe moves it from
      ${esc(resultValue({ key, value: before }))} to ${esc(resultValue({ key, value }))}, closer to the preferred value.</li>`;
  });
  panel.innerHTML = `<h3>Optional adjustments</h3>
    <p class="small">The recipe meets the target ranges${reference ? ` with the ${esc(reference)} adjustment` : ""}.</p>
    <ul>${items[0]}</ul>${items.length > 1 ? `<details><summary>More optional adjustments</summary><ul>${items.slice(1).join("")}</ul></details>` : ""}`;
}

function renderFinal(state = S){
  const result = evaluate(state);
  const solved = state === S ? lastSolve : null;
  const fin = result.profile;
  const checks = diagnose(result, state.target);
  const statusByKey = new Map(checks.map(check => [check.key, check]));
  const rangeOptions = new Map(solved?.advice?.ranges.map(({ key, options }) => [key, options]));
  const rows = state.target.pH ? [...IONS, { id: "pH", name: "pH", ceil: targetLimits("pH").max }] : IONS;
  $("finalRows").innerHTML = rows.map(ion => {
    const { id, name, ceil } = ion;
    const target = state.target[id];
    const check = statusByKey.get(id);
    const { status, value } = check;
    const floor = id === "Alk" && (target.min < 0 || value < 0) ? targetLimits(id).min : 0;
    const pct = x => Math.max(0, Math.min(100, (x - floor) / (ceil - floor) * 100));
    const warning = status === "low" || status === "high";
    const options = rangeOptions.get(id);
    const direction = status === "low" ? "raise" : "lower";
    const label = id === "pH" ? name : name.toLowerCase();
    return `<div class="frow" data-result-key="${id}">
      <span class="fn">${ionLabel(ion)}</span>
      <div class="mini" aria-hidden="true">
        <div class="shade" style="left:${pct(target.min)}%;width:${pct(target.max) - pct(target.min)}%"></div>
        <div class="idealmark" style="left:${pct(target.ideal)}%"></div>
        ${value === null ? "" : `<div class="valmark" style="left:${pct(value)}%"></div>`}
      </div>
      <div class="fv${options ? ' has-stock-options' : ''}"><div>${fmt(value, 2)}
        <small class="${warning ? "outrange" : status === "in range" ? "inrange" : "unmeasured"}">
          ${warning ? '<span aria-hidden="true">⚠</span> ' : ''}${esc(diagnosticText(check))}</small></div>
        ${options ? `<button type="button" class="stock-options-button" data-stock-options="${id}"
          aria-label="Ways to ${direction} ${label}" aria-expanded="false" aria-controls="stock-options-${id}">ⓘ</button>` : ""}
      </div>
    </div>${options ? renderStockOptions(id, name, options) : ""}`;
  }).join("");
  const { chemistry, treatment } = result;
  $("finalPH").textContent = chemistry.pH === null
    ? "Unavailable · enter " + chemistry.missing.join(" and ")
    : fmt(chemistry.pH, 2) + (chemistry.assumed ? " · assumed source data" : "");
  $("finalRA").innerHTML = fmt(residualAlk(fin)) + ' <small>mg/L as CaCO₃</small>';
  $("finalRatio").textContent = fin.SO4 != null && fin.Cl > 0 ? fmt(fin.SO4/fin.Cl,2)+" : 1" : "—";
  const items = [];
  if (solved && !solved.complete) {
    items.push({ style: "neutral", text: "Best recipe found within the search limit. A closer recipe may exist." });
  }
  if (treatment.status === "short" || treatment.status === "missing") {
    items.push({bad:true, text:treatmentText(treatment, result.volumes.sourceL)});
  }
  if (treatment.shortage > 0) {
    items.push({bad:true, text:"Shopping list · " + ingById(treatment.id).name + " · " +
      fmt(treatment.shortage, 3) + " " + treatment.unit});
  }
  const shortages = shortfalls(state, INGREDIENTS);
  if (shortages.length || treatment.shortage > 0) {
    items.unshift({bad:true, text:"Planned recipe needs more stock."});
  }
  for (const shortage of shortages) {
    const g = ingById(shortage.id);
    const amount = amountLabel(g, shortage.amount);
    items.push({bad:true, text:"Shopping list · " + g.name + " · " + amount});
  }
  if (checks.every(check => check.status === "in range")) {
    items.push({bad:false, text:"All evaluated values are within their targets."});
  }
  $("finalNotes").innerHTML = items.map(function(n){
    return '<li class="'+(n.style ?? (n.bad ? "" : "good"))+'">'+esc(n.text)+'</li>';
  }).join("");
  renderOptionalAdjustments(solved?.advice);
}

/* ================= rendering: drawer ================= */
function renderDrawer(){
  var html = "";
  INGREDIENTS.forEach(function(g){
    var d = S.drawer[g.id];
    var unitLabel = g.id==="distilled" ? S.unit : g.unit;
    html += '<div class="drow"><div class="dhead">'+
      '<label class="check"><input type="checkbox" data-d-owned="'+g.id+'" '+(d.owned?"checked":"")+'><span class="dname">'+esc(g.name)+'</span></label>'+
      '<span class="anote">'+esc(g.sub)+(g.inventoryOnly ? " · inventory only" : "")+'</span>'+
      (S.display.ingredientReferences ? referenceLink(g.source, g.name + " reference") : "")+'</div>'+
      (d.owned ? '<div class="dstock"><label class="lbl">On hand <input type="number" min="0" step="any" value="'+(g.id === "distilled" ? fmt(toVolumeDisplay(d.stock, S.unit), 4) : d.stock)+'" data-d-stock="'+g.id+'" '+(d.unlimited?"disabled":"")+'></label>'+
        '<span class="small">'+unitLabel+'</span>'+
        '<label class="check" style="font-weight:550"><input type="checkbox" data-d-unlim="'+g.id+'" '+(d.unlimited?"checked":"")+'> Unlimited</label></div>' : '')+
    '</div>';
  });
  $("drawerBody").innerHTML = html;
}

function applyAppearance() {
  const { appearance } = S.display;
  document.documentElement.dataset.appearance = appearance === "system"
    ? (systemAppearance.matches ? "dark" : "light") : appearance;
}

function renderAll(){
  applyAppearance();
  $("appearance").value = S.display.appearance;
  $("ingredientReferences").checked = S.display.ingredientReferences;
  $("batchInput").value = fmt(toVolumeDisplay(S.batchL, S.unit),6);
  $("batchUnit").textContent = S.unit;
  $("unitGal").setAttribute("aria-pressed", S.unit==="gal" ? "true":"false");
  $("unitL").setAttribute("aria-pressed", S.unit==="L" ? "true":"false");
  $("scaleStep").value = String(S.scaleStep);
  renderStart(); renderPresetSelect(); renderTarget(); renderAdds(); renderFinal(); renderDrawer();
}
function refreshComputed(){
  updateStartTiles(); renderFinal(); renderAdds();
}

/* ================= solver ================= */
function runSolver(state) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./solver-worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    }, { once: true });
    worker.addEventListener("error", () => {
      worker.terminate();
      reject(new Error("The calculation worker could not start."));
    }, { once: true });
    worker.postMessage(state);
  });
}

async function solve(){
  const button = $("solveBtn");
  button.disabled = true;
  $("solveStatus").textContent = "Calculating additions…";
  const inputRevision = revision;
  try {
    const solved = await runSolver(S);
    if (inputRevision !== revision) {
      $("solveStatus").textContent = "Inputs changed. Calculate again for the current recipe.";
      return;
    }
    const changed = JSON.stringify(S.adds) !== JSON.stringify(solved.adds);
    if (changed) {
      S.adds = solved.adds;
      recordChange();
    }
    lastSolve = solved;
    refreshComputed();
    $("solveStatus").textContent = "Additions calculated.";
  } catch (error) {
    $("solveStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

/* ================= drawer open/close ================= */
function openDrawer(){
  renderDrawer();
  $("drawer").classList.add("open"); $("backdrop").classList.add("open");
  document.querySelector(".wrap").inert = true;
  $("drawer").inert = false;
  $("drawer").setAttribute("aria-hidden","false");
  $("closeDrawerBtn").focus();
}
function closeDrawer(){
  $("drawer").classList.remove("open"); $("backdrop").classList.remove("open");
  $("drawer").setAttribute("aria-hidden","true");
  $("drawer").inert = true;
  document.querySelector(".wrap").inert = false;
  renderAdds(); renderFinal();
  $("openDrawerBtn").focus();
}

/* ================= download ================= */
function exportBackup(){
  var blob = new Blob([encodeBackup(S)], {type:"application/json"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = "water-chemistry-backup.json";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 400);
  toast("Backup exported");
}

async function importBackup(event){
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const sequence = ++importSequence;
  try {
    const data = decodeBackup(await file.text(), defaultState());
    if (sequence !== importSequence) return;
    S = data;
    recordChange({ persistNoop: true });
    renderAll();
    toast("Backup imported");
  } catch (error) {
    if (sequence === importSequence) toast("Import failed. " + error.message);
  }
}

/* ================= events ================= */
function keepDrawerFocus(input) {
  const attribute = [...input.attributes].find(a => a.name.startsWith("data-d-"));
  renderDrawer();
  if (attribute) $("drawerBody").querySelector("[" + attribute.name + '="' + attribute.value + '"]')?.focus();
}

function bind(){
  $("finalRows").addEventListener("click", event => {
    const button = event.target.closest("button[data-stock-options]");
    if (!button) return;
    const panel = $(button.getAttribute("aria-controls"));
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
  systemAppearance.addEventListener("change", applyAppearance);
  $("appearance").addEventListener("change", event => {
    S.display.appearance = event.target.value;
    recordChange({ displayOnly: true });
    applyAppearance();
  });
  $("ingredientReferences").addEventListener("change", event => {
    S.display.ingredientReferences = event.target.checked;
    recordChange({ displayOnly: true });
    renderDrawer();
  });
  $("undoBtn").addEventListener("click", () => restoreHistory("undo"));
  $("redoBtn").addEventListener("click", () => restoreHistory("redo"));
  document.addEventListener("input", event => {
    if (event.target.type === "number") revision++;
  });
  document.addEventListener("keydown", function(e){
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z") {
      const nativeEdit = e.target.closest?.("textarea, input:not([type=range]):not([type=checkbox]), [contenteditable]");
      if (!nativeEdit) {
        e.preventDefault();
        restoreHistory(e.shiftKey ? "redo" : "undo");
      }
    }
    if (e.key === "Escape" && preview) cancelPreview();
    if (!$("drawer").classList.contains("open")) return;
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Tab") {
      const controls = [...$("drawer").querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")];
      if (!controls.includes(document.activeElement)) {
        e.preventDefault(); (e.shiftKey ? controls.at(-1) : controls[0]).focus();
      } else if (e.shiftKey && document.activeElement === controls[0]) {
        e.preventDefault(); controls.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === controls.at(-1)) {
        e.preventDefault(); controls[0].focus();
      }
    }
  });
  $("exportBtn").addEventListener("click", exportBackup);
  $("importBtn").addEventListener("click", () => $("backupInput").click());
  $("backupInput").addEventListener("change", importBackup);
  $("solveBtn").addEventListener("click", solve);
  $("openDrawerBtn").addEventListener("click", openDrawer);
  $("closeDrawerBtn").addEventListener("click", closeDrawer);
  $("doneDrawerBtn").addEventListener("click", closeDrawer);
  function editDrawerItems(edit) {
    Object.values(S.drawer).forEach(edit);
    recordChange(); renderDrawer(); refreshComputed();
  }
  $("selectAll").addEventListener("click", () => editDrawerItems(item => { item.owned = true; }));
  $("deselectAll").addEventListener("click", () => editDrawerItems(item => {
    item.owned = false;
    item.unlimited = false;
  }));
  $("unlimitedSelected").addEventListener("click", () => editDrawerItems(item => {
    if (item.owned) item.unlimited = true;
  }));
  $("backdrop").addEventListener("click", closeDrawer);

  $("batchInput").addEventListener("change", function(){
    const v = this.valueAsNumber;
    const liters = fromVolumeDisplay(v, S.unit);
    if (!Number.isFinite(liters) || liters <= 0) {
      this.value = fmt(toVolumeDisplay(S.batchL, S.unit), 6);
      toast("Enter a batch volume greater than zero.");
      return;
    }
    S.batchL = liters;
    recordChange(); renderAll();
  });
  $("unitGal").addEventListener("click", function(){ if (S.unit!=="gal"){ S.unit="gal"; recordChange(); renderAll(); } });
  $("unitL").addEventListener("click", function(){ if (S.unit!=="L"){ S.unit="L"; recordChange(); renderAll(); } });
  $("scaleStep").addEventListener("change", function(){
    S.scaleStep = parseFloat(this.value) || 0.1; recordChange(); renderAdds();
  });

  /* starting water */
  function setSource(id) {
    const record = STARTS.find(p => p.id === id) ?? S.savedStarts.find(p => "saved:" + p.id === id);
    if (!record) return;
    S.start = structuredClone(record.profile);
    S.startId = id;
    S.startName = record.name;
    recordChange(); renderStart(); refreshComputed();
  }
  function editReport() {
    S.startId = "custom";
    S.startName = "Custom";
    recordChange(); renderStart(); refreshComputed();
  }
  function readReport(input, key) {
    if (input.validity.badInput || input.value !== "" && !input.validity.valid) {
      renderStart();
      toast("Enter a valid water report value.");
      return;
    }
    const value = input.value === "" ? null : input.valueAsNumber;
    const converted = key === "Alk" && S.start.alkBasis === "HCO3" ? alkAsCaCO3(value) : value;
    if (converted === S.start[key]) return;
    S.start[key] = converted;
    editReport();
  }
  $("sourceSelect").addEventListener("change", event => setSource(event.target.value));
  $("alkBasis").addEventListener("change", event => {
    S.start.alkBasis = event.target.value;
    recordChange(); renderStart();
  });
  $("startIons").addEventListener("change", event => readReport(event.target, event.target.dataset.report));
  $("start-Alk").addEventListener("change", event => readReport(event.target, "Alk"));
  $("chlorPpm").addEventListener("change", event => readReport(event.target, "chlorine"));
  $("chlorType").addEventListener("change", event => {
    S.start.chlorType = event.target.value;
    editReport();
  });
  $("chlorBasis").addEventListener("change", event => {
    S.start.chlorBasis = event.target.value || null;
    editReport();
  });
  $("saveStartBtn").addEventListener("click", () => {
    const input = $("saveStartName");
    const name = input.value.trim();
    if (!name) { toast("Give the profile a name first."); return; }
    const existing = S.savedStarts.find(p => p.name.toLowerCase() === name.toLowerCase());
    const profile = structuredClone(S.start);
    if (existing) existing.profile = profile;
    else S.savedStarts.push({ id: newId(), name, profile });
    const record = existing ?? S.savedStarts.at(-1);
    S.startId = "saved:" + record.id;
    S.startName = record.name;
    input.value = "";
    recordChange(); renderStart(); refreshComputed();
  });
  $("startChips").addEventListener("click", event => {
    const { applyStart, delStart } = event.target.dataset;
    if (applyStart) setSource("saved:" + applyStart);
    if (delStart) {
      S.savedStarts = S.savedStarts.filter(p => p.id !== delStart);
      if (S.startId === "saved:" + delStart) editReport();
      else { recordChange(); renderStart(); }
    }
  });

  /* target */
  function setTarget(id) {
    const preset = presetById(id) ?? S.customPresets.find(p => "custom:" + p.id === id);
    if (!preset) return;
    S.targetPreset = id;
    S.target = structuredClone(preset.target);
    recordChange(); renderPresetSelect(); renderTarget(); renderFinal();
  }
  $("presetSel").addEventListener("change", event => setTarget(event.target.value));
  $("savePresetBtn").addEventListener("click", () => {
    const name = $("savePresetName").value.trim();
    if (!name) { toast("Give the target a name first."); return; }
    const id = newId();
    S.customPresets.push({ id, name, kind: "Custom", blurb: $("savePresetNote").value.trim(), target: structuredClone(S.target) });
    S.targetPreset = "custom:" + id;
    $("savePresetName").value = ""; $("savePresetNote").value = "";
    recordChange(); renderPresetSelect();
  });
  $("presetChips").addEventListener("click", event => {
    const { applyPreset, delPreset } = event.target.dataset;
    if (applyPreset) setTarget("custom:" + applyPreset);
    if (delPreset) {
      S.customPresets = S.customPresets.filter(p => p.id !== delPreset);
      if (S.targetPreset === "custom:" + delPreset) S.targetPreset = "__customised";
      recordChange(); renderPresetSelect();
    }
  });
  function commitTargetEdit() {
    S.targetPreset = "__customised";
    recordChange(); renderPresetSelect(); renderTarget(); renderFinal();
  }
  $("pHTargetEnabled").addEventListener("change", event => {
    S.target.pH = event.target.checked ? { min: 5.5, ideal: 6, max: 7 } : null;
    commitTargetEdit();
  });
  $("targetRows").addEventListener("change", event => {
    const input = event.target;
    const { targetKey, targetBound } = input.dataset;
    if (!targetKey) return;
    const value = input.valueAsNumber;
    const range = { ...S.target[targetKey], [targetBound]: value };
    if (!input.validity.valid || !validTargetRange(targetKey, range)) {
      input.value = fmt(S.target[targetKey][targetBound], 5);
      const { min, max } = targetLimits(targetKey);
      const name = IONS.find(ion => ion.id === targetKey)?.name ?? "pH";
      const unit = targetKey === "pH" ? "" : " mg/L";
      toast(value < min || value > max
        ? name + " targets must be between " + min + " and " + max + unit + "."
        : "Enter a valid range with minimum ≤ preferred ≤ maximum.");
      return;
    }
    if (value === S.target[targetKey][targetBound]) return;
    S.target[targetKey] = range;
    commitTargetEdit();
  });

  /* additions */
  let preview;
  const list = $("addsList");
  list.addEventListener("click", event => {
    const id = event.target.dataset.clearDose;
    if (!id) return;
    S.adds[id] = 0;
    recordChange(); refreshComputed();
    $("openDrawerBtn").focus({ preventScroll: true });
  });
  function rawDose(input, g) {
    if (input.dataset.slider) return doseAt(doseGrid(S, g, Infinity), input.valueAsNumber);
    const value = Math.max(0, Number(input.value));
    return g.id === "distilled" ? fromVolumeDisplay(value, S.unit) : value;
  }
  function cancelPreview() {
    if (!preview) return;
    preview = undefined;
    refreshComputed();
  }
  list.addEventListener("input", event => {
    const input = event.target;
    const id = input.dataset.slider;
    if (!id) return;
    const g = ingById(id);
    if (preview !== input) {
      preview = input;
      revision++;
    }
    const amount = rawDose(input, g);
    const view = { ...S, adds: { ...S.adds, [id]: amount } };
    const row = input.closest(".addrow");
    row.querySelector("[data-amt]").value = id === "distilled" ? fmt(toVolumeDisplay(amount, S.unit), 6) : amount;
    const doseLabel = id === "distilled" ? dilutionLabel(g, amount) : amountLabel(g, amount);
    input.setAttribute("aria-valuetext", doseLabel);
    const readout = row.querySelector("[data-dilution-readout]");
    if (readout) {
      readout.textContent = doseLabel;
      readout.hidden = !doseLabel.includes("fl oz");
    }
    row.querySelector("[data-stock-warning]").hidden = amount - stockCap(g) <= 1e-9;
    input.style.background = sliderBG(amount / sliderMax(g), Math.min(1, stockCap(g) / sliderMax(g)));
    const treatment = list.querySelector("[data-treatment]");
    if (treatment) {
      const sourceL = sourceVolume(view);
      treatment.textContent = treatmentText(dechlorination(view, sourceL), sourceL);
    }
    updateStartTiles(view);
    renderFinal(view);
  });
  list.addEventListener("pointercancel", cancelPreview);
  list.addEventListener("pointerup", event => {
    const input = event.target;
    setTimeout(() => {
      if (preview === input) cancelPreview();
    }, 0);
  });
  list.addEventListener("change", event => {
    const input = event.target;
    const id = input.dataset.slider || input.dataset.amt;
    if (id) {
      preview = undefined;
      const g = ingById(id);
      const focused = document.activeElement === input;
      const unchanged = input.dataset.slider &&
        input.valueAsNumber === doseIndex(doseGrid(S, g, Infinity), S.adds[id]);
      const roundsToVolumeStep = id === "distilled" && input.validity.stepMismatch && input.valueAsNumber >= 0;
      if (!unchanged && (input.validity.valid || roundsToVolumeStep)) {
        const next = snapDose(S, g, rawDose(input, g));
        if (next !== S.adds[id]) {
          S.adds[id] = next;
          recordChange();
        }
      }
      refreshComputed();
      if (focused) {
        const selector = input.dataset.slider ? "data-slider" : "data-amt";
        list.querySelector("[" + selector + '="' + id + '"]')?.focus({ preventScroll: true });
      }
    }
    if (input.hasAttribute("data-dechlor-formulation")) {
      if (input.value !== "" && !input.validity.valid) { renderAdds(); toast("Enter a valid formulation."); return; }
      S.dechlor[S.dechlor.mode === "campden" ? "campdenMg" : "assayPercent"] = input.value === "" ? null : Number(input.value);
      recordChange(); refreshComputed();
    }
    if (input.hasAttribute("data-dechlor-mode")) {
      S.dechlor.enabled = input.value !== "skip";
      if (S.dechlor.enabled) S.dechlor.mode = input.value;
      recordChange(); refreshComputed();
      list.querySelector("[data-dechlor-mode]").focus({ preventScroll: true });
    }
  });

  /* drawer */
  $("drawerBody").addEventListener("change", event => {
    const input = event.target;
    const { dOwned, dUnlim, dStock } = input.dataset;
    if (dOwned || dUnlim) {
      const item = S.drawer[dOwned ?? dUnlim];
      if (dOwned) item.owned = input.checked;
      else item.unlimited = input.checked;
      recordChange();
      keepDrawerFocus(input);
      refreshComputed();
    }
    if (dStock) {
      const item = S.drawer[dStock];
      const dilution = dStock === "distilled";
      const quantity = Number(input.value);
      const stock = dilution ? fromVolumeDisplay(quantity, S.unit) : quantity;
      if (!input.validity.valid || !Number.isFinite(stock)) {
        input.value = dilution ? fmt(toVolumeDisplay(item.stock, S.unit), 6) : item.stock;
        toast("Enter a valid stock quantity.");
        return;
      }
      item.stock = stock;
      recordChange();
      refreshComputed();
    }
  });
}

/* ================= init ================= */
$("saveStatus").textContent = saveMessages[loaded.status];
bind();
renderAll();
