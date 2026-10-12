import { z } from 'zod';
import { ScenarioSchema, CityGraphSchema } from '../core/model/schema';

export const HillClimbOptionsSchema = z.object({
  maxRestarts: z.number().int().positive().optional(),
  maxIterationsPerRestart: z.number().int().positive().optional(),
  neighborsPerStep: z.number().int().positive().optional(),
  seed: z.number().optional(),
  weights: z
    .object({
      alpha: z.number().nonnegative(),
      beta: z.number().nonnegative(),
      gamma: z.number().nonnegative(),
    })
    .optional(),
});

export const WorkerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('START'),
    scenario: ScenarioSchema,
    graph: CityGraphSchema,
    options: HillClimbOptionsSchema.optional(),
  }),
  z.object({
    type: z.literal('STOP'),
  }),
]);

export type ValidatedWorkerRequest = z.infer<typeof WorkerRequestSchema>;
