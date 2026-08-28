import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UniverseView } from './ui/Universe'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><UniverseView /></StrictMode>,
)
