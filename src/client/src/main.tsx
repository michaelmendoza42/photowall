import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('photo-wall: #root element missing from index.html');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
