import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { universeRoute } from './shareRoute'
import './theme.css'

const root = createRoot(document.getElementById('root')!)
const route = universeRoute()

if (route.kind === 'share') {
  import('./ui/SharedView').then(({ SharedView }) => {
    root.render(<StrictMode><SharedView shareId={route.id} /></StrictMode>)
  })
} else {
  import('./ui/Universe').then(({ PrivateUniverseView }) => {
    root.render(<StrictMode><PrivateUniverseView /></StrictMode>)
  })
}
