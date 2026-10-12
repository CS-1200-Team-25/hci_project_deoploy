import { useRef, useState, type ReactNode } from 'react';

export function SupervisorDrawer({ children }: { children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return <>
    <button ref={trigger} type="button" className="supervisor-trigger" aria-label="Open supervisor tools"
      aria-haspopup="dialog" aria-controls="supervisor-drawer" aria-expanded={open}
      onClick={() => { drawer.current?.showModal(); setOpen(true); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    </button>
    <dialog ref={drawer} id="supervisor-drawer" className="supervisor-drawer" aria-labelledby="supervisor-drawer-title"
      onClose={() => { setOpen(false); trigger.current?.focus(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) drawer.current?.close();
      }}>
      <div className="supervisor-drawer-heading">
        <h2 id="supervisor-drawer-title">Supervisor tools</h2>
        <button type="button" autoFocus aria-label="Close supervisor tools" onClick={() => drawer.current?.close()}>Close</button>
      </div>
      {children}
    </dialog>
  </>;
}
