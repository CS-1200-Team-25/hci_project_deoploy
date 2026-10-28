import { useEffect, useRef, useState } from 'react';
import type { ExperimentSession } from '../../types/experiment';
import { consentToSession, createSession, recoverSession, revealTask, submitTask, terminateTask, updateTaskState } from '../../experiment/session';
import { PILOT_SCENARIOS } from '../../experiment/scenarios';
import { downloadSession } from '../../experiment/export';
import { loadSession, saveSession, SESSION_STORAGE_KEY } from '../../experiment/persistence';
import { recordEvent } from '../../experiment/logger';
import { ExperimentShell } from './ExperimentShell';
import { TaskRenderer } from './TaskRenderer';
import { getTask } from '../../tasks/registry';
import { ValidationToast } from './ValidationToast';
import { configureSupervisorAccess } from '../../experiment/supervisor';
import { SupervisorControls } from './SupervisorControls';
import { SupervisorDrawer } from './SupervisorDrawer';
import { IssueScoreInspector } from './IssueScoreInspector';
import { assistanceWasDisplayed, setFinalSurveyDraft, setPostTaskSurveyDraft, submitFinalSurvey, submitPostTaskSurvey } from '../../experiment/surveys';
import { PostTaskSurveyForm } from './PostTaskSurveyForm';
import { FinalSurveyForm } from './FinalSurveyForm';
import { abandonSelection, beginGeneration, finishGeneration, respondToIntervention } from '../../experiment/generation';
import { validGenerationConfiguration } from '../../agent/generation';
import type { GenerationConfiguration } from '../../agent/generation';
import type { TaskAction } from '../../types/task';
import { GenerationStatus } from './GenerationStatus';
import { evaluateIdleTrial } from '../../experiment/interventions';
import { TrainingTask } from './TrainingTask';

