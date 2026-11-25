import { decodeBackup, encodeBackup, newId, readSave, writeSave } from './storage.js';
/* ================= data ================= */
var GAL = 3.78541;
var IONS = [
  {id:"Ca",  name:"Calcium",      sym:"Ca²⁺",  ceil:300},
  {id:"Mg",  name:"Magnesium",    sym:"Mg²⁺",  ceil:100},
  {id:"Na",  name:"Sodium",       sym:"Na⁺",   ceil:250},
  {id:"SO4", name:"Sulfate",      sym:"SO₄²⁻", ceil:800},
  {id:"Cl",  name:"Chloride",     sym:"Cl⁻",   ceil:350},
  {id:"HCO3",name:"Bicarbonate",  sym:"HCO₃⁻", ceil:400}
];
function ionById(id){ for (var i=0;i<IONS.length;i++) if (IONS[i].id===id) return IONS[i]; return null; }

/* contributions: ppm added per 1 unit (g or mL) dissolved in 1 gallon */
var INGREDIENTS = [
  {id:"gypsum",  name:"Gypsum", sub:"calcium sulfate", unit:"g", maxPerGal:3,
   per:{Ca:61.5, SO4:147.4}},
  {id:"cacl2",   name:"Calcium Chloride", sub:"dihydrate", unit:"g", maxPerGal:3,
   per:{Ca:72, Cl:127}},
  {id:"epsom",   name:"Epsom Salt", sub:"magnesium sulfate", unit:"g", maxPerGal:3,
   per:{Mg:26.2, SO4:103}},
  {id:"mgcl2",   name:"Magnesium Chloride", sub:"hexahydrate flakes", unit:"g", maxPerGal:3,
   per:{Mg:31.7, Cl:92}},
  {id:"nacl",    name:"Table Salt", sub:"non-iodized sodium chloride", unit:"g", maxPerGal:1.5,
   per:{Na:104, Cl:160}},
  {id:"nahco3",  name:"Baking Soda", sub:"sodium bicarbonate — raises alkalinity", unit:"g", maxPerGal:2,
   per:{Na:72.3, HCO3:191.7}},
  {id:"chalk",   name:"Chalk", sub:"calcium carbonate — dissolves poorly without acid/CO₂", unit:"g", maxPerGal:2,
   per:{Ca:105.6, HCO3:161}},
  {id:"lime",    name:"Pickling Lime", sub:"calcium hydroxide — raises alkalinity & pH", unit:"g", maxPerGal:1,
   per:{Ca:143, HCO3:435}},
  {id:"kcl",     name:"Potassium Chloride", sub:"chloride without sodium (potassium not tracked)", unit:"g", maxPerGal:2,
   per:{Cl:125.5}},
  {id:"khco3",   name:"Potassium Bicarbonate", sub:"raises alkalinity without sodium", unit:"g", maxPerGal:2,
   per:{HCO3:161}},
  {id:"citric",  name:"Citric Acid", sub:"lowers alkalinity; can taste lemony in excess", unit:"g", maxPerGal:2,
   per:{HCO3:-168}},
  {id:"lactic",  name:"Lactic Acid 88%", sub:"lowers alkalinity", unit:"mL", maxPerGal:1,
   per:{HCO3:-176}},
  {id:"phosphoric", name:"Phosphoric Acid 85%", sub:"lowers alkalinity; flavour-neutral", unit:"mL", maxPerGal:1,
   per:{HCO3:-200}},
  {id:"kmeta",   name:"Potassium Metabisulfite", sub:"dechlorination — dose auto-calculated (mg)", unit:"mg", maxPerGal:0, auto:"kmeta"},
  {id:"campden", name:"Campden Tablets", sub:"dechlorination — 1 tablet per 20 gal (crush before use)", unit:"tablets", maxPerGal:0, auto:"campden"},
  {id:"distilled", name:"Distilled Water", sub:"dilutes the starting water", unit:"gal", maxPerGal:0, auto:"distilled"}
];
function ingById(id){ for (var i=0;i<INGREDIENTS.length;i++) if (INGREDIENTS[i].id===id) return INGREDIENTS[i]; return null; }

