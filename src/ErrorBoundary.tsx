import { Component, ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AniMessenger display recovery", error, info.componentStack);
  }

  private reload = () => window.location.reload();

  private resetInterface = () => {
    try {
      localStorage.removeItem("animessenger-recent-emoji");
      localStorage.removeItem("animessenger-setup-complete-v1");
    } catch {
      // A blocked browser storage area should not prevent recovery.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-recovery">
        <section role="alert">
          <div className="crash-mark" aria-hidden="true">!</div>
          <p className="eyebrow">Your local data is safe</p>
          <h1>AniMessenger hit a display problem.</h1>
          <p>Your chats, memories, profiles, and images are stored separately and have not been deleted. Reloading usually reconnects the interface.</p>
          <div className="crash-actions">
            <button type="button" className="crash-primary" onClick={this.reload}>Reload AniMessenger</button>
            <button type="button" onClick={this.resetInterface}>Clear interface cache</button>
          </div>
          <details>
            <summary>Technical detail</summary>
            <code>{this.state.error.message || "Unknown display error"}</code>
          </details>
        </section>
      </main>
    );
  }
}
