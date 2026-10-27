import type { PilotConfiguration } from '../types/experiment';

export const PILOT_CONFIGURATION: PilotConfiguration = {
  version: 'pilot-7',
  sequenceVersion: 'task-condition-cross-36-v1',
  scenarioVersion: 'pilot-scenarios-v4',
  policyVersion: 'pilot-policy-v4',
  signalVersion: 'planning-signals-v3',
  displayCooldowns: { globalMs: 30_000, signalMs: 60_000 },
  surveyVersion: 'pilot-surveys-v1',
  conditions: {
    baseline: { proactive: false, threshold: null },
    low: { proactive: true, threshold: 0.6 },
    high: { proactive: true, threshold: 0.3 },
  },
};
