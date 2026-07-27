import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// App-wide safety net. Without a boundary, any render-time throw (a null
// response shape, a bad field access) unmounts the entire React tree and the
// user is left staring at a blank white page. This catches the throw, shows a
// recoverable message, and keeps the rest of the app reloadable.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => {
    // Clear the error first in case the app can re-render cleanly; fall back to
    // a hard reload for anything that left global state wedged.
    this.setState({ hasError: false });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell centered">
          <div className="card" role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
            <div className="card-icon-heading" style={{ justifyContent: "center" }}>
              <span className="icon-badge">
                <AlertTriangle size={18} />
              </span>
              <h2>畫面發生錯誤</h2>
            </div>
            <p className="muted">
              頁面遇到未預期的錯誤。您的已儲存資料不受影響，請重新載入後再試一次。
            </p>
            <button className="btn-primary btn-block" onClick={this.handleReload}>
              <RefreshCw size={15} /> 重新載入
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
