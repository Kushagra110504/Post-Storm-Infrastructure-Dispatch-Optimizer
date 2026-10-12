import { hillClimb, HillClimbResult, HillClimbProgress, HillClimbOptions } from '../core/hillclimb/hillClimb';
import { Scenario, CityGraph } from '../core/model/schema';
import { WorkerRequestSchema } from './schema';

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
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}

declare const self: WorkerGlobalContext;

let stopRequested = false;

if (typeof self !== 'undefined') {
  self.onmessage = (event: { data: unknown }) => {
    try {
      // Validate incoming request schema
      const req = WorkerRequestSchema.parse(event.data);

      if (req.type === 'STOP') {
        stopRequested = true;
        return;
      }

      if (req.type === 'START') {
        stopRequested = false;
        try {
          const result = hillClimb(req.scenario, req.graph, {
            ...req.options,
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
    } catch (validationErr) {
      self.postMessage({
        type: 'ERROR',
        error: `Worker message schema validation failed: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}`,
      });
    }
  };
}
