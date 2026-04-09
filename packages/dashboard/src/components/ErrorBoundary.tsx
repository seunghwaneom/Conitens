import React from "react";
import styles from "./ErrorBoundary.module.css";

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
        <div className={styles.container}>
          <p className={styles.kicker}>RENDER_ERROR</p>
          <strong className={styles.message}>{this.state.error.message}</strong>
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
