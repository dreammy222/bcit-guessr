import React from 'react';
import './AppErrorBoundary.css';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown application error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error">
          <div className="app-error__card">
            <h1 className="app-error__title">App Error</h1>
            <p className="app-error__description">
              The app hit a runtime error instead of rendering normally.
            </p>
            <pre className="app-error__message">{this.state.message}</pre>
            <button
              className="app-error__button ui-button ui-button--dark ui-button--md"
              onClick={() => window.location.assign('/')}
              type="button"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
