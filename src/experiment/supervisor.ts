import type { ExperimentSession } from '../types/experiment';

export interface SupervisorAuthorization { readonly sessionId: string }
const authorizations = new WeakSet<SupervisorAuthorization>();

async function verifier(code: string, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${code}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Local supervised protection: codes are never stored as plaintext; this is not remote authentication. */
export async function configureSupervisorAccess(session: ExperimentSession, code: string): Promise<ExperimentSession> {
  if (code.trim().length < 6) throw new Error('Use a supervisor access code of at least six characters.');
  const salt = crypto.randomUUID();
  return { ...session, supervisorAccess: { salt, verifier: await verifier(code, salt) } };
}

export async function authorizeSupervisor(session: ExperimentSession, code: string): Promise<SupervisorAuthorization | null> {
  if (!session.supervisorAccess || await verifier(code, session.supervisorAccess.salt) !== session.supervisorAccess.verifier) return null;
  const authorization = Object.freeze({ sessionId: session.sessionId });
  authorizations.add(authorization);
  return authorization;
}

export function isSupervisorAuthorized(session: ExperimentSession, authorization: SupervisorAuthorization) {
  return authorizations.has(authorization) && authorization.sessionId === session.sessionId;
}
