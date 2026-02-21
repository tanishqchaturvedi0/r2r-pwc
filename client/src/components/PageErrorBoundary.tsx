import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Wraps a single page. If that page throws during render or a lifecycle,
 * we catch it here and show a friendly retry panel — the sidebar/header
 * stay fully interactive because they live outside this boundary.
 */
export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageErrorBoundary] Caught error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              This page encountered an error. Your navigation and other pages are unaffected.
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground/70 mt-2 font-mono">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button onClick={this.handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
