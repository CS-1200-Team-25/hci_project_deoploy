import { useState } from 'react';
import type { ExperimentSession } from '../../types/experiment';
import { authorizeSupervisor } from '../../experiment/supervisor';
import type { SupervisorAuthorization } from '../../experiment/supervisor';

export function SupervisorControls({ session, onTerminate }: {
  session: ExperimentSession;
  onTerminate(authorization: SupervisorAuthorization, reason: string): void;
}) {
  const [code, setCode] = useState('');
  const [authorization, setAuthorization] = useState<SupervisorAuthorization | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return <details className="supervisor-controls">
    <summary>Supervisor access</summary>
    {!authorization ? <form onSubmit={async (event) => {
      event.preventDefault();
      const access = await authorizeSupervisor(session, code);
      if (access) { setAuthorization(access); setCode(''); setError(''); }
      else setError('Access code did not match. Ask the supervisor to use the code configured during setup.');
    }}>
      <label>Supervisor access code<input type="password" required value={code} onChange={(event) => setCode(event.target.value)} /></label>
      <button type="submit">Unlock supervisor controls</button>
    </form> : <form onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onTerminate(authorization, reason); }}>
      <p>Exceptional termination records an unsuccessful trial. It does not count as time to successful completion.</p>
      <label>Termination reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={!reason.trim()}>End unsuccessful trial</button>
      <button type="button" onClick={() => { setAuthorization(null); setReason(''); }}>Lock supervisor controls</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
