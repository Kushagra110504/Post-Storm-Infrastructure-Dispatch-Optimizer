import { hillClimb, HillClimbResult, HillClimbProgress, HillClimbOptions } from '../core/hillclimb/hillClimb';
import { Scenario, CityGraph } from '../core/model/schema';

export type WorkerRequest =
  | {
      type: 'START';
      scenario: Scenario;
      graph: CityGraph;
      options?: Partial<HillClimbOptions>;
    }
  | {
      type: 'STOP';
    };

export type WorkerResponse =
  | {
      type: 'PROGRESS';
      progress: HillClimbProgress;
    }
  | {
      type: 'DONE';
      result: HillClimbResult;
    }
  | {
      type: 'ERROR';
      error: string;
    };

// Typed declaration for Web Worker global scope
interface WorkerGlobalContext {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}

declare const self: WorkerGlobalContext;

let stopRequested = false;

if (typeof self !== 'undefined') {
  self.onmessage = (event: { data: WorkerRequest }) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'STOP') {
      stopRequested = true;
      return;
    }

    if (data.type === 'START') {
      stopRequested = false;
      try {
        const result = hillClimb(data.scenario, data.graph, {
          ...data.options,
          shouldStop: () => stopRequested,
          onProgress: (progress) => {
            self.postMessage({
              type: 'PROGRESS',
              progress,
            });
          },
        });

        self.postMessage({
          type: 'DONE',
          result,
        });
      } catch (err) {
        self.postMessage({
          type: 'ERROR',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}
