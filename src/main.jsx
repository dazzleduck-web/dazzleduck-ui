import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QueryDashboardProvider } from './context/QueryDashboardContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryDashboardProvider>
      <App />
    </QueryDashboardProvider>
  </StrictMode>
)
