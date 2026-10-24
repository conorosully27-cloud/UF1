import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// If a screen fails to draw, say so and leave the save alone.
class Boundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app">
        <div className="err">Something went wrong drawing this screen: {String(this.state.error.message || this.state.error)}</div>
        <p>Your save has not been changed. <button onClick={() => window.location.reload()}>Reload</button></p>
      </div>
    )
  }
}

// ?faces opens the gallery of drivers' faces (VISUALS.md, V1) instead of the game.
const FaceGallery = lazy(() => import('./ui/FaceGallery.jsx'))
const page = new URLSearchParams(window.location.search).has('faces') ? <Suspense fallback={null}><FaceGallery /></Suspense> : <App />

createRoot(document.getElementById('root')).render(<Boundary>{page}</Boundary>)
