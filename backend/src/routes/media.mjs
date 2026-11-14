import { HttpError, badRequest } from '../shared.mjs';
import { readBody } from '../http.mjs';
import { CHUNK_SIZE } from '../services/media.mjs';

/**
 * The media library: listing, uploading (in one request, or in pieces for
 * files larger than a serverless request allows), removing to the trash and
 * putting back.
 */
export function mediaRoutes(router, app) {
  const { media, repo } = app;
  const SINGLE_LIMIT = 4_400_000;

  router.get('/api/media', async () => {
    const snapshot = await repo.view();
    return media.library(await app.contentStrings(snapshot), snapshot);
  });

  router.post('/api/media/upload', { auth: 'editor', limit: SINGLE_LIMIT, raw: true }, async (ctx) => {
    const name = String(ctx.query.name ?? '');
    if (!name) throw badRequest('The upload has no file name.');
    const data = await readBody(ctx.request, SINGLE_LIMIT);
    if (!data.length) throw badRequest('The file is empty.');
    const result = await media.upload({ folder: String(ctx.query.folder ?? 'images'), name, data, replace: ctx.query.replace === '1', user: ctx.user });
    await app.audit(ctx.user, 'media.upload', `${result.replaced ? 'Replaced' : 'Uploaded'} ${result.path}`, { target: result.path, meta: { bytes: result.bytes } });
    return result;
  });

  // Larger files: start, send each piece, finish. The pieces wait in the database until the last arrives.
  router.post('/api/media/uploads', { auth: 'editor' }, async (ctx) => {
    const body = await ctx.body();
    return media.startUpload({ folder: body.folder, name: body.name, size: body.size, replace: Boolean(body.replace), user: ctx.user });
  });

  router.put('/api/media/uploads/:id/:index', { auth: 'editor', limit: CHUNK_SIZE + 1, raw: true }, async (ctx) => {
    const data = await readBody(ctx.request, CHUNK_SIZE + 1);
    return media.putChunk(ctx.params.id, ctx.params.index, data, ctx.user);
  });

  router.post('/api/media/uploads/:id/finish', { auth: 'editor' }, async (ctx) => {
    const result = await media.finishUpload(ctx.params.id, ctx.user);
    await app.audit(ctx.user, 'media.upload', `${result.replaced ? 'Replaced' : 'Uploaded'} ${result.path}`, { target: result.path, meta: { bytes: result.bytes } });
    return result;
  });

  router.post('/api/media/remove', { auth: 'editor' }, async (ctx) => {
    const { path: publicPath } = await ctx.body();
    if (typeof publicPath !== 'string' || !publicPath.startsWith('/')) throw badRequest('Name the file to remove.');
    const snapshot = await repo.view();
    const entry = await media.remove(publicPath, await app.contentStrings(snapshot), ctx.user);
    await app.audit(ctx.user, 'media.remove', `Moved ${publicPath} to the trash`, { target: publicPath });
    return entry;
  });

  router.get('/api/media/trash', () => media.trash());

  router.post('/api/media/trash/:id/restore', { auth: 'editor' }, async (ctx) => {
    const entry = await media.restore(ctx.params.id, ctx.user);
    await app.audit(ctx.user, 'media.restore', `Put ${entry.path} back`, { target: entry.path });
    return entry;
  });

  router.delete('/api/media/trash/:id', { auth: 'owner' }, async (ctx) => {
    const entry = await media.purge(ctx.params.id);
    await app.audit(ctx.user, 'media.purge', `Forgot ${entry.path} in the trash (Git’s history still has it)`, { target: entry.path });
    return entry;
  });

  router.get('/api/media/check', async (ctx) => {
    const publicPath = String(ctx.query.path ?? '');
    if (!publicPath.startsWith('/')) throw new HttpError(400, 'invalid', 'Name a file.');
    return { path: publicPath, exists: media.exists(publicPath, await repo.view()) };
  });
}
