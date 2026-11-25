import { decodeBackup, encodeBackup, newId, readSave, writeSave } from './storage.js';
/* ================= data ================= */
import { gallonsToLiters, litersToGallons, fromVolumeDisplay, toVolumeDisplay, alkAsCaCO3 } from './units.js';
import { INGREDIENTS, ingredientById as ingById } from './catalog.js';
import { evaluate, effectiveDose, mixVolumes } from './evaluate.js';
import { IONS, ionById, PRESETS, presetById, defaultState } from './data.js';

const getStorage = () => window.localStorage;
const loaded = readSave(getStorage, defaultState());
var S = loaded.state;
const saveMessages = {
  ready: "Changes save in this browser.",
  saved: "Saved in this browser.",
  migrated: "Prototype data migrated and saved.",
  unavailable: "Browser save unavailable. Export a backup to keep your changes."
};
function saveLS(){
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
function volLabel(liters){ return fmt(toVolumeDisplay(liters, S.unit), 2) + " " + S.unit; }
function snapAmt(v, unit){
  if (unit==="g") { var st = S.scaleStep; return Math.round(v/st)*st; }
  if (unit==="mL") return Math.round(v*10)/10;
  if (unit==="tablets") return Math.ceil(v);
  return Math.round(v*20)/20;
}
var toastTimer = null;
function toast(msg){
  var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2400);
}
function residualAlk(profile){
  return [profile.HCO3, profile.Ca, profile.Mg].every(Number.isFinite)
    ? alkAsCaCO3(profile.HCO3) - (profile.Ca/1.4 + profile.Mg/1.7) : null;
}
function sourceVolume(){ return mixVolumes(S).sourceL; }

/* stock caps, expressed in each ingredient's own unit */
function stockCap(g){
  var d = S.drawer[g.id];
  if (!d || !d.owned) return 0;
  if (d.unlimited) return Infinity;
  return Math.max(0, d.stock||0);
}
function sliderMax(g){
  if (g.auto) return 0;
  return g.maxPerGal * litersToGallons(S.batchL);
}

/* ================= chemistry ================= */
function computeFinal(){
  return evaluate(S, INGREDIENTS, IONS.map(ion => ion.id)).profile;
}
function estimatePH(fin){
  /* Carbonate-equilibrium estimate for the water itself (not mash pH):
     infer dissolved CO2 from the starting water, acids convert HCO3- to CO2. */
  var startHCO3mmol = S.start.HCO3/61;
  var startPH = S.start.pH || 7;
  var co2;
  if (startHCO3mmol > 0.02){
    co2 = startHCO3mmol / Math.pow(10, startPH - 6.35);
  } else {
    co2 = 0.015;
  }
  /* acid/base equivalents added, meq/L */
  let acidMeqPerL = 0;
  const equivalents = {lactic:3.09, phosphoric:3.35, citric:2.30, nahco3:-3.13, khco3:-2.64, chalk:-2.64, lime:-7.13};
  for (const [id, value] of Object.entries(equivalents)) {
    acidMeqPerL += effectiveDose(S, id) * value / S.batchL;
  }
  var finHCO3mmol = fin.HCO3/61;
  var converted = Math.max(0, acidMeqPerL); /* mmol/L of HCO3 turned into CO2 by acid */
  var co2f = Math.max(0.004, co2 + converted*0.5 - Math.max(0,-acidMeqPerL)*0.3);
  var baseHCO3 = finHCO3mmol;
  if (startHCO3mmol <= 0.02 && baseHCO3 <= 0.02){
    var ph0 = startPH - acidMeqPerL*0.35;
    return Math.min(9.5, Math.max(4.0, ph0));
  }
  if (baseHCO3 <= 0.005) return 4.3;
  var ph = 6.35 + Math.log(baseHCO3/co2f)/Math.LN10;
  return Math.min(9.5, Math.max(4.0, ph));
}
function dechlorDose(){
  var cl = S.start.chlorine||0;
  if (!cl || S.start.chlorType==="none") return null;
  var mult = Math.max(1, cl/3);
  if (S.dechlor.mode==="campden"){
    return {kind:"campden", tablets: Math.ceil(litersToGallons(S.batchL)/20 * mult), label:""};
  }
  var mg = S.dechlor.rateMgGal * litersToGallons(S.batchL) * mult;
  return {kind:"kmeta", mg: mg, grams: mg/1000, label:""};
}

