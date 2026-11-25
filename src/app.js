import { decodeBackup, encodeBackup, newId, readSave, writeSave } from './storage.js';
import { fromVolumeDisplay, toVolumeDisplay, alkAsCaCO3, alkAsBicarbonate } from './units.js';
import { INGREDIENTS, ingredientById as ingById } from './catalog.js';
import { diagnose } from './solver.js';
import { dechlorination } from './dechlorination.js';
import { evaluate, mixVolumes, usesDilution } from './evaluate.js';
import { stockCap as availableStock, doseMaximum, doseGrid, doseAt, doseIndex, snapDose, shortfalls } from './inventory.js';
import { IONS, STARTS, PRESETS, presetById, defaultState } from './data.js';

const getStorage = () => window.localStorage;
const loaded = readSave(getStorage, defaultState());
var S = loaded.state;
const saveMessages = {
  ready: "Changes save in this browser.",
  saved: "Saved in this browser.",
  migrated: "Prototype data migrated and saved.",
  unavailable: "Browser save unavailable. Export a backup to keep your changes."
};
let revision = 0;
let lastSolve = null;
function saveLS(){
  revision++;
  lastSolve = null;
  $("saveStatus").textContent = saveMessages[writeSave(getStorage, S) ? "saved" : "unavailable"];
}

/* ================= undo ================= */
var undoStack = [], lastPush = 0, restoring = false;
function snapshot(){
  return JSON.stringify(S);
}
function pushUndo(coalesce){
  if (restoring) return;
  var now = Date.now();
  if (coalesce && now - lastPush < 700) return;
  lastPush = now;
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  document.getElementById("undoBtn").disabled = false;
}
function undo(){
  if (!undoStack.length) return;
  var snap = JSON.parse(undoStack.pop());
  restoring = true;
  Object.keys(snap).forEach(function(k){ S[k] = snap[k]; });
  restoring = false;
  document.getElementById("undoBtn").disabled = !undoStack.length;
  saveLS(); renderAll();
  toast("Undone");
}

/* ================= helpers ================= */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
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
function sourceVolume(){ return mixVolumes(S).sourceL; }

/* stock caps, expressed in each ingredient's own unit */
function stockCap(g){ return availableStock(S, g.id); }
function sliderMax(g){ return doseMaximum(S, g); }

/* ================= chemistry ================= */
/* ================= rendering: starting ================= */
function renderStart(){
  const { start } = S;
  const bicarbonate = start.alkBasis === "HCO3";
  $("startIons").innerHTML = IONS.map(ion => {
    const name = ion.id === "Alk" ? (bicarbonate ? "Bicarbonate" : "Alkalinity") : ion.name;
    const value = ion.id === "Alk" && bicarbonate ? alkAsBicarbonate(start.Alk) : start[ion.id];
    return `<div class="ionfield">
      <label for="start-${ion.id}">${name} <span class="unit">(mg/L)</span></label>
      <input type="number" min="0" step="any" id="start-${ion.id}" data-report="${ion.id}" value="${value === null ? "" : fmt(value, 6)}">
    </div>`;
  }).join("") + `<div class="ionfield">
    <label for="start-pH">Source pH <span class="unit">(optional)</span></label>
    <input type="number" min="0" max="14" step="any" id="start-pH" data-report="pH" value="${start.pH ?? ""}">
  </div>`;
  $("alkBasis").value = start.alkBasis;
  $("startNameTag").textContent = S.startName;
  const starts = [...STARTS, ...S.savedStarts.map(profile => ({ ...profile, id: "saved:" + profile.id }))];
  $("sourceSelect").innerHTML = starts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("sourceSelect").value = S.startId;
  const source = STARTS.find(p => p.id === S.startId);
  $("sourceInfo").innerHTML = source ? esc(source.description) +
    (source.reference ? ` <a href="${source.reference}" rel="noopener" target="_blank">Source</a>` : "") : "";
  $("sourceInfo").hidden = !source;
  $("chlorPpm").value = start.chlorine ?? "";
  $("chlorType").value = start.chlorType;
  $("chlorBasis").value = start.chlorBasis ?? "";
  $("chlorBasis").options[2].textContent = start.chlorType === "chloramine" ? "As NH₂Cl" : "As HOCl";
  if (start.chlorType !== "none") $("disinfectant").open = true;
  $("startChips").innerHTML = S.savedStarts.map(p => `<span class="chip">
    <button type="button" class="apply" data-apply-start="${p.id}">${esc(p.name)}</button>
    <button type="button" data-del-start="${p.id}" aria-label="Delete ${esc(p.name)}">✕</button>
  </span>`).join("");
  updateStartTiles();
}
function updateStartTiles(){
  $("startAmt").innerHTML = volLabel(sourceVolume()) + ' <small>of ' + volLabel(S.batchL) + '</small>';
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
    (reference ? ` <a href="${reference}" rel="noopener" target="_blank">Reference</a>` : "") : "";
  $("presetChips").innerHTML = S.customPresets.map(saved => `<span class="chip">
    <button type="button" class="apply" data-apply-preset="${saved.id}">${esc(saved.name)}</button>
    <button type="button" data-del-preset="${saved.id}" aria-label="Delete ${esc(saved.name)}">✕</button>
  </span>`).join("");
}