function T(ca,mg,na,so4,cl,hco3){
  function r(a){ return {min:a[0], max:a[1], ideal:a[2]}; }
  return {Ca:r(ca), Mg:r(mg), Na:r(na), SO4:r(so4), Cl:r(cl), HCO3:r(hco3)};
}
var PRESETS = [
  {id:"pilsner", name:"Pilsner", kind:"Style",
   blurb:"Soft and low in everything, echoing Pilsen’s famously soft water. Low alkalinity and modest sulfate keep the finish crisp and let delicate noble hops show without harshness.",
   target:T([20,60,35],[0,15,8],[0,25,10],[10,60,30],[15,60,35],[0,60,30])},
  {id:"pale-ale", name:"Pale Ale", kind:"Style",
   blurb:"A balanced all-rounder: firm calcium for yeast health and clarity, sulfate ahead of chloride for a drier, hoppier edge, and low alkalinity so the malt doesn’t taste chalky.",
   target:T([50,100,75],[0,20,10],[0,40,15],[100,200,150],[40,90,60],[0,120,60])},
  {id:"ipa", name:"IPA", kind:"Style",
   blurb:"Sulfate pushed high (200–350 ppm) to dry the finish and sharpen hop bitterness and aroma, with chloride kept moderate so the beer stays lean rather than juicy-soft.",
   target:T([75,150,100],[0,25,12],[0,40,15],[200,350,250],[50,100,75],[0,100,50])},
  {id:"stout", name:"Stout", kind:"Style",
   blurb:"Higher alkalinity buffers the acidity of dark roasted malts, and balanced sulfate/chloride keeps the body full and smooth rather than thin or harsh.",
   target:T([50,100,75],[0,25,12],[0,50,25],[40,110,75],[40,110,75],[100,200,150])},
  {id:"porter", name:"Porter", kind:"Style",
   blurb:"Like the stout profile but a touch softer: moderate alkalinity for the chocolate and brown malts, with chloride roughly matching sulfate for a rounded, malty palate.",
   target:T([40,90,60],[0,20,10],[0,45,20],[35,90,60],[35,90,60],[80,170,120])},
  {id:"wheat", name:"Wheat Beer", kind:"Style",
   blurb:"Gentle and neutral — low sulfate so noble hops and wheat softness stay in front, moderate alkalinity, nothing that would push flavours around.",
   target:T([30,80,50],[0,20,10],[0,30,10],[30,90,60],[30,90,60],[40,130,80])},
  {id:"burton", name:"Burton-on-Trent", kind:"Historical",
   blurb:"The water that made pale ale famous: wells in Burton drew through gypsum beds, loading the water with calcium and sulfate. The result is a very dry, firm bitterness — the benchmark hoppy profile, and strong enough to taste on its own.",
   target:T([200,300,270],[30,60,45],[25,100,55],[500,800,650],[10,60,35],[120,280,200])},
  {id:"dublin", name:"Dublin", kind:"Historical",
   blurb:"High bicarbonate from limestone country — the classic stout water. Its alkalinity is exactly what a grist full of acidic roast barley needs to land at a drinkable mash acidity.",
   target:T([90,150,120],[0,15,5],[0,30,12],[30,80,55],[5,35,19],[200,320,260])},
  {id:"munich", name:"Munich", kind:"Historical",
   blurb:"Moderate calcium with high alkalinity and almost no sulfate or chloride — water for dark lagers, where the alkalinity suits dark malts and the softness keeps lagers smooth.",
   target:T([50,100,75],[10,30,18],[0,10,2],[0,25,10],[0,10,2],[100,200,150])},
  {id:"vienna", name:"Vienna", kind:"Historical",
   blurb:"Hard and alkaline like Munich but with far more magnesium and some sulfate — the water behind amber Vienna lagers, firm enough to keep the malt sweetness from turning flabby.",
   target:T([120,200,160],[40,80,60],[0,20,8],[80,170,125],[0,30,12],[180,300,240])}
];
function presetById(id){ for (var i=0;i<PRESETS.length;i++) if (PRESETS[i].id===id) return PRESETS[i]; return null; }

