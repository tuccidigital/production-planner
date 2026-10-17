import { FluentProvider } from '@fluentui/react-components';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { tucciTheme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={tucciTheme}>
      <App />
    </FluentProvider>
  </StrictMode>,
);