function renderTarget(){
  $("pHTargetEnabled").checked = S.target.pH !== null;
  const ions = S.target.pH ? [...IONS, { id: "pH", name: "pH" }] : IONS;
  const headers = '<span></span><span class="lbl">Minimum</span><span class="lbl">Preferred</span><span class="lbl">Maximum</span>';
  $("targetRows").innerHTML = headers + ions.map(({ id, name }) => {
    const fields = Object.entries({ min: "minimum", ideal: "preferred", max: "maximum" }).map(([key, label]) =>
      `<input type="number" step="any" ${id === "Alk" ? "" : 'min="0"'} ${id === "pH" ? 'max="14"' : ""}
        aria-label="${name} target ${label}" data-target-key="${id}" data-target-bound="${key}"
        value="${fmt(S.target[id][key], 5)}">`
    ).join("");
    return `<span class="target-label">${name}</span>` + fields;
  }).join("");
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
function treatmentText(dose) {
  if (dose.status === "disabled") return "Treatment disabled.";
  if (dose.status === "none") return "No disinfectant dose required.";
  if (dose.status === "missing") return "Enter " + dose.missing.join(" and ") + " to calculate treatment.";
  return "For " + volLabel(sourceVolume()) + " of source water, the recipe includes " +
    dose.applied + " " + dose.unit + ". Required " + dose.required + " " + dose.unit + "." +
    (dose.status === "short" ? " Insufficient stock for full treatment." : "");
}

function renderAdds(){
  var html = "";
  var anyOwned = false;
  if (S.start.chlorType !== "none") {
    const dose = dechlorination(S, sourceVolume());
    const campden = S.dechlor.mode === "campden";
    html += `<div class="addrow">
      <div class="ahead"><label class="check"><input type="checkbox" data-dechlor-enabled ${S.dechlor.enabled ? "checked" : ""}> Dechlorination</label></div>
      <div class="mmrow"><label>Product <select data-dechlor-mode>
        <option value="kmeta" ${campden ? "" : "selected"}>Potassium metabisulfite powder</option>
        <option value="campden" ${campden ? "selected" : ""}>Potassium metabisulfite tablets</option>
      </select></label>
      <label>${campden ? "Active mg per tablet" : "Powder assay (%)"}
        <input type="number" min="0.01" ${campden ? "" : 'max="100"'} step="any"
          value="${(campden ? S.dechlor.campdenMg : S.dechlor.assayPercent) ?? ""}" data-dechlor-formulation>
      </label></div>
      <p data-treatment class="anote">${esc(treatmentText(dose))}</p>
    </div>`;
  }
  for (const g of INGREDIENTS) {
    const dilution = g.id === "distilled";
    if (g.inventoryOnly) {
      if (S.enabled[g.id] && S.adds[g.id] > 0) {
        html += `<div class="addrow">
          <label class="check"><input type="checkbox" data-enable="${g.id}" checked> ${g.name}</label>
          <p class="small">Legacy planned amount · ${amountLabel(g, S.adds[g.id])}. The model leaves its contribution unevaluated.</p>
        </div>`;
      }
      continue;
    }
    if (g.auto && !dilution || dilution && !usesDilution(S)) continue;
    const enabled = S.enabled[g.id];
    const planned = dilution ? Math.min(S.batchL, S.adds[g.id]) : S.adds[g.id];
    if (!S.drawer[g.id].owned && !(enabled && planned > 0)) continue;
    anyOwned = true;

    const max = sliderMax(g);
    const cap = stockCap(g);
    const stockFraction = max > 0 ? Math.min(1, cap / max) : 1;
    const grid = doseGrid(S, g, Infinity);
    const doseLabel = amountLabel(g, planned);
    const unit = dilution ? S.unit : g.unit;
    const displayed = dilution ? fmt(toVolumeDisplay(planned, S.unit), 6) : planned;
    html += `<div class="addrow${enabled ? "" : " disabled"}" data-addrow="${g.id}">
      <div class="ahead">
        <label class="check"><input type="checkbox" data-enable="${g.id}" ${enabled ? "checked" : ""} aria-label="Enable ${g.name}">
          <span class="aname">${g.name}</span></label>
        <span class="anote">${g.sub}</span>
        <label class="aamt"><input type="number" min="0" step="any" value="${displayed}"
          data-amt="${g.id}" ${enabled ? "" : "disabled"} aria-label="${g.name} amount">
          <span class="u">${unit}</span></label>
      </div>
      <input type="range" min="0" max="${grid.last}" step="1" value="${doseIndex(grid, planned)}"
        data-slider="${g.id}" ${enabled && grid.last ? "" : "disabled"} aria-label="${g.name} slider"
        aria-valuetext="${doseLabel}" style="background:${sliderBG(max > 0 ? Math.min(1, planned / max) : 0, stockFraction)}">
      <div class="ends"><span>${cap === Infinity ? "Unlimited stock" : "On hand · " + amountLabel(g, cap)}</span>
        <span>Batch maximum · ${amountLabel(g, max)}</span></div>
      <p class="warn" data-stock-warning ${enabled && planned - cap > 1e-9 ? "" : "hidden"}>This amount exceeds your stock.</p>
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
  return g.id === "distilled" ? volLabel(amount) : fmt(amount, 3) + " " + g.unit;
}

function diagnosticText(check) {
  if (check.difference === null || check.difference === 0) return check.status;
  const unit = check.key === "pH" ? "pH units" : "mg/L";
  return (check.difference < 0.01 ? "<0.01" : fmt(check.difference, 2)) + " " + unit + " " + check.status;
}

function renderFinal(){
  const result = evaluate(S);
  const fin = result.profile;
  const checks = diagnose(result, S.target);
  const statusByKey = new Map(checks.map(check => [check.key, check]));
  var html = "";
  IONS.forEach(function(ion){
    var t = S.target[ion.id], v = fin[ion.id], ceil = ion.ceil;
    var pct = function(x){ return Math.max(0, Math.min(100, x/ceil*100)); };
    const check = statusByKey.get(ion.id);
    const inR = check.status === "in range";
    html += '<div class="frow"><span class="fn">'+ion.name+'</span>'+
      '<div class="mini"><div class="shade" style="left:'+pct(t.min)+'%;width:'+(pct(t.max)-pct(t.min))+'%"></div>'+
      '<div class="idealmark" style="left:'+pct(t.ideal)+'%"></div>'+
      (v === null ? '' : '<div class="valmark" style="left:'+pct(v)+'%"></div>')+'</div>'+
      '<span class="fv">'+fmt(v, 2)+' <small class="'+(inR?"inrange":"outrange")+'">'+esc(diagnosticText(check))+'</small></span></div>';
  });
  $("finalRows").innerHTML = html;
  const { chemistry, treatment } = result;
  $("finalPH").textContent = chemistry.pH === null
    ? "Unavailable · enter " + chemistry.missing.join(" and ")
    : fmt(chemistry.pH, 2) + (chemistry.assumed ? " · assumed source data" : "");
  $("finalRA").innerHTML = fmt(residualAlk(fin)) + ' <small>ppm as CaCO₃</small>';
  $("finalRatio").textContent = fin.Cl > 0 ? fmt(fin.SO4/fin.Cl,2)+" : 1" : "—";
  const items = [];
  const phCheck = statusByKey.get("pH");
  if (phCheck) {
    items.push({bad:phCheck.status !== "in range", text:"pH target · " + diagnosticText(phCheck)});
  }
  if (lastSolve && !lastSolve.complete) {
    items.push({bad:false, text:"Best recipe found within the search limit. A closer recipe may exist."});
  }
  if (lastSolve?.shopping) {
    for (const purchase of lastSolve.shopping.purchases) {
      const g = ingById(purchase.id);
      items.push({bad:false, text:"Buying " + amountLabel(g, purchase.amount) + " of " + g.name +
        " could improve the target fit. The comparison used " + amountLabel(g, purchase.dose) + "."});
    }
  }
  if (treatment.status === "short" || treatment.status === "missing") {
    items.push({bad:true, text:treatmentText(treatment)});
  }
  if (treatment.shortage > 0) {
    items.push({bad:true, text:"Shopping list · " + ingById(treatment.id).name + " · " +
      fmt(treatment.shortage, 3) + " " + treatment.unit});
  }
  const shortages = shortfalls(S, INGREDIENTS);
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
    return '<li class="'+(n.bad?"":"good")+'">'+esc(n.text)+'</li>';
  }).join("");
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
      '<a class="small" aria-label="'+esc(g.name)+' reference" href="'+g.source+'" target="_blank" rel="noopener">Reference</a></div>'+
      (d.owned ? '<div class="dstock"><label class="lbl">On hand <input type="number" min="0" step="any" value="'+(g.id === "distilled" ? fmt(toVolumeDisplay(d.stock, S.unit), 4) : d.stock)+'" data-d-stock="'+g.id+'" '+(d.unlimited?"disabled":"")+'></label>'+
        '<span class="small">'+unitLabel+'</span>'+
        '<label class="check" style="font-weight:550"><input type="checkbox" data-d-unlim="'+g.id+'" '+(d.unlimited?"checked":"")+'> Unlimited</label></div>' : '')+
    '</div>';
  });
  $("drawerBody").innerHTML = html;
}

function renderAll(){
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
      pushUndo(false);
      S.adds = solved.adds;
      saveLS();
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
  try {
    const data = decodeBackup(await file.text(), defaultState());
    pushUndo(false);
    S = data;
    saveLS();
    renderAll();
    toast("Backup imported");
  } catch (error) {
    toast("Import failed. " + error.message);
  }
}

/* ================= events ================= */
function keepDrawerFocus(input) {
  const attribute = [...input.attributes].find(a => a.name.startsWith("data-d-"));
  renderDrawer();
  if (attribute) $("drawerBody").querySelector("[" + attribute.name + '="' + attribute.value + '"]')?.focus();
}

function bind(){
  $("undoBtn").addEventListener("click", undo);
  document.addEventListener("keydown", function(e){
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey){
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "TEXTAREA") return;
      e.preventDefault(); undo();
    }
    if (!$("drawer").classList.contains("open")) return;
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Tab") {
      const controls = [...$("drawer").querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")];
      if (e.shiftKey && document.activeElement === controls[0]) {
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
  $("deselectAll").addEventListener("click", () => {
    pushUndo(false);
    for (const item of Object.values(S.drawer)) {
      item.owned = false;
      item.unlimited = false;
    }
    saveLS(); renderDrawer(); refreshComputed();
  });
  $("backdrop").addEventListener("click", closeDrawer);

  $("batchInput").addEventListener("change", function(){
    pushUndo(false);
    const v = this.valueAsNumber;
    if (!Number.isFinite(v) || v <= 0) {
      this.value = fmt(toVolumeDisplay(S.batchL, S.unit), 6);
      toast("Enter a batch volume greater than zero.");
      return;
    }
    S.batchL = fromVolumeDisplay(v, S.unit);
    saveLS(); renderAll();
  });
  $("unitGal").addEventListener("click", function(){ if (S.unit!=="gal"){ pushUndo(false); S.unit="gal"; saveLS(); renderAll(); } });
  $("unitL").addEventListener("click", function(){ if (S.unit!=="L"){ pushUndo(false); S.unit="L"; saveLS(); renderAll(); } });
  $("scaleStep").addEventListener("change", function(){
    pushUndo(false); S.scaleStep = parseFloat(this.value) || 0.1; saveLS(); renderAdds();
  });

  /* starting water */
  function setSource(id) {
    const record = STARTS.find(p => p.id === id) ?? S.savedStarts.find(p => "saved:" + p.id === id);
    if (!record) return;
    pushUndo(false);
    S.start = structuredClone(record.profile);
    S.startId = id;
    S.startName = record.name;
    saveLS(); renderStart(); refreshComputed();
  }
  function editReport() {
    S.startId = "custom";
    S.startName = "Custom";
    saveLS(); renderStart(); refreshComputed();
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
    pushUndo(false);
    S.start[key] = converted;
    editReport();
  }
  $("sourceSelect").addEventListener("change", event => setSource(event.target.value));
  $("alkBasis").addEventListener("change", event => {
    pushUndo(false);
    S.start.alkBasis = event.target.value;
    saveLS(); renderStart();
  });
  $("startIons").addEventListener("change", event => readReport(event.target, event.target.dataset.report));
  $("chlorPpm").addEventListener("change", event => readReport(event.target, "chlorine"));
  $("chlorType").addEventListener("change", event => {
    pushUndo(false);
    S.start.chlorType = event.target.value;
    editReport();
  });
  $("chlorBasis").addEventListener("change", event => {
    pushUndo(false);
    S.start.chlorBasis = event.target.value || null;
    editReport();
  });
  $("saveStartBtn").addEventListener("click", () => {
    const input = $("saveStartName");
    const name = input.value.trim();
    if (!name) { toast("Give the profile a name first."); return; }
    pushUndo(false);
    const existing = S.savedStarts.find(p => p.name.toLowerCase() === name.toLowerCase());
    const profile = structuredClone(S.start);
    if (existing) existing.profile = profile;
    else S.savedStarts.push({ id: newId(), name, profile });
    const record = existing ?? S.savedStarts.at(-1);
    S.startId = "saved:" + record.id;
    S.startName = record.name;
    input.value = "";
    saveLS(); renderStart(); refreshComputed();
  });
  $("startChips").addEventListener("click", event => {
    const { applyStart, delStart } = event.target.dataset;
    if (applyStart) setSource("saved:" + applyStart);
    if (delStart) {
      pushUndo(false);
      S.savedStarts = S.savedStarts.filter(p => p.id !== delStart);
      if (S.startId === "saved:" + delStart) editReport();
      else { saveLS(); renderStart(); }
    }
  });

  /* target */
  function setTarget(id) {
    const preset = presetById(id) ?? S.customPresets.find(p => "custom:" + p.id === id);
    if (!preset) return;
    pushUndo(false);
    S.targetPreset = id;
    S.target = structuredClone(preset.target);
    saveLS(); renderPresetSelect(); renderTarget(); renderFinal();
  }
  $("presetSel").addEventListener("change", event => setTarget(event.target.value));
  $("savePresetBtn").addEventListener("click", () => {
    const name = $("savePresetName").value.trim();
    if (!name) { toast("Give the target a name first."); return; }
    pushUndo(false);
    const id = newId();
    S.customPresets.push({ id, name, kind: "Custom", blurb: $("savePresetNote").value.trim(), target: structuredClone(S.target) });
    S.targetPreset = "custom:" + id;
    $("savePresetName").value = ""; $("savePresetNote").value = "";
    saveLS(); renderPresetSelect();
  });
  $("presetChips").addEventListener("click", event => {
    const { applyPreset, delPreset } = event.target.dataset;
    if (applyPreset) setTarget("custom:" + applyPreset);
    if (delPreset) {
      pushUndo(false);
      S.customPresets = S.customPresets.filter(p => p.id !== delPreset);
      if (S.targetPreset === "custom:" + delPreset) S.targetPreset = "__customised";
      saveLS(); renderPresetSelect();
    }
  });
  function commitTargetEdit() {
    S.targetPreset = "__customised";
    saveLS(); renderPresetSelect(); renderTarget(); renderFinal();
  }
  $("pHTargetEnabled").addEventListener("change", event => {
    pushUndo(false);
    S.target.pH = event.target.checked ? { min: 5.5, ideal: 6, max: 7 } : null;
    commitTargetEdit();
  });
  $("targetRows").addEventListener("change", event => {
    const input = event.target;
    const { targetKey, targetBound } = input.dataset;
    if (!targetKey) return;
    const value = input.valueAsNumber;
    const range = { ...S.target[targetKey], [targetBound]: value };
    if (!input.validity.valid || !Number.isFinite(value) || range.min > range.ideal || range.ideal > range.max) {
      input.value = fmt(S.target[targetKey][targetBound], 5);
      toast("Enter a valid range with minimum ≤ preferred ≤ maximum.");
      return;
    }
    if (value === S.target[targetKey][targetBound]) return;
    pushUndo(false);
    S.target[targetKey] = range;
    commitTargetEdit();
  });

  /* additions */
  let preview;
  const list = $("addsList");
  function rawDose(input, id) {
    const value = Math.max(0, Number(input.value));
    if (input.dataset.slider) return doseAt(doseGrid(S, ingById(id), Infinity), value);
    return id === "distilled" ? fromVolumeDisplay(value, S.unit) : value;
  }
  list.addEventListener("input", event => {
    const input = event.target;
    const id = input.dataset.slider;
    if (!id) return;
    const g = ingById(id);
    if (!preview) {
      preview = { id, original: S.adds[id] };
      revision++;
    }
    const amount = configPreviewDose(g, rawDose(input, id));
    S.adds[id] = amount;
    const row = input.closest(".addrow");
    row.querySelector("[data-amt]").value = id === "distilled" ? fmt(toVolumeDisplay(amount, S.unit), 6) : amount;
    input.setAttribute("aria-valuetext", amountLabel(g, amount));
    row.querySelector("[data-stock-warning]").hidden = rawDose(input, id) <= stockCap(g);
    input.style.background = sliderBG(amount / sliderMax(g), Math.min(1, stockCap(g) / sliderMax(g)));
    const treatment = list.querySelector("[data-treatment]");
    if (treatment) treatment.textContent = treatmentText(dechlorination(S, sourceVolume()));
    updateStartTiles(); renderFinal();
  });
  function configPreviewDose(g, amount) {
    return snapDose(S, g, amount, Infinity);
  }
  list.addEventListener("pointercancel", () => {
    if (!preview) return;
    S.adds[preview.id] = preview.original;
    preview = undefined;
    refreshComputed();
  });
  list.addEventListener("change", event => {
    const input = event.target;
    const id = input.dataset.slider || input.dataset.amt;
    if (id) {
      if (preview) S.adds[preview.id] = preview.original;
      preview = undefined;
      const next = snapDose(S, ingById(id), rawDose(input, id));
      if (next !== S.adds[id]) {
        pushUndo(false);
        S.adds[id] = next;
        saveLS();
      }
      refreshComputed();
      list.querySelector(input.hasAttribute("data-slider") ? '[data-slider="' + id + '"]' : '[data-amt="' + id + '"]')?.focus();
    }
    if (input.dataset.enable) {
      pushUndo(false); S.enabled[input.dataset.enable] = input.checked; saveLS(); refreshComputed();
    }
    if (input.hasAttribute("data-dechlor-enabled")) {
      pushUndo(false); S.dechlor.enabled = input.checked; saveLS(); refreshComputed();
    }
    if (input.hasAttribute("data-dechlor-formulation")) {
      if (input.value !== "" && !input.validity.valid) { renderAdds(); toast("Enter a valid formulation."); return; }
      pushUndo(false);
      S.dechlor[S.dechlor.mode === "campden" ? "campdenMg" : "assayPercent"] = input.value === "" ? null : Number(input.value);
      saveLS(); refreshComputed();
    }
    if (input.hasAttribute("data-dechlor-mode")) {
      pushUndo(false); S.dechlor.mode = input.value; saveLS(); refreshComputed();
    }
  });

  /* drawer */
  $("drawerBody").addEventListener("change", function(e){
    var t = e.target, id;
    if ((id = t.getAttribute("data-d-owned"))){ pushUndo(false); S.drawer[id].owned = t.checked; saveLS(); keepDrawerFocus(t); renderAdds(); renderFinal(); }
    else if ((id = t.getAttribute("data-d-unlim"))){ pushUndo(false); S.drawer[id].unlimited = t.checked; saveLS(); keepDrawerFocus(t); renderAdds(); }
    else if ((id = t.getAttribute("data-d-stock"))){ pushUndo(false); S.drawer[id].stock = id === "distilled" ? fromVolumeDisplay(Math.max(0, Number(t.value)||0), S.unit) : Math.max(0, Number(t.value)||0); saveLS(); renderAdds(); renderFinal(); }
  });
}

/* ================= init ================= */
$("saveStatus").textContent = saveMessages[loaded.status];
bind();
renderAll();