/* ================= rendering: starting ================= */
function renderStart(){
  var html = "";
  IONS.forEach(function(ion){
    html += '<div class="ionfield"><label for="start-'+ion.id+'">'+ion.name+' <span class="unit">(ppm)</span></label>'+
      '<input type="number" min="0" step="1" id="start-'+ion.id+'" data-ion="'+ion.id+'" value="'+(S.start[ion.id] ?? "")+'"></div>';
  });
  html += '<div class="ionfield"><label for="start-pH">pH</label>'+
    '<input type="number" min="3" max="10" step="0.1" id="start-pH" value="'+(S.start.pH ?? "")+'"></div>';
  $("startIons").innerHTML = html;
  $("startNameTag").textContent = S.startName;
  $("chlorPpm").value = S.start.chlorine;
  $("chlorType").value = S.start.chlorType;
  var chips = '<span class="chip"><button type="button" class="apply" data-apply-start="-1">Distilled</button></span>';
  S.savedStarts.forEach(function(p, idx){
    chips += '<span class="chip"><button type="button" class="apply" data-apply-start="'+p.id+'">'+esc(p.name)+'</button>'+
      '<button type="button" data-del-start="'+p.id+'" aria-label="Delete '+esc(p.name)+'">✕</button></span>';
  });
  $("startChips").innerHTML = chips;
  updateStartTiles();
}
function updateStartTiles(){
  $("startAmt").innerHTML = volLabel(sourceVolume()) + ' <small>of '+volLabel(S.batchL)+'</small>';
  $("startAlk").innerHTML = fmt(alkAsCaCO3(S.start.HCO3)) + ' <small>ppm</small>';
  $("startRA").innerHTML = fmt(residualAlk(S.start)) + ' <small>ppm as CaCO₃</small>';
}

