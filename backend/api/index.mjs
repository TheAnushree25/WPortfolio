import { configProblems, loadConfig } from '../src/config.mjs';

// Node calls its type stripping experimental; the content engine relies on it on purpose, so the notice stays out of the logs.
const emit = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (/stripTypeScriptTypes|Type Stripping/i.test(String(warning?.message ?? warning))) return;
  return emit.call(process, warning, ...rest);
};

/**
 * The backend as a Vercel Function. vercel.json sends every path here; one
 * backend is made per instance and kept while the instance lives. If the
 * environment is incomplete, every request gets a page saying what to set,
 * rather than a bare error.
 */

let backend = null;
let starting = null;

function setupPage(problems) {
  const items = problems.map((problem) => `<li style="margin:0 0 10px">${problem.message.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</li>`).join('');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Admin · Atlas Studios</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#020923;color:#eaf0ff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px">
<main style="max-width:560px"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#7fb0ff;font-weight:700">Atlas Studios · Admin</p>
<h1 style="margin:0 0 14px;font-size:24px;font-weight:600">The backend needs a few settings</h1>
<p style="margin:0 0 16px;color:#8a9ac3;line-height:1.6">Add these in the backend project’s environment variables, then redeploy (backend/README.md has each step):</p>
<ul style="margin:0;padding-left:20px;color:#c9d6f5;line-height:1.55">${items}</ul></main></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
}

async function start() {
  const config = loadConfig();
  const errors = configProblems(config).filter((problem) => problem.level === 'error');
  if (errors.length) return { config, errors };
  const { createBackend } = await import('../src/app.mjs');
  return { config, backend: await createBackend(config) };
}

const handler = {
  async fetch(request) {
    if (!backend) {
      starting ??= start().catch((error) => {
        starting = null;
        throw error;
      });
      const result = await starting;
      if (result.errors) {
        starting = null;
        return setupPage(result.errors);
      }
      backend = result.backend;
    }
    return backend.fetch(request);
  },
};

export default handler;
