import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * A WebGL-context-creation failure (or any other Three.js/R3F render
 * error) throws during React's render phase, which only a class-based
 * error boundary can catch — a try/catch in a function component cannot.
 */
export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="rounded-2xl border border-ink-900/10 bg-cream-50 p-8 text-center text-ink-600">
          Banen kunne desværre ikke indlæses i denne browser. Prøv en anden browser eller enhed.
        </p>
      )
    }
    return this.props.children
  }
}
