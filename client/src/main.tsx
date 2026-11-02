// Entry point: starts React and wraps the app in its "providers"
// (theme, toasts, login state) so every component can use them.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { domMax, LazyMotion, MotionConfig } from "framer-motion";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
