import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The admin's own records in one JSON file (Admin/data/db.json): accounts,
 * sessions, enquiries, meetings, the activity log, analytics counts and
 * settings. A studio's admin holds hundreds of records, not millions, so a
 * file it can read, back up and diff beats a database server. Writes are
 * debounced, serialised and atomic (a temporary file renamed over the old
 * one), and the previous copy is kept as db.json.bak.
 */

export const empty = () => ({
  schema: 1,
  createdAt: new Date().toISOString(),
  users: [],
  sessions: [],
  enquiries: [],
  meetings: [],
  activity: [],
  analytics: { days: {}, today: { date: '', salt: '', visitors: [] } },
  archive: { projects: [] },
  trash: [],
  jobs: [],
  settings: {
    calendlyToken: '',
    calendlyUser: null,
    calendlyLastSync: null,
    siteUrl: '',
    siteOrigins: [],
    notifyEmail: '',
  },
  sample: false,
});

function migrate(data) {
  const base = empty();
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings ?? {}) };
  out.analytics = { ...base.analytics, ...(data.analytics ?? {}) };
  out.archive = { ...base.archive, ...(data.archive ?? {}) };
  return out;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Store {
  constructor(file) {
    this.file = file;
    this.data = empty();
    this.chain = Promise.resolve();
    this.timer = null;
  }

  async load() {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.data = migrate(JSON.parse(await fsp.readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // A damaged file is set aside rather than overwritten, and the backup is tried.
        const aside = `${this.file}.damaged-${Date.now()}`;
        await fsp.copyFile(this.file, aside).catch(() => {});
        try {
          this.data = migrate(JSON.parse(await fsp.readFile(`${this.file}.bak`, 'utf8')));
          console.warn(`[db] ${path.basename(this.file)} was unreadable; restored the backup and kept the damaged copy as ${path.basename(aside)}.`);
          return;
        } catch {
          throw new Error(`The admin database at ${this.file} can't be read (${error.message}). A copy was kept at ${aside}.`);
        }
      }
      this.data = empty();
      await this.flush();
    }
  }

  /** Schedules a write; several changes in quick succession become one. */
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 40);
  }

  flush() {
    clearTimeout(this.timer);
    const snapshot = JSON.stringify(this.data, null, 1);
    this.chain = this.chain
      .then(async () => {
        const temp = `${this.file}.tmp`;
        await fsp.writeFile(temp, snapshot);
        if (fs.existsSync(this.file)) await fsp.copyFile(this.file, `${this.file}.bak`).catch(() => {});
        // Windows can briefly hold the old file open (an indexer, an antivirus); try a few times.
        for (let attempt = 0; ; attempt++) {
          try {
            await fsp.rename(temp, this.file);
            break;
          } catch (error) {
            if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
            await pause(60 * (attempt + 1));
          }
        }
      })
      .catch((error) => console.error('[db] could not save:', error.message));
    return this.chain;
  }

  /** Writes now, synchronously; used on the way out. */
  flushSync() {
    clearTimeout(this.timer);
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1));
    } catch (error) {
      console.error('[db] could not save on exit:', error.message);
    }
  }
}
