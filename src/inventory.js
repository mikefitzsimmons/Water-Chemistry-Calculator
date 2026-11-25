import { gallonsToLiters, litersToGallons } from './units.js';

const EPSILON = 1e-9;
const EIGHT_FLUID_OUNCES_L = gallonsToLiters(1 / 16);

function regularDose(step, index) {
  const amount = index * step;
  // Keep gallon ticks on the same conversion as gallon stock entries.
  return step === EIGHT_FLUID_OUNCES_L ? amount : Number(amount.toFixed(10));
}

export function stockCap(state, id) {
  const item = state.drawer[id];
  return !item?.owned ? 0 : item.unlimited ? Infinity : item.stock;
}

export function doseMaximum(state, ingredient) {
  return ingredient.id === 'distilled' ? state.batchL : ingredient.maxPerGal * litersToGallons(state.batchL);
}

export function doseGrid(state, ingredient, stock = stockCap(state, ingredient.id)) {
  const maximum = doseMaximum(state, ingredient);
  const distilled = ingredient.id === 'distilled';
  let step = ingredient.step;
  if (distilled && state.unit === 'gal') step = EIGHT_FLUID_OUNCES_L;
  if (ingredient.unit === 'g') step = Math.max(step, state.scaleStep);
  const limit = Math.min(maximum, stock);
  let count = Math.max(0, Math.floor((limit + EPSILON) / step));
  if (count > 0 && regularDose(step, count) > limit) count--;
  const fullBatch = distilled && maximum <= stock && maximum !== regularDose(step, count)
    ? maximum : null;
  return { step, count, fullBatch, last: count + (fullBatch === null ? 0 : 1) };
}

export function doseAt(grid, index) {
  return grid.fullBatch !== null && index === grid.last ? grid.fullBatch : regularDose(grid.step, index);
}

export function doseIndex(grid, amount) {
  const index = Math.max(0, Math.min(grid.count, Math.round(amount / grid.step)));
  const regular = doseAt(grid, index);
  return grid.fullBatch !== null && Math.abs(amount - grid.fullBatch) < Math.abs(amount - regular)
    ? grid.last : index;
}

export function snapDose(state, ingredient, amount, stock) {
  const grid = doseGrid(state, ingredient, stock);
  return doseAt(grid, doseIndex(grid, amount));
}

export function shortfalls(state, ingredients) {
  return ingredients.flatMap(ingredient => {
    const { id } = ingredient;
    const planned = state.enabled[id] ? state.adds[id] ?? 0 : 0;
    const effective = id === 'distilled' ? (state.startId === 'distilled' ? 0 : Math.min(state.batchL, planned)) : planned;
    const deficit = effective - stockCap(state, id);
    return deficit > EPSILON ? [{ id, amount: deficit }] : [];
  });
}
