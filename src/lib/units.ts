import type { Units } from '../model/types';

export const CM_PER_FT = 30.48;

export function formatLength(cm: number, units: Units): string {
  if (units === 'm') return cm >= 100 ? `${(cm / 100).toFixed(cm % 100 === 0 ? 0 : 2)} m` : `${Math.round(cm)} cm`;
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  if (inch === 12) return `${ft + 1}′`;
  return ft > 0 ? `${ft}′${inch ? ` ${inch}″` : ''}` : `${inch}″`;
}

/** Value shown in numeric inputs: feet or metres. */
export const toDisplay = (cm: number, units: Units) => (units === 'm' ? cm / 100 : cm / CM_PER_FT);
export const fromDisplay = (v: number, units: Units) => (units === 'm' ? v * 100 : v * CM_PER_FT);
export const unitLabel = (units: Units) => (units === 'm' ? 'm' : 'ft');
export const gridSize = (units: Units) => (units === 'm' ? 25 : CM_PER_FT);
