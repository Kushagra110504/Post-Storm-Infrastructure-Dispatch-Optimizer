import { CityGraph, Scenario } from '../core/model/schema';
import {
  HillClimbOptions,
  HillClimbProgress,
  HillClimbResult,
  hillClimb,
} from '../core/hillclimb/hillClimb';
import type { WorkerRequest, WorkerResponse } from './optimizer.worker';

export interface OptimizerCallbacks {
  onProgress?: (progress: HillClimbProgress) => void;
  onDone?: (result: HillClimbResult) => void;
  onError?: (err: Error) => void;
}

interface WorkerHandle {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((error: { message?: string }) => void) | null;
}

declare const Worker:
  | {
      new (url: URL | string, options?: { type?: string }): WorkerHandle;
    }
  | undefined;

/**
 * Controller to manage background Hill Climbing optimization runs.
 * Uses Web Worker in supported browser environments with automatic main-thread
 * fallback if Worker is unavailable.
 */
export class OptimizerRunner {
  private worker: WorkerHandle | null = null;
  private isRunning = false;
  private shouldStopFallback = false;

  public start(
    scenario: Scenario,
    graph: CityGraph,
    options: Partial<HillClimbOptions> = {},
    callbacks: OptimizerCallbacks = {}
  ): void {
    if (this.isRunning) {
      this.stop();
    }
    this.isRunning = true;
    this.shouldStopFallback = false;

    // Check for Web Worker support
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('./optimizer.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event: { data: WorkerResponse }) => {
          const res = event.data;
          if (!res) return;

          if (res.type === 'PROGRESS') {
            callbacks.onProgress?.(res.progress);
          } else if (res.type === 'DONE') {
            this.isRunning = false;
            this.terminateWorker();
            callbacks.onDone?.(res.result);
          } else if (res.type === 'ERROR') {
            this.isRunning = false;
            this.terminateWorker();
            callbacks.onError?.(new Error(res.error));
          }
        };

        this.worker.onerror = (err: { message?: string }) => {
          this.isRunning = false;
          this.terminateWorker();
          callbacks.onError?.(new Error(err.message || 'Worker encountered an error'));
        };

        const req: WorkerRequest = {
          type: 'START',
          scenario,
          graph,
          options,
        };
        this.worker.postMessage(req);
        return;
      } catch (e) {
        console.warn('Worker initialization failed, falling back to direct execution:', e);
      }
    }

    // Fallback: asynchronous main thread execution
    setTimeout(() => {
      try {
        const result = hillClimb(scenario, graph, {
          ...options,
          shouldStop: () => this.shouldStopFallback,
          onProgress: (p) => callbacks.onProgress?.(p),
        });
        this.isRunning = false;
        callbacks.onDone?.(result);
      } catch (err) {
        this.isRunning = false;
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }, 0);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.shouldStopFallback = true;
    if (this.worker) {
      try {
        const stopReq: WorkerRequest = { type: 'STOP' };
        this.worker.postMessage(stopReq);
      } catch {
        // worker may already be closed
      }
      setTimeout(() => this.terminateWorker(), 200);
    }
    this.isRunning = false;
  }

  public get running(): boolean {
    return this.isRunning;
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
