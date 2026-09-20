import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="center-loading" style={{ height: "100vh", padding: "24px", textAlign: "center" }}>
        <h1>Не удалось загрузить чат</h1>
        <p>{this.state.error.message}</p>
        <p>Проверьте переменные VITE_FIREBASE_* в настройках Render и перезапустите деплой.</p>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
