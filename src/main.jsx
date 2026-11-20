import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QueryDashboardProvider } from './context/QueryDashboardContext.jsx'
import ErrorBoundary from './components/utils/ErrorBoundary.jsx'
import AiProvider from './context/AiContext.jsx'

// The ONLY place that reads env values. There is no API key here: each user
// enters their own key in Connection Settings (kept in that tab's sessionStorage).
const aiConfig = {
  enabled: import.meta.env.VITE_AI_ENABLED,
  defaultLimit: import.meta.env.VITE_AI_DEFAULT_LIMIT,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryDashboardProvider>
        <AiProvider config={aiConfig}>
          <App />
        </AiProvider>
      </QueryDashboardProvider>
    </ErrorBoundary>
  </StrictMode>
)
