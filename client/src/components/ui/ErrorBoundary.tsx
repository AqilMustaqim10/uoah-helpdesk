// A safety net. If something inside crashes while drawing, we show a friendly card
// instead of a blank page.
//  - without onClose: shows the card in place, with a "Try again" button
//  - with onClose (used around pop-up windows): shows the card in a small window with a "Close" button
//  - resetKey: when it changes (for example when you switch tabs), the card goes away and the page tries again
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  children: ReactNode;
  onClose?: () => void;
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The details go to the browser console for whoever is fixing it
    console.error("UI error:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey)
      this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { onClose } = this.props;
    const card = (
      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          Something went wrong
        </h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          This part of the page hit an unexpected problem. Your data is safe.
          Please try again.
        </p>
        <div className="mt-5">
          {onClose ? (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );

    return onClose ? (
      <Modal label="Something went wrong" onClose={onClose} size="md">
        {card}
      </Modal>
    ) : (
      card
    );
  }
}
