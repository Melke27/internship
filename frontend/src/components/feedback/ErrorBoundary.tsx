import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="placeholder">
          <p className="eyebrow accent">Unexpected error</p>
          <h1>Something went wrong</h1>
          <p className="muted">An unexpected error occurred while rendering this page. Please try refreshing.</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
