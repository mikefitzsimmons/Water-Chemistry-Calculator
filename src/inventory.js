import { litersToGallons } from './units.js';

const EPSILON = 1e-9;

export function stockCap(state, id) {
  const item = state.drawer[id];
  return !item?.owned ? 0 : item.unlimited ? Infinity : item.stock;
}

export function doseMaximum(state, ingredient) {
  return ingredient.id === 'distilled' ? state.batchL : ingredient.maxPerGal * litersToGallons(state.batchL);
}

export function doseGrid(state, ingredient, stock = stockCap(state, ingredient.id)) {
  const maximum = doseMaximum(state, ingredient);
  const step = ingredient.unit === 'g' ? Math.max(ingredient.step, state.scaleStep) : ingredient.step;
  const count = Math.max(0, Math.floor((Math.min(maximum, stock) + EPSILON) / step));
  const fullBatch = ingredient.id === 'distilled' && maximum <= stock && maximum - count * step > EPSILON
    ? maximum : null;
  return { step, count, fullBatch, last: count + (fullBatch === null ? 0 : 1) };
}

export function doseAt(grid, index) {
  return grid.fullBatch !== null && index === grid.last ? grid.fullBatch : Number((index * grid.step).toFixed(10));
}

export function snapDose(state, ingredient, amount, stock) {
  const grid = doseGrid(state, ingredient, stock);
  const index = Math.max(0, Math.min(grid.count, Math.round(amount / grid.step)));
  const regular = doseAt(grid, index);
  return grid.fullBatch !== null && Math.abs(amount - grid.fullBatch) < Math.abs(amount - regular)
    ? grid.fullBatch : regular;
}

export function shortfalls(state, ingredients) {
  return ingredients.flatMap(ingredient => {
    const { id } = ingredient;
    const planned = state.enabled[id] ? state.adds[id] ?? 0 : 0;
    const effective = id === 'distilled' ? Math.min(state.batchL, planned) : planned;
    const deficit = effective - stockCap(state, id);
    return deficit > EPSILON ? [{ id, amount: deficit }] : [];
  });
}
