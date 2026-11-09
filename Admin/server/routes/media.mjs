import { HttpError, badRequest, readBody } from '../http.mjs';
import { UPLOAD_LIMIT } from '../media.mjs';

/** The media library: listing, uploading, removing (to the trash) and putting back. */
export function mediaRoutes(router, app) {
  const { media } = app;

  router.get('/api/media', async () => media.library(await app.contentStrings()));

  router.post('/api/media/upload', { auth: 'editor', limit: UPLOAD_LIMIT }, async (ctx) => {
    const name = String(ctx.query.name ?? '');
    const folder = String(ctx.query.folder ?? 'images');
    if (!name) throw badRequest('The upload has no file name.');
    const data = await readBody(ctx.req, UPLOAD_LIMIT);
    if (!data.length) throw badRequest('The file is empty.');
    const result = await media.upload({ folder, name, data, replace: ctx.query.replace === '1' });
    app.audit(ctx.user, 'media.upload', `${result.replaced ? 'Replaced' : 'Uploaded'} ${result.path}`, { target: result.path, meta: { bytes: result.bytes } });
    return result;
  });

  router.post('/api/media/remove', { auth: 'editor' }, async (ctx) => {
    const { path: publicPath } = await ctx.body();
    if (typeof publicPath !== 'string' || !publicPath.startsWith('/')) throw badRequest('Name the file to remove.');
    const entry = await media.remove(publicPath, await app.contentStrings());
    app.audit(ctx.user, 'media.remove', `Moved ${publicPath} to the trash`, { target: publicPath });
    return entry;
  });

  router.get('/api/media/trash', () => media.trash());

  router.post('/api/media/trash/:id/restore', { auth: 'editor' }, async (ctx) => {
    const entry = await media.restore(ctx.params.id);
    app.audit(ctx.user, 'media.restore', `Put ${entry.path} back`, { target: entry.path });
    return entry;
  });

  router.delete('/api/media/trash/:id', { auth: 'owner' }, async (ctx) => {
    const entry = await media.purge(ctx.params.id);
    app.audit(ctx.user, 'media.purge', `Deleted ${entry.path} from the trash for good`, { target: entry.path });
    return entry;
  });

  router.get('/api/media/check', async (ctx) => {
    const publicPath = String(ctx.query.path ?? '');
    if (!publicPath.startsWith('/')) throw new HttpError(400, 'invalid', 'Name a file.');
    return { path: publicPath, exists: media.exists(publicPath) };
  });
}
