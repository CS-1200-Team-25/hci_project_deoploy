import type { ValidationResult } from '../../types/task';

export function ValidationFeedback({ result, announceErrors = true }: { result?: ValidationResult; announceErrors?: boolean }) {
  if (!result) return null;
  return <div className="validation-feedback">
    {result.errors.length > 0 && <div role={announceErrors ? 'alert' : undefined}><h3>Requirements to correct</h3><ul>{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
    {result.warnings.length > 0 && <div><h3>Optional improvements</h3><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
  </div>;
}
