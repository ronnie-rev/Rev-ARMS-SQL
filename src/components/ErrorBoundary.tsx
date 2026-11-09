import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/monitor';

/** Last line of defence: a crashed page shows a calm recovery screen instead of a blank app, and is reported. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: Error | null; id: string }> {
  state = { err: null as Error | null, id: '' };
  static getDerivedStateFromError(err: Error) { return { err, id: Math.random().toString(36).slice(2, 8).toUpperCase() }; }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) { reportError(err, { kind: 'render', stack2: (info.componentStack || '').split('\n').slice(0, 6).join('\n') }); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="panel p-10 max-w-lg mx-auto mt-16 text-center" role="alert"><h2 className="display text-2xl">Something went wrong on this page</h2><p className="muted text-sm mt-2">Your data is safe. Try again, or go back to the dashboard. If it keeps happening, tell support the reference below.</p><div className="kbd inline-block mt-3">Ref {this.state.id}</div><div className="flex gap-2 justify-center mt-5"><button className="btn btn-primary" onClick={() => this.setState({ err: null })}>Try again</button><a className="btn" href="/">Go to dashboard</a></div></div>;
  }
}
