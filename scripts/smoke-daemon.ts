import { createPaseoClient } from '@getpaseo/client';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BoardService } from '../server/service';
import { Store } from '../server/store';
import { buildCards, snapshotSchema } from '../shared/model';

// Read-only integration probe. Never launches an agent or edits daemon config.
const url = process.argv[2];
if (!url) throw new Error('Usage: npx tsx scripts/smoke-daemon.ts ws://127.0.0.1:PORT/ws');
const client = createPaseoClient({ url, reconnect: { enabled: false }, connectTimeoutMs: 10000 });
try {
  await client.connect();
  const service = new BoardService(new Store(join(tmpdir(), `paseo-kanban-readonly-${randomUUID()}`, 'board.json')));
  const snapshot = snapshotSchema.parse(await service.read(client));
  const cards = buildCards(snapshot);
  console.log(JSON.stringify({ ok: true, sessions: snapshot.agents.length, workspaces: snapshot.workspaces.length, cards: cards.length, providers: snapshot.providers, selectableModels: snapshot.models.length, providerError: snapshot.providerError }, null, 2));
} finally { await client.close(); }