/* ================= state ================= */
function blankTarget(){ return T([0,100,50],[0,20,10],[0,40,15],[0,150,75],[0,100,50],[0,150,75]); }
function defaultDrawer(){
  var d = {};
  var owned = {gypsum:1, cacl2:1, epsom:1, nacl:1, nahco3:1, lactic:1, distilled:1};
  INGREDIENTS.forEach(function(g){
    d[g.id] = {owned: !!owned[g.id], unlimited: !!owned[g.id], stock: 100};
  });
  d.campden.stock = 24; d.kmeta.stock = 50000;
  return d;
}
function defaultState(){
  var p = presetById("pale-ale");
  var s = {
    unit:"gal", batchGal:5, scaleStep:0.1,
    startName:"Distilled",
    start:{Ca:0,Mg:0,Na:0,SO4:0,Cl:0,HCO3:0,pH:7,chlorine:0,chlorType:"none"},
    targetPreset:"pale-ale",
    target: JSON.parse(JSON.stringify(p.target)),
    adds:{}, enabled:{},
    dechlor:{mode:"kmeta", rateMgGal:30, enabled:true},
    drawer: defaultDrawer(),
    savedStarts:[], customPresets:[]
  };
  INGREDIENTS.forEach(function(g){ s.adds[g.id]=0; s.enabled[g.id]=true; });
  return s;
}
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
function fmt(n, dp){ if (!isFinite(n)) n = 0; return Number(n.toFixed(dp===undefined?0:dp)).toString(); }
function volLabel(gal){ return S.unit==="gal" ? fmt(gal,2)+" gal" : fmt(gal*GAL,2)+" L"; }
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
function alkAsCaCO3(hco3){ return hco3 * 50/61; }
function residualAlk(profile){
  return alkAsCaCO3(profile.HCO3) - (profile.Ca/1.4 + profile.Mg/1.7);
}
function distilledGal(){ return Math.min(S.adds.distilled||0, S.batchGal); }
function startGal(){ return Math.max(0, S.batchGal - distilledGal()); }

/* stock caps, expressed in each ingredient's own unit */
function stockCap(g){
  var d = S.drawer[g.id];
  if (!d || !d.owned) return 0;
  if (d.unlimited) return Infinity;
  return Math.max(0, d.stock||0);
}
function sliderMax(g){
  if (g.auto) return 0;
  return g.maxPerGal * S.batchGal;
}

