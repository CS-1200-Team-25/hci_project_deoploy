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
    window.addEventListener('focus', reloadIfStorageChanged);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('focus', reloadIfStorageChanged);
    };
  }, [recovery]);

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
      trialIndex={trial.startedAt !== undefined ? session.currentTrialIndex : undefined} startedAt={trial.startedAt} completedAt={trial.completedAt}
      completionControl={session.phase === 'task' && definition ? { onComplete: completeTask } : session.phase === 'post-task-survey' ? false : undefined}>
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
        <TaskRenderer taskId={trial.task} state={trial.taskState} onChange={(state, action) => commit(updateTaskState(sessionRef.current!, state, action))} />
        {definition && <SupervisorControls session={session} onTerminate={(authorization, reason) => commit(terminateTask(sessionRef.current!, authorization, reason))} />}
      </>}
      {session.phase === 'post-task-survey' && <>
        <h2>{trial.outcome === 'successful' ? 'Task submitted successfully' : 'Trial ended by supervisor'}</h2>
        <p>Your final plan and outcome have been saved. The post-task survey will appear here when it is implemented.</p>
        {trial.terminationReason && <p>Termination reason: {trial.terminationReason}</p>}
        <ValidationFeedback result={trial.finalValidation} />
      </>}
      <details>
        <summary>Supervisor storage tools</summary>
        <p>For disposable QA sessions, edit or remove the saved session in browser storage, then reload it here. Preserve study data first. Reloading discards unsaved in-memory changes.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload saved session</button>
      </details>
    </ExperimentShell>
  );
}
