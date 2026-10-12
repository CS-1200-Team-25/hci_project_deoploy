import { useEffect, useRef, useState } from 'react';
import type { ExperimentSession } from '../../types/experiment';
import { consentToSession, createSession, recoverSession, revealTask, submitTask, terminateTask, updateTaskState } from '../../experiment/session';
import { PILOT_SCENARIOS } from '../../experiment/scenarios';
import { loadSession, saveSession, SESSION_STORAGE_KEY } from '../../experiment/persistence';
import { recordEvent } from '../../experiment/logger';
import { ExperimentShell } from './ExperimentShell';
import { TaskRenderer } from './TaskRenderer';
import { getTask } from '../../tasks/registry';
import { ValidationFeedback } from './ValidationFeedback';
import { ValidationToast } from './ValidationToast';
import { configureSupervisorAccess } from '../../experiment/supervisor';
import { SupervisorControls } from './SupervisorControls';
import { assistanceWasDisplayed, setFinalSurveyDraft, setPostTaskSurveyDraft, submitFinalSurvey, submitPostTaskSurvey } from '../../experiment/surveys';
import { PostTaskSurveyForm } from './PostTaskSurveyForm';
import { FinalSurveyForm } from './FinalSurveyForm';
import { abandonSelection, beginGeneration, finishGeneration, respondToIntervention } from '../../experiment/generation';
import { validGenerationConfiguration } from '../../agent/generation';
import type { GenerationConfiguration } from '../../agent/generation';
import type { TaskAction } from '../../types/task';
import { GenerationStatus } from './GenerationStatus';

