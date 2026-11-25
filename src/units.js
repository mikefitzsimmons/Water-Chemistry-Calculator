export const GAL = 3.785411784;
export const gallonsToLiters = gallons => gallons * GAL;
export const litersToGallons = liters => liters / GAL;
export const fromVolumeDisplay = (value, unit) => unit === 'gal' ? gallonsToLiters(value) : value;
export const toVolumeDisplay = (liters, unit) => unit === 'gal' ? litersToGallons(liters) : liters;

export const alkAsCaCO3 = bicarbonate => bicarbonate === null ? null : bicarbonate * 50 / 61;
export const alkAsBicarbonate = alkalinity => alkalinity === null ? null : alkalinity * 61 / 50;
