import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary">
          <p className="panel-kicker">RENDER_ERROR</p>
          <strong>{this.state.error.message}</strong>
          <button
            className="secondary-button"
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