export function ExperimentController() {
  const [recovery] = useState(() => {
    try { return { session: loadSession(), serialized: localStorage.getItem(SESSION_STORAGE_KEY), error: '' }; }
    catch { return { session: null, error: 'Stored data could not be recovered. Ask the supervisor to preserve local data before starting another session.' }; }
  });
  const [session, setSession] = useState<ExperimentSession | null>(recovery.session);
  const sessionRef = useRef(session);
  const lastStoredSession = useRef(recovery.serialized);
  const recovered = useRef(false);
  const lastVisibility = useRef(document.visibilityState);
  const [participantId, setParticipantId] = useState('');
  const [sequenceIndex, setSequenceIndex] = useState('1');
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState(recovery.error);
  const [supervisorCode, setSupervisorCode] = useState('');
  const creating = useRef(false);
  const generationConfig = useRef<GenerationConfiguration | null>(null);
  const pendingRequest = useRef<{ id: string; trialId: string; revision: number; controller: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [validationToast, setValidationToast] = useState<{ attempt: number; errors: string[] } | null>(null);

  function reloadIfStorageChanged() {
    try {
      if (lastStoredSession.current !== undefined
        && localStorage.getItem(SESSION_STORAGE_KEY) !== lastStoredSession.current) {
        window.location.reload();
        return true;
      }
    } catch { /* Save failures are handled by commit without discarding in-memory data. */ }
    return false;
  }

  function commit(next: ExperimentSession) {
    if (reloadIfStorageChanged()) return;
    const pending = pendingRequest.current;
    const active = next.trials[next.currentTrialIndex];
    if (pending && (next.phase !== 'task' || active.id !== pending.trialId || active.stateRevision !== pending.revision)) {
      clearTimeout(pending.timer);
      pending.controller.abort();
      pendingRequest.current = null;
      next = finishGeneration(next, pending.id, 'canceled', undefined, 'task-changed');
    }
    let saved = next;
    try {
      saved = saveSession(next);
      lastStoredSession.current = JSON.stringify(saved);
      setError('');
    }
    catch {
      saved = recordEvent(next, 'persistence_failed', { operation: 'save' });
      setError('Local saving failed. Keep this tab open and inform the supervisor; the current session remains in memory.');
    }
    sessionRef.current = saved;
    setSession(saved);
  }

  useEffect(() => {
    if (recovery.session && !recovered.current) {
      recovered.current = true;
      commit(recoverSession(recovery.session));
    }
    function visibilityChanged() {
      const current = sessionRef.current;
      const visibility = document.visibilityState;
      if (visibility === lastVisibility.current) return;
      lastVisibility.current = visibility;
      if (current) commit(recordEvent(current, 'visibility_changed', { visibility }));
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    function pageHidden() {
      const pending = pendingRequest.current;
      if (!pending || !sessionRef.current) return;
      pendingRequest.current = null;
      clearTimeout(pending.timer);
      pending.controller.abort();
      commit(finishGeneration(sessionRef.current, pending.id, 'interrupted', undefined, 'page-unload'));
    }
    window.addEventListener('pagehide', pageHidden);
    window.addEventListener('focus', reloadIfStorageChanged);
    return () => {
      if (pendingRequest.current) {
        const pending = pendingRequest.current;
        pendingRequest.current = null;
        clearTimeout(pending.timer);
        pending.controller.abort();
      }
      window.removeEventListener('pagehide', pageHidden);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('focus', reloadIfStorageChanged);
    };
  }, [recovery]);

  async function editTask(state: unknown, action: TaskAction) {
    if (reloadIfStorageChanged()) return;
    const previous = sessionRef.current!;
    const next = updateTaskState(previous, state, action);
    commit(next);
    const selection = next.trials[next.currentTrialIndex].agentHistory?.selections.at(-1);
    if (!selection || selection.stateRevision !== next.trials[next.currentTrialIndex].stateRevision
      || previous.trials[previous.currentTrialIndex].agentHistory?.selections.some((candidate) => candidate.id === selection.id)) return;
    let config = generationConfig.current;
    if (!config) {
      try {
        const response = await fetch('/api/interventions/config', { signal: AbortSignal.timeout(5000) });
        const value: unknown = await response.json();
        if (!response.ok || !validGenerationConfiguration(value)) throw new Error('configuration-unavailable');
        config = value;
        generationConfig.current = config;
      } catch {
        const current = sessionRef.current!;
        commit(abandonSelection(current, selection.id, 'configuration-unavailable'));
        return;
      }
    }
    const started = beginGeneration(sessionRef.current!, selection.id, config);
    if (started === sessionRef.current) {
      commit(abandonSelection(sessionRef.current!, selection.id, 'selection-no-longer-current'));
      return;
    }
    const trial = started.trials[started.currentTrialIndex];
    const record = trial.agentHistory!.requests!.at(-1)!;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (pendingRequest.current?.id !== record.id) return;
      pendingRequest.current = null;
      controller.abort();
      commit(finishGeneration(sessionRef.current!, record.id, 'timeout', undefined, 'finite-timeout'));
    }, config.timeoutMs);
    pendingRequest.current = { id: record.id, trialId: trial.id, revision: trial.stateRevision, controller, timer };
    commit(started);
    try {
      const response = await fetch('/api/interventions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record.request), signal: controller.signal });
      let value: unknown;
      try { value = await response.json(); }
      catch {
        if (pendingRequest.current?.id !== record.id) return;
        clearTimeout(timer);
        pendingRequest.current = null;
        commit(finishGeneration(sessionRef.current!, record.id, 'invalid', undefined, 'invalid-json'));
        return;
      }
      if (pendingRequest.current?.id !== record.id) return;
      clearTimeout(timer);
      pendingRequest.current = null;
      const providerError = typeof value === 'object' && value !== null && 'error' in value ? String(value.error) : '';
      const status = response.ok ? 'succeeded' : providerError === 'provider-timeout' ? 'timeout'
        : providerError === 'invalid-provider-response' ? 'invalid' : 'failed';
      commit(finishGeneration(sessionRef.current!, record.id, status, value, response.ok ? undefined : providerError || `http-${response.status}`));
    } catch {
      if (pendingRequest.current?.id !== record.id) return;
      clearTimeout(timer);
      pendingRequest.current = null;
      commit(finishGeneration(sessionRef.current!, record.id, 'failed', undefined, 'transport-or-json-error'));
    }
  }

  if (!session) {
    return (
      <ExperimentShell title="Supervisor setup">
        <h2>Assign a pilot session</h2>
        <p>Enter a pseudonymous ID, without names or contact details. Allocate indices sequentially across supervised sessions.</p>
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (creating.current || sessionRef.current || recovery.error) return;
          creating.current = true;
          try {
            commit(await configureSupervisorAccess(createSession(participantId.trim(), Number(sequenceIndex)), supervisorCode));
            setSupervisorCode('');
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to create session.');
          } finally { creating.current = false; }
        }}>
          <label>Participant ID<input required value={participantId} onChange={(event) => setParticipantId(event.target.value)} /></label>
          <label>Sequence index<input type="number" min="1" max="36" required value={sequenceIndex} onChange={(event) => setSequenceIndex(event.target.value)} /></label>
          <label>Supervisor access code<input type="password" minLength={6} required value={supervisorCode} onChange={(event) => setSupervisorCode(event.target.value)} /></label>
          <p>Keep this code with the supervisor. It unlocks exceptional termination; participants should not be given the code.</p>
          <p>36 predetermined sequences balance task, condition and position over a full allocation cycle. Smaller pilots may remain unbalanced.</p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={Boolean(recovery.error)}>Create session</button>
        </form>
        <button type="button" onClick={() => window.location.reload()}>Reload saved session</button>
      </ExperimentShell>
    );
  }

  const trial = session.trials[session.currentTrialIndex];
  const scenario = PILOT_SCENARIOS[trial.task];
  const definition = getTask(trial.task);

  function completeTask() {
    if (reloadIfStorageChanged()) return;
    const next = submitTask(sessionRef.current!);
    commit(next);
    const attempts = next.trials[next.currentTrialIndex].submissionAttempts;
    const validation = attempts?.at(-1)?.validation;
    setValidationToast(validation && !validation.isComplete
      ? { attempt: attempts!.length, errors: validation.errors }
      : null);
  }

  return (
    <ExperimentShell title={session.phase === 'task' ? scenario.title : 'Planning session'}
      assistant={{ interventions: trial.agentHistory?.interventions, onRespond: session.phase === 'task'
        ? (id, response) => commit(respondToIntervention(sessionRef.current!, id, response)) : undefined }}
      trialIndex={trial.startedAt !== undefined ? session.currentTrialIndex : undefined} startedAt={trial.startedAt} completedAt={trial.completedAt}
      completionControl={session.phase === 'task' && definition ? { onComplete: completeTask } : false}>
      {error && <p role="alert">{error}</p>}
      {session.phase === 'welcome' && <>
        <h2>Welcome to the planning pilot</h2>
        <p>This supervised pilot compares planning experiences across three fictional tasks. Participation is voluntary: you can stop and speak to the supervisor at any time.</p>
        <p>We record planning actions, time, assistant messages and survey answers locally under your pseudonymous ID. Do not enter personal information.</p>
        <p>This information and consent wording is a pilot draft for internal testing.</p>
        <label className="checkbox-label"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />I consent to take part in this supervised pilot</label>
        <button disabled={!consented} onClick={() => commit(consentToSession(sessionRef.current!))}>Continue to instructions</button>
      </>}
      {session.phase === 'instructions' && <>
        <h2>Shared instructions</h2>
        <p>You will complete three planning tasks, each followed by a short survey. Use predefined options to build and revise each plan.</p>
        <p>Each scenario lists all minimum passing requirements. Complete task checks your plan; blocking errors must be corrected, while optional improvements do not prevent completion.</p>
        <p>The assistant panel stays in the same place throughout. Suggestions may appear there, and you can acknowledge or dismiss them. There is no chat.</p>
        <p>Timing begins when you reveal the scenario, including reading, editing and submission attempts. It continues through hidden tabs and reloads. There is no automatic timeout.</p>
        <button onClick={() => commit(revealTask(sessionRef.current!))}>Reveal first task</button>
      </>}
      {session.phase === 'task' && <>
        <h2>Scenario and minimum requirements</h2>
        <p>{scenario.instructions}</p>
        <ValidationFeedback result={trial.submissionAttempts?.at(-1)?.validation} announceErrors={false} />
        {validationToast && <ValidationToast key={validationToast.attempt} errors={validationToast.errors}
          onDismiss={() => setValidationToast(null)} />}
        <TaskRenderer taskId={trial.task} state={trial.taskState} onChange={editTask} />
        {definition && <SupervisorControls session={session} onTerminate={(authorization, reason) => commit(terminateTask(sessionRef.current!, authorization, reason))} />}
      </>}
      {session.phase === 'post-task-survey' && <>
        <h2>{trial.outcome === 'successful' ? 'Task submitted successfully' : 'Trial ended by supervisor'}</h2>
        <p>Your final plan and outcome have been saved. Answer both questions to continue.</p>
        {trial.terminationReason && <p>Termination reason: {trial.terminationReason}</p>}
        <ValidationFeedback result={trial.finalValidation} />
        <PostTaskSurveyForm draft={session.postTaskSurveyDrafts[trial.id] ?? {}} allowNotApplicable={!assistanceWasDisplayed(session, trial.id)}
          onChange={(draft) => commit(setPostTaskSurveyDraft(sessionRef.current!, draft))} onSubmit={() => commit(submitPostTaskSurvey(sessionRef.current!))} />
      </>}
      {session.phase === 'final-survey' && <FinalSurveyForm draft={session.finalSurveyDraft} trials={session.trials}
        onChange={(draft) => commit(setFinalSurveyDraft(sessionRef.current!, draft))} onSubmit={() => commit(submitFinalSurvey(sessionRef.current!))} />}
      {session.phase === 'complete' && <><h2>Session complete</h2><p>Thank you. Your session records are saved in this browser. Tell the supervisor you have finished.</p></>}
      <GenerationStatus events={session.events} />
      <details>
        <summary>Supervisor storage tools</summary>
        <p>For disposable QA sessions, edit or remove the saved session in browser storage, then reload it here. Preserve study data first. Reloading discards unsaved in-memory changes.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload saved session</button>
      </details>
    </ExperimentShell>
  );
}
