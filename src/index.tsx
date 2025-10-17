/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './components/App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/index.css'

console.log('Starting app...')
console.log('Root element:', document.getElementById('root'))

try {
  const root = createRoot(document.getElementById('root'))
  console.log('Root created:', root)
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
  console.log('App rendered')
} catch (error) {
  console.error('Error rendering app:', error)
}
