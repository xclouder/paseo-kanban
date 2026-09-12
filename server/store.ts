import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyStore, storeSchema, type BoardStore } from '../shared/model';

/** One daemon-owned writer; never replace damaged data with an empty board. */
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) {}
  async read(): Promise<BoardStore> {
    try { return storeSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
      throw new Error(`无法读取看板数据，请检查 ${this.file}；原文件未被覆盖。`, { cause: error });
    }
  }
  async write(data: BoardStore): Promise<void> {
    const contents = JSON.stringify(storeSchema.parse(data), null, 2);
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.file);
    } finally { await rm(temporary, { force: true }); }
  }
  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  update<T>(operation: (data: BoardStore) => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const data = await this.read();
      const result = await operation(data);
      await this.write(data);
      return result;
    });
  }
}