/* ================= chemistry ================= */
function computeFinal(){
  var batch = S.batchGal, sg = startGal();
  var out = {}, i, g, amt, k;
  for (i=0;i<IONS.length;i++){
    var ion = IONS[i].id;
    out[ion] = batch>0 ? S.start[ion] * sg / batch : 0;
  }
  for (i=0;i<INGREDIENTS.length;i++){
    g = INGREDIENTS[i];
    if (!g.per) continue;
    amt = S.adds[g.id]||0;
    if (!amt || batch<=0) continue;
    for (k in g.per) out[k] += amt * g.per[k] / batch;
  }
  if (out.HCO3 < 0) out.HCO3 = 0;
  return out;
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
  var acidMeqPerL = 0, i, g, amt;
  var defs = {lactic:3.09, phosphoric:3.35, citric:2.30, nahco3:-3.13, khco3:-2.64, chalk:-2.64, lime:-7.13};
  for (i=0;i<INGREDIENTS.length;i++){
    g = INGREDIENTS[i];
    if (defs[g.id]===undefined) continue;
    amt = S.adds[g.id]||0;
    if (!amt) continue;
    var perGalMeq = defs[g.id] * (g.unit==="mL" ? 1 : 1);
    acidMeqPerL += amt * perGalMeq / S.batchGal / GAL * 3.78541 / 3.78541; /* perGal already per gallon; convert below */
  }
  /* recompute cleanly: defs are meq per unit per gallon -> meq/L = amt*def/batchGal / 3.785 */
  acidMeqPerL = 0;
  for (i=0;i<INGREDIENTS.length;i++){
    g = INGREDIENTS[i];
    if (defs[g.id]===undefined) continue;
    amt = S.adds[g.id]||0;
    if (!amt) continue;
    acidMeqPerL += (amt * defs[g.id] / S.batchGal) / GAL;
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
    return {kind:"campden", tablets: Math.ceil(S.batchGal/20 * mult), label:""};
  }
  var mg = S.dechlor.rateMgGal * S.batchGal * mult;
  return {kind:"kmeta", mg: mg, grams: mg/1000, label:""};
}

/* ================= rendering: starting ================= */
function renderStart(){
  var html = "";
  IONS.forEach(function(ion){
    html += '<div class="ionfield"><label for="start-'+ion.id+'">'+ion.name+' <span class="unit">(ppm)</span></label>'+
      '<input type="number" min="0" step="1" id="start-'+ion.id+'" data-ion="'+ion.id+'" value="'+fmt(S.start[ion.id],1)+'"></div>';
  });
  html += '<div class="ionfield"><label for="start-pH">pH</label>'+
    '<input type="number" min="3" max="10" step="0.1" id="start-pH" value="'+fmt(S.start.pH,1)+'"></div>';
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
  $("startAmt").innerHTML = volLabel(startGal()) + ' <small>of '+volLabel(S.batchGal)+'</small>';
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
    var inR = v >= t.min && v <= t.max;
    html += '<div class="trow" data-ion="'+ion.id+'">'+
      '<div class="thead"><span class="tname">'+ion.name+' <span class="tiny">'+ion.sym+'</span></span>'+
      '<span class="tval">now <b>'+fmt(v)+'</b> ppm · <span class="'+(inR?"inrange":"outrange")+'">'+(inR?"in range":"out of range")+'</span></span></div>'+
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
      '<p class="anote" style="margin:6px 0 0">For '+(fmt(S.start.chlorine,1))+' ppm '+esc(S.start.chlorType)+' in '+volLabel(S.batchGal)+': '+
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
    if (g.auto) return;
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
    var step = g.unit==="g" ? S.scaleStep : 0.1;
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
    var dispAmt = S.unit==="gal" ? amtGal : amtGal*GAL;
    var maxDisp = S.unit==="gal" ? S.batchGal : S.batchGal*GAL;
    var capGal = stockCap(g); /* stock stored in gallons */
    var stockFrac = capGal===Infinity ? 1 : Math.max(0, Math.min(1, capGal/S.batchGal));
    var en = S.enabled.distilled;
    html += '<div class="addrow'+(en?"":" disabled")+'"><div class="ahead">'+
      '<label class="check"><input type="checkbox" data-enable="distilled" '+(en?"checked":"")+'><span class="aname">Distilled Water</span></label>'+
      '<span class="anote">dilutes the starting water; starting amount fills in automatically</span>'+
      '<span class="aamt"><input type="number" min="0" step="0.25" value="'+fmt(dispAmt,2)+'" data-amt="distilled" '+(en?"":"disabled")+' aria-label="Distilled water amount">'+
      '<span class="u">'+(S.unit==="gal"?"gal":"L")+'</span></span></div>'+
      '<input type="range" min="0" max="'+fmt(maxDisp,2)+'" step="'+(S.unit==="gal"?0.25:0.5)+'" value="'+fmt(dispAmt,2)+'" data-slider="distilled" '+(en?"":"disabled")+
        ' style="background:'+sliderBG(S.batchGal>0?amtGal/S.batchGal:0, stockFrac)+'" aria-label="Distilled water slider">'+
      '<div class="ends"><span>0</span><span>starting water: '+volLabel(startGal())+' · distilled: '+volLabel(amtGal)+'</span></div>'+
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
    var inR = v >= t.min && v <= t.max;
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
      (d.owned ? '<div class="dstock"><label class="lbl">On hand <input type="number" min="0" step="any" value="'+fmt(d.stock,1)+'" data-d-stock="'+g.id+'" '+(d.unlimited?"disabled":"")+'></label>'+
        '<span class="small">'+unitLabel+'</span>'+
        '<label class="check" style="font-weight:550"><input type="checkbox" data-d-unlim="'+g.id+'" '+(d.unlimited?"checked":"")+'> Unlimited</label></div>' : '')+
    '</div>';
  });
  $("drawerBody").innerHTML = html;
}

