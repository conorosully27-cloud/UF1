import React from 'react'
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

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>)
