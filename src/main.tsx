import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ExperimentPage } from './app/experiment/page';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExperimentPage />
  </StrictMode>,
);
