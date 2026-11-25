import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App.jsx'
import CursorFX from './components/CursorFX.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <CursorFX />
  </StrictMode>,
)
