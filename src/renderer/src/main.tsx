import './assets/main.css'

import { StrictMode, useCallback, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import LockScreen from './pages/LockScreen'

function Root(): ReactNode {
  const [unlocked, setUnlocked] = useState(false)
  const onUnlock = useCallback(() => setUnlocked(true), [])
  return unlocked ? <App onLock={() => setUnlocked(false)} /> : <LockScreen onUnlock={onUnlock} />
}

// Files dropped outside a drop zone are ignored instead of opening in the window.
for (const type of ['dragover', 'drop'] as const) {
  document.addEventListener(type, (e) => e.preventDefault())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
