import type { NormalizedMessage } from '../types';
import type { ChannelConfig } from '@kortix/db';
import { SandboxConnector } from './sandbox-connector';

interface QueuedMessage {
  message: NormalizedMessage;
  config: ChannelConfig;
  resolve: (value: void) => void;
  reject: (reason: unknown) => void;
}

interface SandboxQueue {
  messages: QueuedMessage[];
  draining: boolean;
}

export class MessageQueue {
  private queues = new Map<string, SandboxQueue>();
  private processCallback?: (message: NormalizedMessage, config: ChannelConfig) => Promise<void>;

  onProcess(callback: (message: NormalizedMessage, config: ChannelConfig) => Promise<void>): void {
    this.processCallback = callback;
  }

  enqueue(
    sandboxId: string,
    message: NormalizedMessage,
    config: ChannelConfig,
    connector: SandboxConnector,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let queue = this.queues.get(sandboxId);
      if (!queue) {
        queue = { messages: [], draining: false };
        this.queues.set(sandboxId, queue);
      }

      queue.messages.push({ message, config, resolve, reject });

      if (!queue.draining) {
        this.startWakeAndDrain(sandboxId, connector);
      }
    });
  }

  private async startWakeAndDrain(sandboxId: string, connector: SandboxConnector): Promise<void> {
    const queue = this.queues.get(sandboxId);
    if (!queue) return;

    queue.draining = true;

    try {
      await connector.wakeUp();

      const maxWait = 90_000;
      const pollInterval = 3_000;
      const start = Date.now();
      let ready = false;

      while (Date.now() - start < maxWait) {
        if (await connector.isReady()) {
          ready = true;
          break;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      if (!ready) {
        for (const item of queue.messages) {
          item.reject(new Error('Sandbox did not become ready within 90s'));
        }
        queue.messages = [];
        return;
      }

      while (queue.messages.length > 0) {
        const item = queue.messages.shift()!;
        try {
          if (this.processCallback) {
            await this.processCallback(item.message, item.config);
          }
          item.resolve();
        } catch (err) {
          item.reject(err);
        }
      }
    } catch (err) {
      for (const item of queue.messages) {
        item.reject(err);
      }
      queue.messages = [];
    } finally {
      queue.draining = false;
      this.queues.delete(sandboxId);
    }
  }

  queueSize(sandboxId: string): number {
    return this.queues.get(sandboxId)?.messages.length ?? 0;
  }
}