export function ExperimentController() {
  const [recovery] = useState(() => {
    try { return { session: loadSession(), serialized: localStorage.getItem(SESSION_STORAGE_KEY), error: '' }; }
    catch { return { session: null, error: 'Stored data could not be recovered. Ask the supervisor to preserve local data before starting another session.' }; }
  });
  const [session, setSession] = useState<ExperimentSession | null>(recovery.session);
  const sessionRef = useRef(session);
  const lastStoredSession = useRef(recovery.serialized);
  const recovered = useRef(false);
  const storageReadFailed = useRef(false);
  const lastVisibility = useRef(document.visibilityState);
  const [participantId, setParticipantId] = useState('');
  const [sequenceIndex, setSequenceIndex] = useState('1');
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState(recovery.error);
  const [supervisorCode, setSupervisorCode] = useState('');
  const [showIssueScores, setShowIssueScores] = useState(false);
  const creating = useRef(false);
  const mounted = useRef(false);
  const generationConfig = useRef<GenerationConfiguration | null>(null);
  const generationConfigRequest = useRef<Promise<GenerationConfiguration> | null>(null);
  const pendingRequest = useRef<{ id: string; trialId: string; revision: number; controller: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [validationToast, setValidationToast] = useState<{ attempt: number; errors: string[] } | null>(null);

  function reloadIfStorageChanged() {
    try {
      if (lastStoredSession.current !== undefined
        && localStorage.getItem(SESSION_STORAGE_KEY) !== lastStoredSession.current) {
        window.location.reload();
        return true;
      }
    } catch {
      storageReadFailed.current = true;
      setError('Local storage could not be read. Keep this tab open and export the available records.');
    }
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
    if (storageReadFailed.current) {
      next = recordEvent(next, 'persistence_failed', { operation: 'read' });
      storageReadFailed.current = false;
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
    mounted.current = true;
    // Wake the backend during setup, without requesting advice or changing study state.
    void loadGenerationConfiguration().catch(() => {});
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
      mounted.current = false;
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

  useEffect(() => {
    // Allow a fresh idle period after mounting; recovery never replays a selection.
    const mountedAt = Date.now();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - mountedAt < 30_000
        || reloadIfStorageChanged()) return;
      const previous = sessionRef.current;
      if (!previous) return;
      const next = evaluateIdleTrial(previous);
      if (next === previous) return;
      commit(next);
      void generateSelectedAdvice(previous, next);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function editTask(state: unknown, action: TaskAction) {
    if (reloadIfStorageChanged()) return;
    const previous = sessionRef.current!;
    const next = updateTaskState(previous, state, action);
    commit(next);
    await generateSelectedAdvice(previous, next);
  }

  function loadGenerationConfiguration(): Promise<GenerationConfiguration> {
    if (generationConfig.current) return Promise.resolve(generationConfig.current);
    if (generationConfigRequest.current) return generationConfigRequest.current;
    generationConfigRequest.current = (async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch('/api/interventions/config', {
            cache: 'no-store', signal: AbortSignal.timeout(Math.min(15_000, deadline - Date.now())),
          });
          if (!response.ok) throw new Error('configuration-unavailable');
          const value: unknown = await response.json();
          if (!validGenerationConfiguration(value)) throw new Error('configuration-unavailable');
          generationConfig.current = value;
          return value;
        } catch {
          if (Date.now() >= deadline) break;
          await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
        }
      }
      throw new Error('configuration-unavailable');
    })().finally(() => { generationConfigRequest.current = null; });
    return generationConfigRequest.current;
  }

  async function generateSelectedAdvice(previous: ExperimentSession, next: ExperimentSession) {
    const selection = next.trials[next.currentTrialIndex].agentHistory?.selections.at(-1);
    if (!selection || selection.stateRevision !== next.trials[next.currentTrialIndex].stateRevision
      || previous.trials[previous.currentTrialIndex].agentHistory?.selections.some((candidate) => candidate.id === selection.id)) return;
    let config: GenerationConfiguration;
    try {
      config = await loadGenerationConfiguration();
    } catch {
      if (mounted.current) commit(abandonSelection(sessionRef.current!, selection.id, 'configuration-unavailable'));
      return;
    }
    if (!mounted.current) return;
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
    const current = sessionRef.current!;
    if (current.trials[current.currentTrialIndex].agentHistory?.interventions?.some(advice => !advice.response)) return;
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
      completionControl={session.phase === 'task' && definition ? { onComplete: completeTask,
        disabled: trial.agentHistory?.interventions?.some(advice => !advice.response) } : false}>
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
        <p>Assistant suggestions appear as toasts that stay visible while scrolling. Each stays until you acknowledge or dismiss it. Respond to all suggestions before completing the task. There is no chat.</p>
        <p>Timing begins when you reveal the scenario, including reading, editing and submission attempts. It continues through hidden tabs and reloads. There is no automatic timeout.</p>
        <TrainingTask completed={session.events.some(event => event.eventType === 'training_completed')}
          onAction={(action, quantity) => commit(recordEvent(sessionRef.current!, 'training_action', { action, quantity }))}
          onComplete={() => commit(recordEvent(sessionRef.current!, 'training_completed'))} />
        <p>When you are ready, reveal your first task. You may skip practice.</p>
        <button onClick={() => commit(revealTask(sessionRef.current!))}>Reveal first task</button>
      </>}
      {session.phase === 'task' && <>
        <h2>Scenario and minimum requirements</h2>
        <p>{scenario.instructions}</p>
        {validationToast && <ValidationToast key={validationToast.attempt} errors={validationToast.errors}
          onDismiss={() => setValidationToast(null)} />}
        <TaskRenderer taskId={trial.task} state={trial.taskState} onChange={editTask} />
      </>}
      {session.phase === 'post-task-survey' && <>
        <h2>{trial.outcome === 'successful' ? 'Task submitted successfully' : 'Trial ended by supervisor'}</h2>
        <p>Your final plan and outcome are recorded. Answer both questions to continue.</p>
        {trial.terminationReason && <p>Termination reason: {trial.terminationReason}</p>}
        <PostTaskSurveyForm draft={session.postTaskSurveyDrafts[trial.id] ?? {}} allowNotApplicable={!assistanceWasDisplayed(session, trial.id)}
          onChange={(draft) => commit(setPostTaskSurveyDraft(sessionRef.current!, draft))} onSubmit={() => commit(submitPostTaskSurvey(sessionRef.current!))} />
      </>}
      {session.phase === 'final-survey' && <FinalSurveyForm draft={session.finalSurveyDraft} trials={session.trials}
        onChange={(draft) => commit(setFinalSurveyDraft(sessionRef.current!, draft))} onSubmit={() => commit(submitFinalSurvey(sessionRef.current!))} />}
      {session.phase === 'complete' && <><h2>Session complete</h2><p>Thank you. Tell the supervisor you have finished so they can export the session records.</p></>}
      <GenerationStatus events={session.events} />
      {showIssueScores && <IssueScoreInspector session={session} />}
      <SupervisorDrawer key={session.phase}>
      <div className="score-toggle-setting">
      <label className="score-toggle-label">
        <span>Show AI issue scores on main page</span>
        <input type="checkbox" role="switch" checked={showIssueScores} aria-describedby="score-toggle-help"
          onChange={event => setShowIssueScores(event.target.checked)} />
      </label>
      <p id="score-toggle-help">Testing only. Scores update automatically while you edit. Turn off for participant sessions.</p>
      </div>
      {session.phase === 'task' && definition && <SupervisorControls session={session} onTerminate={(authorization, reason) => commit(terminateTask(sessionRef.current!, authorization, reason))} />}
      <details className="supervisor-controls">
        <summary>Supervisor storage tools</summary>
        <button type="button" onClick={() => {
          let available = sessionRef.current!;
          if (storageReadFailed.current) {
            available = recordEvent(available, 'persistence_failed', { operation: 'read' });
            storageReadFailed.current = false;
            sessionRef.current = available;
            setSession(available);
          }
          downloadSession(available);
        }}>Download session JSON</button>
        <p>Download complete or incomplete records without clearing local data. Check that the file was saved before closing this tab.</p>
        {session.events.some((event) => event.eventType === 'persistence_failed') && <p>Retention is compromised: local storage failed during this session. Export the available in-memory records now.</p>}
        <p>For disposable QA sessions, edit or remove the saved session in browser storage, then reload it here. Preserve study data first. Reloading discards unsaved in-memory changes.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload saved session</button>
      </details>
      </SupervisorDrawer>
    </ExperimentShell>
  );
}
