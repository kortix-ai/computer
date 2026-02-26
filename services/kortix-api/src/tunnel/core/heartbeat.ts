/**
 * HeartbeatManager — monitors tunnel agent liveness via periodic pings.
 *
 * Sends `tunnel.ping` notifications over WS and expects `tunnel.pong` back.
 * After N missed pongs, marks the tunnel as offline in the DB.
 */

import { eq } from 'drizzle-orm';
import { tunnelConnections } from '@kortix/db';
import { db } from '../../shared/db';
import { config } from '../../config';
import { tunnelRelay } from './relay';

interface HeartbeatState {
  missedPongs: number;
  lastPongAt: number;
}

export class HeartbeatManager {
  private states = new Map<string, HeartbeatState>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(
      () => this.tick(),
      config.TUNNEL_HEARTBEAT_INTERVAL_MS,
    );

    console.log(`[tunnel-heartbeat] Started (interval: ${config.TUNNEL_HEARTBEAT_INTERVAL_MS}ms, max missed: ${config.TUNNEL_HEARTBEAT_MAX_MISSED})`);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.states.clear();
    console.log('[tunnel-heartbeat] Stopped');
  }

  register(tunnelId: string): void {
    this.states.set(tunnelId, {
      missedPongs: 0,
      lastPongAt: Date.now(),
    });
  }

  unregister(tunnelId: string): void {
    this.states.delete(tunnelId);
  }

  recordPong(tunnelId: string): void {
    const state = this.states.get(tunnelId);
    if (state) {
      state.missedPongs = 0;
      state.lastPongAt = Date.now();
    }

    db.update(tunnelConnections)
      .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(eq(tunnelConnections.tunnelId, tunnelId))
      .catch((err) => console.warn(`[tunnel-heartbeat] DB update failed for ${tunnelId}:`, err));
  }

  private async tick(): Promise<void> {
    for (const [tunnelId, state] of this.states) {
      const sent = tunnelRelay.sendNotification(tunnelId, 'tunnel.ping', {
        timestamp: Date.now(),
      });

      if (!sent) {
        this.states.delete(tunnelId);
        continue;
      }

      state.missedPongs++;

      if (state.missedPongs >= config.TUNNEL_HEARTBEAT_MAX_MISSED) {
        console.warn(`[tunnel-heartbeat] Agent ${tunnelId} missed ${state.missedPongs} pongs — marking offline`);
        await this.markOffline(tunnelId);
        this.states.delete(tunnelId);
      }
    }
  }

  private async markOffline(tunnelId: string): Promise<void> {
    try {
      await db
        .update(tunnelConnections)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(eq(tunnelConnections.tunnelId, tunnelId));
    } catch (err) {
      console.error(`[tunnel-heartbeat] Failed to mark ${tunnelId} offline:`, err);
    }
  }
}

export const heartbeatManager = new HeartbeatManager();
