import { withBase } from './dom.js';

/**
 * Talks to the admin's server. Every change carries the session's CSRF
 * token; a signed-out answer sends the user back to sign in, keeping the
 * page they were on. Paths are written from the admin's root and sent to
 * wherever it is served (/admin inside the site).
 */

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data ?? {};
  }
}

const session = { csrf: null, onSignedOut: null, onPasswordChange: null };

export function configureApi({ csrf, onSignedOut, onPasswordChange }) {
  if (csrf !== undefined) session.csrf = csrf;
  if (onSignedOut) session.onSignedOut = onSignedOut;
  if (onPasswordChange) session.onPasswordChange = onPasswordChange;
}

export async function api(path, { method = 'GET', body, raw, headers = {}, signal, quiet = false } = {}) {
  const init = { method, headers: { accept: 'application/json', ...headers }, credentials: 'same-origin', signal };
  if (method !== 'GET' && session.csrf) init.headers['x-csrf-token'] = session.csrf;
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(withBase(path), init);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'The admin isn’t answering. Is its window still open?');
  }
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await response.json().catch(() => null) : await response.text();
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error ?? 'error', data?.message ?? `The request failed (${response.status}).`, data);
    if (!quiet && response.status === 401 && data?.error === 'signed_out') session.onSignedOut?.();
    if (!quiet && response.status === 403 && data?.error === 'password_change') session.onPasswordChange?.();
    throw error;
  }
  return data;
}

export const get = (path, options) => api(path, options);
export const post = (path, body, options) => api(path, { ...options, method: 'POST', body });
export const put = (path, body, options) => api(path, { ...options, method: 'PUT', body });
export const patch = (path, body, options) => api(path, { ...options, method: 'PATCH', body });
export const del = (path, options) => api(path, { ...options, method: 'DELETE' });

/** Uploads one file as the request body, reporting progress. */
export function upload(path, file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', withBase(path));
    xhr.withCredentials = true;
    if (session.csrf) xhr.setRequestHeader('x-csrf-token', session.csrf);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error ?? 'error', data?.message ?? `The upload failed (${xhr.status}).`, data));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'The upload couldn’t reach the admin.'));
    xhr.send(file);
  });
}
