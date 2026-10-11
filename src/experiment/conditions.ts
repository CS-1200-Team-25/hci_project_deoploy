import type { PilotConfiguration } from '../types/experiment';

export const PILOT_CONFIGURATION: PilotConfiguration = {
  version: 'pilot-1',
  sequenceVersion: 'task-condition-cross-36-v1',
  scenarioVersion: 'pilot-scenarios-v2',
  policyVersion: 'pilot-policy-v1',
  conditions: {
    baseline: { proactive: false, threshold: null },
    low: { proactive: true, threshold: 0.75 },
    high: { proactive: true, threshold: 0.4 },
  },
};
