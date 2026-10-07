export function ProgressIndicator({ trialIndex }: { trialIndex?: number }) {
  return <p className="task-progress">{trialIndex === undefined ? 'Three planning tasks' : `Task ${trialIndex + 1} of 3`}</p>;
}