/* ================= rendering: target ================= */
function currentPresetObj(){
  var p = presetById(S.targetPreset);
  if (p) return p;
  for (var i=0;i<S.customPresets.length;i++) if ("custom:"+S.customPresets[i].id === S.targetPreset) return S.customPresets[i];
  return null;
}
function renderPresetSelect(){
  var html = "";
  PRESETS.forEach(function(p){ html += '<option value="'+p.id+'">'+esc(p.name)+' ('+p.kind+')</option>'; });
  S.customPresets.forEach(function(p, i){ html += '<option value="custom:'+p.id+'">'+esc(p.name)+' (Custom)</option>'; });
  html += '<option value="__customised">Customised ranges</option>';
  $("presetSel").innerHTML = html;
  $("presetSel").value = S.targetPreset;
  var p = currentPresetObj();
  $("presetInfo").innerHTML = p
    ? '<h3>'+esc(p.name)+' <span class="tag">'+esc(p.kind||"Custom")+'</span></h3><p>'+esc(p.blurb||"")+'</p>'
    : '<h3>Customised ranges</h3><p>You have adjusted the ranges by hand. Save them as a custom preset to reuse them.</p>';
  var chips = "";
  S.customPresets.forEach(function(cp, i){
    chips += '<span class="chip"><button type="button" class="apply" data-apply-preset="'+cp.id+'">'+esc(cp.name)+'</button>'+
      '<button type="button" data-del-preset="'+cp.id+'" aria-label="Delete '+esc(cp.name)+'">✕</button></span>';
  });
  $("presetChips").innerHTML = chips;
}
function renderTarget(fin){
  fin = fin || computeFinal();
  var html = "";
  IONS.forEach(function(ion){
    var t = S.target[ion.id], v = fin[ion.id], ceil = ion.ceil;
    var pct = function(x){ return Math.max(0, Math.min(100, x/ceil*100)); };
    var inR = v !== null && v >= t.min && v <= t.max;
    html += '<div class="trow" data-ion="'+ion.id+'">'+
      '<div class="thead"><span class="tname">'+ion.name+' <span class="tiny">'+ion.sym+'</span></span>'+
      '<span class="tval">now <b>'+fmt(v)+'</b> ppm · <span class="'+(inR?"inrange":"outrange")+'">'+(v === null ? "missing source value" : inR ? "in range" : "out of range")+'</span></span></div>'+
      '<div class="bar"><div class="shade" style="left:'+pct(t.min)+'%;width:'+(pct(t.max)-pct(t.min))+'%"></div>'+
      '<div class="idealmark" style="left:'+pct(t.ideal)+'%"></div>'+
      '<div class="valmark" style="left:'+pct(v)+'%"></div>'+
      '<div class="ends"><span>0</span><span>'+ceil+' ppm</span></div></div>'+
      '<div class="dual">'+
        '<input type="range" min="0" max="'+ceil+'" step="1" value="'+t.min+'" data-tmin="'+ion.id+'" aria-label="'+ion.name+' target minimum">'+
        '<input type="range" min="0" max="'+ceil+'" step="1" value="'+t.max+'" data-tmax="'+ion.id+'" aria-label="'+ion.name+' target maximum">'+
      '</div>'+
      '<div class="mmrow"><label>Min <input type="number" min="0" max="'+ceil+'" step="1" value="'+fmt(t.min)+'" data-tminn="'+ion.id+'"></label>'+
      '<label>Max <input type="number" min="0" max="'+ceil+'" step="1" value="'+fmt(t.max)+'" data-tmaxn="'+ion.id+'"></label></div>'+
      '<div class="idealrow"><label for="ideal-'+ion.id+'">Ideal</label>'+
      '<input type="range" min="0" max="'+ceil+'" step="1" value="'+t.ideal+'" data-tideal="'+ion.id+'" id="ideal-'+ion.id+'">'+
      '<input type="number" min="0" max="'+ceil+'" step="1" value="'+fmt(t.ideal)+'" data-tidealn="'+ion.id+'"></div>'+
    '</div>';
  });
  $("targetRows").innerHTML = html;
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
function renderAdds(){
  var html = "";
  var anyOwned = false;
  /* dechlorination auto row first when relevant */
  var dose = dechlorDose();
  if (dose){
    var gId = dose.kind==="campden" ? "campden" : "kmeta";
    var g = ingById(gId), d = S.drawer[gId];
    var owned = d && d.owned;
    var need = dose.kind==="campden" ? dose.tablets : dose.mg;
    var cap = stockCap(g);
    var short = owned && cap < need;
    html += '<div class="addrow'+(owned?"":" disabled")+'"><div class="ahead">'+
      '<label class="check"><input type="checkbox" data-dechlor-enabled '+(S.dechlor.enabled?"checked":"")+(owned?"":" disabled")+'> '+
      '<span class="aname">'+esc(g.name)+'</span></label> <span class="tag">auto dose</span></div>'+
      '<p class="anote" style="margin:6px 0 0">For '+(fmt(S.start.chlorine,1))+' ppm '+esc(S.start.chlorType)+' in '+volLabel(S.batchL)+': '+
      (dose.kind==="campden" ? '<b>'+dose.tablets+' tablet'+(dose.tablets===1?"":"s")+'</b> (crush, stir in, wait a few minutes)'
                             : '<b>'+fmt(dose.mg)+' mg</b> ('+fmt(dose.grams,2)+' g) at '+fmt(S.dechlor.rateMgGal)+' mg/gal')+
      (owned ? (d.unlimited ? ' · unlimited in drawer' : ' · you have '+fmt(cap, dose.kind==="campden"?0:1)+' '+g.unit) : ' · not in your drawer')+'</p>'+
      (short ? '<p class="warn">You don’t have enough in the drawer for a full dose — get more before brew day.</p>' : '')+
      (!owned ? '<p class="warn">Add it in the Ingredient Drawer to use automatic dechlorination.</p>' : '')+
      '<div class="mmrow"><label>Method '+
      '<select data-dechlor-mode><option value="kmeta"'+(S.dechlor.mode==="kmeta"?" selected":"")+'>Potassium metabisulfite</option>'+
      '<option value="campden"'+(S.dechlor.mode==="campden"?" selected":"")+'>Campden tablets</option></select></label>'+
      (S.dechlor.mode==="kmeta" ? '<label>K-meta rate (mg/gal) <input type="number" min="5" max="120" step="1" value="'+fmt(S.dechlor.rateMgGal)+'" data-dechlor-rate></label>' : '')+
      '</div></div>';
    if (owned) anyOwned = true;
  }
  if (!dose){
    html += '<div class="addrow disabled"><div class="ahead"><span class="aname">Dechlorination</span>'+
      '<span class="anote">potassium metabisulfite or Campden tablets</span></div>'+
      '<p class="anote" style="margin:6px 0 0">Set a chlorine or chloramine level in Starting Water and the dose is worked out here automatically, using whichever you have in the drawer.</p></div>';
  }
  INGREDIENTS.forEach(function(g){
    if (g.auto || g.inventoryOnly) return;
    var d = S.drawer[g.id];
    if (!d || !d.owned){
      html += '<div class="addrow disabled"><div class="ahead">'+
        '<span class="aname">'+esc(g.name)+'</span>'+
        '<span class="anote">'+esc(g.sub)+'</span></div>'+
        '<p class="anote" style="margin:6px 0 0">Not in your Ingredient Drawer — open the drawer and tick it to dose with it.</p></div>';
      return;
    }
    anyOwned = true;
    var max = sliderMax(g), amt = S.adds[g.id]||0;
    var cap = stockCap(g);
    var stockFrac = (cap===Infinity || max<=0) ? 1 : Math.max(0, Math.min(1, cap/max));
    var en = S.enabled[g.id];
    var step = g.unit==="g" ? Math.max(g.step, S.scaleStep) : g.step;
    html += '<div class="addrow'+(en?"":" disabled")+'" data-addrow="'+g.id+'"><div class="ahead">'+
      '<label class="check"><input type="checkbox" data-enable="'+g.id+'" '+(en?"checked":"")+' aria-label="Enable '+esc(g.name)+'">'+
      '<span class="aname">'+esc(g.name)+'</span></label>'+
      '<span class="anote">'+esc(g.sub)+'</span>'+
      '<span class="aamt"><input type="number" min="0" step="'+step+'" value="'+fmt(amt, g.unit==="g"?2:1)+'" data-amt="'+g.id+'" '+(en?"":"disabled")+' aria-label="'+esc(g.name)+' amount">'+
      '<span class="u">'+g.unit+'</span></span></div>'+
      '<input type="range" min="0" max="'+fmt(max,2)+'" step="'+step+'" value="'+amt+'" data-slider="'+g.id+'" '+(en?"":"disabled")+
        ' style="background:'+sliderBG(max>0?amt/max:0, stockFrac)+'" aria-label="'+esc(g.name)+' slider">'+
      '<div class="ends"><span>0</span><span>'+(cap===Infinity ? 'on hand: unlimited' : 'on hand: '+fmt(cap, g.unit==="g"?1:0)+' '+g.unit)+' · max '+fmt(max,1)+' '+g.unit+'</span></div>'+
      (cap!==Infinity && amt > cap ? '<p class="warn">That’s more than the '+fmt(cap,1)+' '+g.unit+' in your drawer — the solver will cap it there.</p>' : '')+
    '</div>';
  });
  /* distilled water row */
  (function(){
    var g = ingById("distilled"), d = S.drawer.distilled;
    if (!d || !d.owned){
      html += '<div class="addrow disabled"><div class="ahead"><span class="aname">Distilled Water</span>'+
        '<span class="anote">dilutes the starting water</span></div>'+
        '<p class="anote" style="margin:6px 0 0">Not in your Ingredient Drawer — open the drawer and tick it to dilute with it.</p></div>';
      return;
    }
    anyOwned = true;
    var amtGal = S.adds.distilled||0;
    var dispAmt = toVolumeDisplay(amtGal, S.unit);
    var maxDisp = toVolumeDisplay(S.batchL, S.unit);
    var capGal = stockCap(g);
    var stockFrac = capGal===Infinity ? 1 : Math.max(0, Math.min(1, capGal/S.batchL));
    var en = S.enabled.distilled;
    html += '<div class="addrow'+(en?"":" disabled")+'"><div class="ahead">'+
      '<label class="check"><input type="checkbox" data-enable="distilled" '+(en?"checked":"")+'><span class="aname">Distilled Water</span></label>'+
      '<span class="anote">dilutes the starting water; starting amount fills in automatically</span>'+
      '<span class="aamt"><input type="number" min="0" step="0.25" value="'+fmt(dispAmt,2)+'" data-amt="distilled" '+(en?"":"disabled")+' aria-label="Distilled water amount">'+
      '<span class="u">'+(S.unit==="gal"?"gal":"L")+'</span></span></div>'+
      '<input type="range" min="0" max="'+fmt(maxDisp,2)+'" step="'+(S.unit==="gal"?0.25:0.5)+'" value="'+fmt(dispAmt,2)+'" data-slider="distilled" '+(en?"":"disabled")+
        ' style="background:'+sliderBG(S.batchL>0?amtGal/S.batchL:0, stockFrac)+'" aria-label="Distilled water slider">'+
      '<div class="ends"><span>0</span><span>starting water: '+volLabel(sourceVolume())+' · distilled: '+volLabel(amtGal)+'</span></div>'+
      (capGal!==Infinity && amtGal > capGal ? '<p class="warn">That’s more distilled water than the '+volLabel(capGal)+' in your drawer.</p>' : '')+
    '</div>';
  })();
  if (!anyOwned){
    html += '<p class="small">Nothing is in your Ingredient Drawer yet. Open it and tick what you own — salts, acids and distilled water — and they’ll appear here as sliders.</p>';
  }
  $("addsList").innerHTML = html;
  var count = 0;
  INGREDIENTS.forEach(function(g){ if (S.drawer[g.id] && S.drawer[g.id].owned) count++; });
  $("drawerCount").textContent = count;
}

/* ================= rendering: final ================= */
function renderFinal(fin, notes){
  fin = fin || computeFinal();
  var html = "";
  IONS.forEach(function(ion){
    var t = S.target[ion.id], v = fin[ion.id], ceil = ion.ceil;
    var pct = function(x){ return Math.max(0, Math.min(100, x/ceil*100)); };
    var inR = v !== null && v >= t.min && v <= t.max;
    html += '<div class="frow"><span class="fn">'+ion.name+'</span>'+
      '<div class="mini"><div class="shade" style="left:'+pct(t.min)+'%;width:'+(pct(t.max)-pct(t.min))+'%"></div>'+
      '<div class="idealmark" style="left:'+pct(t.ideal)+'%"></div><div class="valmark" style="left:'+pct(v)+'%"></div></div>'+
      '<span class="fv">'+fmt(v)+' <small class="'+(inR?"inrange":"outrange")+'">target '+fmt(t.min)+'–'+fmt(t.max)+'</small></span></div>';
  });
  $("finalRows").innerHTML = html;
  $("finalPH").innerHTML = fmt(estimatePH(fin),1) + ' <small>est.</small>';
  $("finalRA").innerHTML = fmt(residualAlk(fin)) + ' <small>ppm as CaCO₃</small>';
  $("finalRatio").textContent = fin.Cl > 0 ? fmt(fin.SO4/fin.Cl,2)+" : 1" : "—";
  var dose = dechlorDose();
  var items = [];
  if (notes) items = notes.slice();
  if (dose && S.dechlor.enabled){
    var gId = dose.kind==="campden" ? "campden" : "kmeta";
    var cap = stockCap(ingById(gId));
    var need = dose.kind==="campden" ? dose.tablets : dose.mg;
    if (!S.drawer[gId].owned) items.push({bad:true, text:"Your starting water is "+S.start.chlorType+"-treated but "+ingById(gId).name+" isn’t in your drawer — the chlorine/chloramine won’t be removed."});
    else if (cap < need) items.push({bad:true, text:"Dechlorination needs "+(dose.kind==="campden" ? dose.tablets+" Campden tablets" : fmt(dose.mg)+" mg potassium metabisulfite")+" but your drawer has less — get more before brew day."});
    else items.push({bad:false, text:"Dechlorination dose included above: "+(dose.kind==="campden" ? dose.tablets+" Campden tablet"+(dose.tablets===1?"":"s") : fmt(dose.mg)+" mg potassium metabisulfite")+" for "+fmt(S.start.chlorine,1)+" ppm "+S.start.chlorType+"."});
  }
  var allIn = IONS.every(function(ion){ var t=S.target[ion.id]; return fin[ion.id]>=t.min && fin[ion.id]<=t.max; });
  if (allIn && !items.some(function(n){return n.bad;})) items.push({bad:false, text:"Every ion is inside its target range."});
  $("finalNotes").innerHTML = items.map(function(n){
    return '<li class="'+(n.bad?"":"good")+'">'+esc(n.text)+'</li>';
  }).join("");
}

/* ================= rendering: drawer ================= */
function renderDrawer(){
  var html = "";
  INGREDIENTS.forEach(function(g){
    var d = S.drawer[g.id];
    var unitLabel = g.id==="distilled" ? "gal" : g.unit;
    html += '<div class="drow"><div class="dhead">'+
      '<label class="check"><input type="checkbox" data-d-owned="'+g.id+'" '+(d.owned?"checked":"")+'><span class="dname">'+esc(g.name)+'</span></label>'+
      '<span class="anote">'+esc(g.sub)+'</span></div>'+
      (d.owned ? '<div class="dstock"><label class="lbl">On hand <input type="number" min="0" step="any" value="'+(g.id === "distilled" ? fmt(toVolumeDisplay(d.stock, S.unit), 4) : d.stock)+'" data-d-stock="'+g.id+'" '+(d.unlimited?"disabled":"")+'></label>'+
        '<span class="small">'+unitLabel+'</span>'+
        '<label class="check" style="font-weight:550"><input type="checkbox" data-d-unlim="'+g.id+'" '+(d.unlimited?"checked":"")+'> Unlimited</label></div>' : '')+
    '</div>';
  });
  $("drawerBody").innerHTML = html;
}

function renderAll(){
  $("batchInput").value = fmt(toVolumeDisplay(S.batchL, S.unit),2);
  $("unitGal").setAttribute("aria-pressed", S.unit==="gal" ? "true":"false");
  $("unitL").setAttribute("aria-pressed", S.unit==="L" ? "true":"false");
  $("scaleStep").value = String(S.scaleStep);
  renderStart(); renderPresetSelect(); renderTarget(); renderAdds(); renderFinal(); renderDrawer();
}
function refreshComputed(){
  updateStartTiles(); renderTarget(); renderFinal(); renderAdds();
}

/* ================= solver ================= */
function objective(fin){
  var err = 0;
  IONS.forEach(function(ion){
    var t = S.target[ion.id], v = fin[ion.id];
    if (v === null) return;
    var width = Math.max(10, t.max - t.min);
    if (v < t.min) err += Math.pow((t.min - v)/width, 2) * 4;
    else if (v > t.max) err += Math.pow((v - t.max)/width, 2) * 4;
    err += Math.pow((v - t.ideal)/Math.max(width, ion.ceil/4), 2) * 0.35;
  });
  return err;
}
function solve(){
  pushUndo(false);
  var vars = [];
  if (S.enabled.distilled && S.drawer.distilled.owned){
    vars.push({id:"distilled", max: Math.min(S.batchL, stockCap(ingById("distilled")))});
  }
  INGREDIENTS.forEach(function(g){
    if (!g.mass) return;
    if (!S.enabled[g.id] || !S.drawer[g.id].owned) return;
    vars.push({id:g.id, max: Math.min(sliderMax(g), stockCap(g))});
  });
  vars.forEach(function(v){ v.max = isFinite(v.max) ? v.max : sliderMax(ingById(v.id)) || S.batchL; if (v.id==="distilled" && !isFinite(v.max)) v.max = S.batchL; });
  // Start with a feasible recipe before evaluating any candidates.
  INGREDIENTS.forEach(g => {
    if (!S.enabled[g.id] || !g.mass && g.id !== "distilled") return;
    const bound = vars.find(v => v.id === g.id)?.max ?? 0;
    S.adds[g.id] = Math.min(S.adds[g.id], bound);
  });
  function cur(){ return objective(computeFinal()); }
  var best = cur();
  var fracs = [0.35, 0.18, 0.08, 0.03, 0.012];
  fracs.forEach(function(f){
    vars.forEach(function(v){
      var step = Math.max(v.max * f, v.id==="distilled" ? 0.05 : (ingById(v.id).unit==="g" ? S.scaleStep : 0.05));
      var guard = 0;
      while (guard++ < 60){
        var amt = S.adds[v.id]||0, improved = false;
        [step, -step].forEach(function(ds){
          var nv = amt + ds;
          if (nv < 0 || nv > v.max + 1e-9) return;
          S.adds[v.id] = nv;
          var o = cur();
          if (o < best - 1e-9){ best = o; amt = nv; improved = true; }
          else S.adds[v.id] = amt;
        });
        if (!improved) break;
      }
    });
  });
  /* snap to measurable increments */
  vars.forEach(function(v){
    var g = ingById(v.id);
    var snapped = v.id==="distilled" ? (S.adds[v.id] >= S.batchL - 1e-9 ? S.batchL : Math.round(S.adds[v.id]/gallonsToLiters(0.25))*gallonsToLiters(0.25)) : snapAmt(S.adds[v.id]||0, g.unit);
    S.adds[v.id] = Math.max(0, Math.min(isFinite(v.max)?v.max:snapped, snapped));
  });
  /* shortfall notes: would more of a capped ingredient help? */
  var notes = [], fin = computeFinal();
  vars.forEach(function(v){
    var g = ingById(v.id);
    var cap = stockCap(g);
    if (!isFinite(cap)) return;
    var amt = S.adds[v.id]||0;
    var atCap = v.id==="distilled" ? amt >= cap - 1e-9 : amt >= Math.min(sliderMax(g), cap) - 1e-9;
    if (!atCap || cap <= 0 && amt <= 0) return;
    var before = objective(fin);
    S.adds[v.id] = amt * 1.25 + (g.unit==="g" ? 1 : 0.2);
    var after = objective(computeFinal());
    S.adds[v.id] = amt;
    if (after < before * 0.97){
      notes.push({bad:true, text:"The solver wanted more "+g.name+" than the "+fmt(cap, g.unit==="tablets"?0:1)+" "+(v.id==="distilled"?"gal":g.unit)+" in your drawer — it capped the dose there. Consider getting more."});
    }
  });
  var anyDose = vars.some(function(v){ return (S.adds[v.id]||0) > 0; });
  if (!notes.length && anyDose) notes.push({bad:false, text:"Additions calculated — amounts are snapped to your scale’s resolution and capped at drawer stock."});
  if (!vars.length) notes.push({bad:true, text:"Nothing to dose with: enable some additions you own in the Ingredient Drawer first."});
  saveLS(); renderAdds(); renderFinal(fin, notes); updateStartTiles(); renderTarget(fin);
  var finalCard = $("sec-final");
  if (window.innerWidth < 1020 && finalCard) finalCard.scrollIntoView({behavior:"smooth", block:"start"});
  toast("Additions calculated");
}

/* ================= drawer open/close ================= */
function openDrawer(){
  renderDrawer();
  $("drawer").classList.add("open"); $("backdrop").classList.add("open");
  $("drawer").setAttribute("aria-hidden","false");
  $("closeDrawerBtn").focus();
}
function closeDrawer(){
  $("drawer").classList.remove("open"); $("backdrop").classList.remove("open");
  $("drawer").setAttribute("aria-hidden","true");
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
function bind(){
  $("undoBtn").addEventListener("click", undo);
  document.addEventListener("keydown", function(e){
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey){
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "TEXTAREA") return;
      e.preventDefault(); undo();
    }
    if (e.key === "Escape" && $("drawer").classList.contains("open")) closeDrawer();
  });
  $("exportBtn").addEventListener("click", exportBackup);
  $("importBtn").addEventListener("click", () => $("backupInput").click());
  $("backupInput").addEventListener("change", importBackup);
  $("solveBtn").addEventListener("click", solve);
  $("openDrawerBtn").addEventListener("click", openDrawer);
  $("closeDrawerBtn").addEventListener("click", closeDrawer);
  $("doneDrawerBtn").addEventListener("click", closeDrawer);
  $("backdrop").addEventListener("click", closeDrawer);

  $("batchInput").addEventListener("change", function(){
    pushUndo(false);
    var v = parseFloat(this.value) || 0;
    S.batchL = Math.max(gallonsToLiters(0.5), fromVolumeDisplay(v, S.unit));
    saveLS(); renderAll();
  });
  $("unitGal").addEventListener("click", function(){ if (S.unit!=="gal"){ pushUndo(false); S.unit="gal"; saveLS(); renderAll(); } });
  $("unitL").addEventListener("click", function(){ if (S.unit!=="L"){ pushUndo(false); S.unit="L"; saveLS(); renderAll(); } });
  $("scaleStep").addEventListener("change", function(){
    pushUndo(false); S.scaleStep = parseFloat(this.value) || 0.1; saveLS(); renderAdds();
  });

  /* starting water */
  $("startIons").addEventListener("input", function(e){
    var ion = e.target.getAttribute("data-ion");
    if (ion){ pushUndo(true); S.start[ion] = e.target.value === "" ? null : Math.max(0, Number(e.target.value)); S.startName = "Custom"; $("startNameTag").textContent = "Custom"; saveLS(); updateStartTiles(); renderTarget(); renderFinal(); return; }
    if (e.target.id === "start-pH"){ pushUndo(true); S.start.pH = e.target.value === "" ? null : Math.min(10, Math.max(3, Number(e.target.value))); saveLS(); renderFinal(); }
  });
  $("chlorPpm").addEventListener("change", function(){ pushUndo(false); S.start.chlorine = Math.max(0, parseFloat(this.value)||0); saveLS(); renderAdds(); renderFinal(); });
  $("chlorType").addEventListener("change", function(){ pushUndo(false); S.start.chlorType = this.value; saveLS(); renderAdds(); renderFinal(); });
  $("saveStartBtn").addEventListener("click", function(){
    var name = $("saveStartName").value.trim();
    if (!name){ toast("Give the profile a name first"); return; }
    var prof = JSON.parse(JSON.stringify(S.start));
    var existing = -1;
    S.savedStarts.forEach(function(p,i){ if (p.name.toLowerCase()===name.toLowerCase()) existing = i; });
    if (existing >= 0) S.savedStarts[existing].profile = prof; else S.savedStarts.push({id:newId(), name:name, profile:prof});
    S.startName = name;
    $("saveStartName").value = "";
    saveLS(); renderStart(); renderTarget(); renderFinal();
    toast("Saved starting profile “"+name+"”");
  });
  $("startChips").addEventListener("click", function(e){
    var apply = e.target.getAttribute("data-apply-start");
    var del = e.target.getAttribute("data-del-start");
    if (apply !== null && apply !== undefined){
      pushUndo(false);
      if (apply === "-1"){ S.start = {Ca:0,Mg:0,Na:0,SO4:0,Cl:0,HCO3:0,pH:7,chlorine:0,chlorType:"none"}; S.startName = "Distilled"; }
      else { var p = S.savedStarts.find(p => p.id === apply); if (!p) return; S.start = JSON.parse(JSON.stringify(p.profile)); S.startName = p.name; }
      saveLS(); renderAll();
    }
    if (del !== null && del !== undefined){
      S.savedStarts = S.savedStarts.filter(p => p.id !== del); saveLS(); renderStart();
    }
  });

  /* target */
  $("presetSel").addEventListener("change", function(){
    var v = this.value;
    if (v === "__customised"){ S.targetPreset = v; renderPresetSelect(); return; }
    pushUndo(false);
    var p = v.indexOf("custom:") === 0 ? S.customPresets.find(p => p.id === v.slice(7)) : presetById(v);
    if (!p) return;
    S.targetPreset = v;
    S.target = JSON.parse(JSON.stringify(p.target));
    saveLS(); renderPresetSelect(); renderTarget(); renderFinal();
  });
  $("savePresetBtn").addEventListener("click", function(){
    var name = $("savePresetName").value.trim();
    if (!name){ toast("Give the preset a name first"); return; }
    const id = newId();
    S.customPresets.push({id, name:name, kind:"Custom", blurb: $("savePresetNote").value.trim() || "Your own saved target profile.", target: JSON.parse(JSON.stringify(S.target))});
    S.targetPreset = "custom:" + id;
    $("savePresetName").value = ""; $("savePresetNote").value = "";
    saveLS(); renderPresetSelect();
    toast("Saved preset “"+name+"”");
  });
  $("presetChips").addEventListener("click", function(e){
    var apply = e.target.getAttribute("data-apply-preset");
    var del = e.target.getAttribute("data-del-preset");
    if (apply !== null && apply !== undefined){
      pushUndo(false);
      var p = S.customPresets.find(p => p.id === apply); if (!p) return;
      S.targetPreset = "custom:" + apply;
      S.target = JSON.parse(JSON.stringify(p.target));
      saveLS(); renderPresetSelect(); renderTarget(); renderFinal();
    }
    if (del !== null && del !== undefined){
      S.customPresets = S.customPresets.filter(p => p.id !== del);
      if (S.targetPreset === "custom:" + del) S.targetPreset = "__customised";
      saveLS(); renderPresetSelect();
    }
  });
  $("targetRows").addEventListener("input", function(e){
    var t = e.target, ion, v;
    /* During a drag, update the row in place — a full re-render would
       destroy the slider thumb being dragged. Full render happens on change. */
    function localSync(row, ionId){
      var tg = S.target[ionId], ceil = ionById(ionId).ceil;
      var pct = function(x){ return Math.max(0, Math.min(100, x/ceil*100)); };
      var shade = row.querySelector(".shade");
      if (shade){ shade.style.left = pct(tg.min)+"%"; shade.style.width = (pct(tg.max)-pct(tg.min))+"%"; }
      var im = row.querySelector(".idealmark");
      if (im) im.style.left = pct(tg.ideal)+"%";
      var mn = row.querySelector("[data-tminn]"), mx = row.querySelector("[data-tmaxn]");
      if (mn) mn.value = tg.min; if (mx) mx.value = tg.max;
      var is = row.querySelector("[data-tideal]"), isn = row.querySelector("[data-tidealn]");
      if (is) is.value = tg.ideal; if (isn) isn.value = tg.ideal;
    }
    function markCustom(){
      if (S.targetPreset !== "__customised"){ S.targetPreset = "__customised"; renderPresetSelect(); }
    }
    if ((ion = t.getAttribute("data-tmin")) || (ion = t.getAttribute("data-tmax"))){
      pushUndo(true);
      var key = t.hasAttribute("data-tmin") ? "min" : "max";
      S.target[ion][key] = Math.max(0, parseFloat(t.value)||0);
      if (S.target[ion].min > S.target[ion].max){ if (key==="min") S.target[ion].max = S.target[ion].min; else S.target[ion].min = S.target[ion].max; }
      S.target[ion].ideal = Math.max(S.target[ion].min, Math.min(S.target[ion].max, S.target[ion].ideal));
      markCustom(); saveLS();
      localSync(t.closest(".trow"), ion); renderFinal();
    }
    else if ((ion = t.getAttribute("data-tideal"))){
      pushUndo(true);
      S.target[ion].ideal = Math.max(0, parseFloat(t.value)||0);
      markCustom(); saveLS();
      localSync(t.closest(".trow"), ion); renderFinal();
    }
  });
  $("targetRows").addEventListener("change", function(e){
    var t = e.target, ion;
    if (t.hasAttribute("data-tmin") || t.hasAttribute("data-tmax") || t.hasAttribute("data-tideal")){
      renderTarget(); renderFinal(); return;
    }
    if ((ion = t.getAttribute("data-tminn")) || (ion = t.getAttribute("data-tmaxn")) || (ion = t.getAttribute("data-tidealn"))){
      pushUndo(false);
      var key = t.hasAttribute("data-tminn") ? "min" : (t.hasAttribute("data-tmaxn") ? "max" : "ideal");
      S.target[ion][key] = Math.max(0, parseFloat(t.value)||0);
      if (S.target[ion].min > S.target[ion].max){ if (key==="min") S.target[ion].max = S.target[ion].min; else S.target[ion].min = S.target[ion].max; }
      S.target[ion].ideal = Math.max(S.target[ion].min, Math.min(S.target[ion].max, S.target[ion].ideal));
      if (S.targetPreset !== "__customised"){ S.targetPreset = "__customised"; renderPresetSelect(); }
      saveLS(); renderTarget(); renderFinal();
    }
  });

  /* additions */
  $("addsList").addEventListener("input", function(e){
    var t = e.target, id;
    if ((id = t.getAttribute("data-slider"))){
      pushUndo(true);
      var raw = parseFloat(t.value)||0;
      if (id === "distilled"){ S.adds.distilled = fromVolumeDisplay(raw, S.unit); }
      else S.adds[id] = snapAmt(raw, ingById(id).unit);
      saveLS();
      /* update this row in place; full render on change (drag end) */
      var row = t.closest(".addrow");
      if (row){
        var num = row.querySelector('[data-amt="'+id+'"]');
        if (num) num.value = id==="distilled" ? fmt(parseFloat(t.value)||0, 2) : fmt(S.adds[id], ingById(id).unit==="g"?2:1);
        if (id === "distilled"){
          t.style.background = sliderBG(S.batchL>0 ? S.adds.distilled/S.batchL : 0,
            stockCap(ingById("distilled"))===Infinity ? 1 : Math.max(0, Math.min(1, stockCap(ingById("distilled"))/S.batchL)));
        } else {
          var gg = ingById(id), mx = sliderMax(gg), cp = stockCap(gg);
          t.style.background = sliderBG(mx>0 ? S.adds[id]/mx : 0, cp===Infinity ? 1 : Math.max(0, Math.min(1, cp/mx)));
        }
      }
      updateStartTiles(); renderTarget(); renderFinal();
    }
    if (t.hasAttribute("data-dechlor-enabled")){ pushUndo(false); S.dechlor.enabled = t.checked; saveLS(); renderFinal(); }
    if (t.hasAttribute("data-dechlor-rate")){ pushUndo(true); S.dechlor.rateMgGal = Math.max(5, parseFloat(t.value)||30); saveLS(); renderAdds(); renderFinal(); }
  });
  $("addsList").addEventListener("change", function(e){
    var t = e.target, id;
    if (t.hasAttribute("data-slider")){ renderAdds(); updateStartTiles(); renderTarget(); renderFinal(); return; }
    if ((id = t.getAttribute("data-amt"))){
      pushUndo(false);
      var raw = Math.max(0, parseFloat(t.value)||0);
      if (id === "distilled"){ S.adds.distilled = fromVolumeDisplay(raw, S.unit); }
      else S.adds[id] = snapAmt(raw, ingById(id).unit);
      saveLS(); renderAdds(); updateStartTiles(); renderTarget(); renderFinal();
    }
    if ((id = t.getAttribute("data-enable"))){ pushUndo(false); S.enabled[id] = t.checked; saveLS(); renderAdds(); renderFinal(); }
    if (t.hasAttribute("data-dechlor-mode")){ pushUndo(false); S.dechlor.mode = t.value; saveLS(); renderAdds(); renderFinal(); }
  });

  /* drawer */
  $("drawerBody").addEventListener("change", function(e){
    var t = e.target, id;
    if ((id = t.getAttribute("data-d-owned"))){ pushUndo(false); S.drawer[id].owned = t.checked; saveLS(); renderDrawer(); renderAdds(); renderFinal(); }
    else if ((id = t.getAttribute("data-d-unlim"))){ pushUndo(false); S.drawer[id].unlimited = t.checked; saveLS(); renderDrawer(); renderAdds(); }
    else if ((id = t.getAttribute("data-d-stock"))){ pushUndo(false); S.drawer[id].stock = id === "distilled" ? fromVolumeDisplay(Math.max(0, Number(t.value)||0), S.unit) : Math.max(0, Number(t.value)||0); saveLS(); renderAdds(); renderFinal(); }
  });
}

/* ================= init ================= */
$("saveStatus").textContent = saveMessages[loaded.status];
bind();
renderAll();
