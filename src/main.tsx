import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/space-grotesk/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles.css';
import { App } from './App';
import { applyAppearance } from './lib/appearance';

applyAppearance();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
