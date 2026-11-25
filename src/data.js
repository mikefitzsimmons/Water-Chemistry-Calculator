import { INGREDIENTS } from './catalog.js';
import { alkAsCaCO3, gallonsToLiters } from './units.js';

export const IONS = [
  {id:"Ca",  name:"Calcium",      sym:"Ca²⁺",  ceil:300},
  {id:"Mg",  name:"Magnesium",    sym:"Mg²⁺",  ceil:100},
  {id:"Na",  name:"Sodium",       sym:"Na⁺",   ceil:250},
  {id:"SO4", name:"Sulfate",      sym:"SO₄²⁻", ceil:800},
  {id:"Cl",  name:"Chloride",     sym:"Cl⁻",   ceil:350},
  {id:"Alk", name:"Alkalinity", sym:"as CaCO₃", ceil:330}
];
export function ionById(id){ for (var i=0;i<IONS.length;i++) if (IONS[i].id===id) return IONS[i]; return null; }

function T(ca,mg,na,so4,cl,hco3){
  function r(a){ return {min:a[0], max:a[1], ideal:a[2]}; }
  return {Ca:r(ca), Mg:r(mg), Na:r(na), SO4:r(so4), Cl:r(cl), Alk:r(hco3.map(alkAsCaCO3)), pH:null};
}
export const PRESETS = [
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
export function presetById(id){ for (var i=0;i<PRESETS.length;i++) if (PRESETS[i].id===id) return PRESETS[i]; return null; }

/* ================= state ================= */
function defaultDrawer(){
  return Object.fromEntries(INGREDIENTS.map(g => [g.id, { owned:true, unlimited:true, stock:0 }]));
}
export function defaultState(){
  var p = presetById("pale-ale");
  var s = {
    unit:"gal", batchL:gallonsToLiters(5), scaleStep:0.1,
    startName:"Distilled",
    start:{Ca:0,Mg:0,Na:0,SO4:0,Cl:0,Alk:0,pH:7,assumed:true,chlorine:0,chlorType:"none",chlorBasis:"Cl2"},
    targetPreset:"pale-ale",
    target: JSON.parse(JSON.stringify(p.target)),
    adds:{}, enabled:{},
    dechlor:{mode:"kmeta", rateMgGal:null, enabled:true, assayPercent:100, campdenMg:null},
    drawer: defaultDrawer(),
    savedStarts:[], customPresets:[]
  };
  INGREDIENTS.forEach(function(g){ s.adds[g.id]=0; s.enabled[g.id]=true; });
  return s;
}
