import { useEffect, useState } from 'react';

export function Timer({ startedAt, completedAt }: { startedAt?: number; completedAt?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (startedAt === undefined || completedAt !== undefined) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, completedAt]);
  const seconds = startedAt === undefined ? 0 : Math.floor(Math.max(0, (completedAt ?? now) - startedAt) / 1000);
  const elapsed = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return (
    <div className="timer" aria-label="Elapsed time">
      <span>Elapsed</span>
      <strong>{elapsed}</strong>
    </div>
  );
}
