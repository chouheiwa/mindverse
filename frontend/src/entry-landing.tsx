import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './ui/Landing'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><Landing /></StrictMode>,
)
