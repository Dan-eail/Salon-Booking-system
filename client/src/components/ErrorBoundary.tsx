import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('UI error', err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-ivory p-6 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl">Something broke on our side.</h1>
          <p className="text-ink-soft">Your data is safe. Reload the page to continue — if it keeps happening, tell us what you were doing.</p>
          <Button onClick={() => location.reload()}>Reload page</Button>
        </div>
      </div>
    );
  }
}