function renderAll(){
  $("batchInput").value = S.unit==="gal" ? fmt(S.batchGal,2) : fmt(S.batchGal*GAL,2);
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
    vars.push({id:"distilled", max: Math.min(S.batchGal*0.95, stockCap(ingById("distilled")))});
  }
  INGREDIENTS.forEach(function(g){
    if (!g.per) return;
    if (!S.enabled[g.id] || !S.drawer[g.id].owned) return;
    vars.push({id:g.id, max: Math.min(sliderMax(g), stockCap(g))});
  });
  vars.forEach(function(v){ v.max = isFinite(v.max) ? v.max : sliderMax(ingById(v.id)) || S.batchGal; if (v.id==="distilled" && !isFinite(v.max)) v.max = S.batchGal*0.95; });
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
    var snapped = v.id==="distilled" ? Math.round((S.adds[v.id]||0)*4)/4 : snapAmt(S.adds[v.id]||0, g.unit);
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
    S.batchGal = S.unit==="gal" ? Math.max(0.5, v) : Math.max(0.5, v/GAL);
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
    if (ion){ pushUndo(true); S.start[ion] = Math.max(0, parseFloat(e.target.value)||0); S.startName = "Custom"; $("startNameTag").textContent = "Custom"; saveLS(); updateStartTiles(); renderTarget(); renderFinal(); return; }
    if (e.target.id === "start-pH"){ pushUndo(true); S.start.pH = Math.min(10, Math.max(3, parseFloat(e.target.value)||7)); saveLS(); renderFinal(); }
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
      if (id === "distilled"){ S.adds.distilled = S.unit==="gal" ? raw : raw/GAL; }
      else S.adds[id] = snapAmt(raw, ingById(id).unit);
      saveLS();
      /* update this row in place; full render on change (drag end) */
      var row = t.closest(".addrow");
      if (row){
        var num = row.querySelector('[data-amt="'+id+'"]');
        if (num) num.value = id==="distilled" ? fmt(parseFloat(t.value)||0, 2) : fmt(S.adds[id], ingById(id).unit==="g"?2:1);
        if (id === "distilled"){
          t.style.background = sliderBG(S.batchGal>0 ? S.adds.distilled/S.batchGal : 0,
            stockCap(ingById("distilled"))===Infinity ? 1 : Math.max(0, Math.min(1, stockCap(ingById("distilled"))/S.batchGal)));
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
      if (id === "distilled"){ S.adds.distilled = S.unit==="gal" ? raw : raw/GAL; }
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
    else if ((id = t.getAttribute("data-d-stock"))){ pushUndo(false); S.drawer[id].stock = Math.max(0, parseFloat(t.value)||0); saveLS(); renderAdds(); renderFinal(); }
  });
}

/* ================= init ================= */
$("saveStatus").textContent = saveMessages[loaded.status];
bind();
renderAll();
