import { randomUUID } from 'node:crypto';

// 只记录调用标识，不记录任务正文、附件或请求参数。
export function logOperation<Args extends unknown[], Result>(operation: string, handler: (...args: Args) => Result) {
  return async (...args: Args): Promise<Awaited<Result>> => {
    const requestId = randomUUID();
    const started = performance.now();
    const input = args[0];
    const cardId = input && typeof input === 'object' && 'id' in input && typeof input.id === 'string' ? input.id : undefined;
    const log = (event: string, error?: unknown) => {
      const entry = {
        plugin: 'paseo-kanban', operation, requestId, cardId, event,
        time: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
        ...(error === undefined ? {} : { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }),
      };
      const message = JSON.stringify(entry);
      if (event === 'failed') console.error(message);
      else if (event === 'pending') console.warn(message);
      else console.log(message);
    };
    log('started');
    // 即使调用永远不返回，也留下仍在等待的证据；不改变请求的超时和执行行为。
    const pending = setTimeout(() => log('pending'), 5000);
    try {
      const result = await handler(...args);
      log('completed');
      return result;
    } catch (error) {
      log('failed', error);
      throw error;
    } finally {
      clearTimeout(pending);
    }
  };
}
