import { badRequest } from './http.mjs';

/**
 * Field checks for everything the admin accepts. Each returns the cleaned
 * value or throws a 400 that names the field, so the form can point at it.
 */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(?:\.[^\s@<>()",;:.]+)+$/;

const label = (field) => (field ? field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase() : 'This field');

export function text(value, { field, max = 500, required = false, multiline = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${label(field)} should be text.`, { field });
  let out = String(value).replace(CONTROL, '');
  out = multiline ? out.replace(/\r\n?/g, '\n').trim() : out.replace(/\s+/g, ' ').trim();
  if (required && !out) throw badRequest(`${label(field)} is required.`, { field });
  if (out.length > max) throw badRequest(`${label(field)} is too long (${max} characters at most).`, { field });
  return out;
}

export function email(value, { field = 'email', required = true } = {}) {
  const out = text(value, { field, max: 254, required }).toLowerCase();
  if (out && !EMAIL.test(out)) throw badRequest('Enter a valid email address.', { field });
  return out;
}

export function oneOf(value, options, { field, fallback } = {}) {
  if (options.includes(value)) return value;
  if (fallback !== undefined && (value === undefined || value === null || value === '')) return fallback;
  throw badRequest(`${label(field)} isn’t one of the choices.`, { field });
}

export function number(value, { field, min = -Infinity, max = Infinity, integer = false, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label(field)} is required.`, { field });
    return null;
  }
  const out = Number(value);
  if (!Number.isFinite(out) || out < min || out > max || (integer && !Number.isInteger(out))) {
    throw badRequest(`${label(field)} should be a number${Number.isFinite(min) ? ` from ${min}` : ''}${Number.isFinite(max) ? ` to ${max}` : ''}.`, { field });
  }
  return out;
}

export function date(value, { field, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label(field)} is required.`, { field });
    return null;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw badRequest(`${label(field)} isn’t a valid date.`, { field });
  return new Date(time).toISOString();
}

export function url(value, { field, required = false } = {}) {
  const out = text(value, { field, max: 2000, required });
  if (!out) return '';
  try {
    const parsed = new URL(out);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw badRequest(`${label(field)} should be a full web address, starting https://`, { field });
  }
  return out;
}

export function list(value, { field, max = 20, itemMax = 40 } = {}) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, { field, max: itemMax })).filter(Boolean))].slice(0, max);
}

export const bool = (value) => value === true || value === 'true' || value === 1;
