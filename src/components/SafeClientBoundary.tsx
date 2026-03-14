"use client";

import React from "react";

type Props = {
  name?: string;
  children?: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

class SafeClientBoundaryImpl extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    const message =
      err && typeof err === "object" && "message" in err ? String((err as any).message) : "Client widget error";
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown) {
    console.error(`[SafeClientBoundary] ${this.props.name || "widget"} crashed`, err);
  }

  render() {
    if (!this.state.hasError) return this.props.children ?? null;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <div className="font-semibold">This widget failed to load.</div>
        {this.props.name ? <div className="mt-1 text-xs opacity-80">Widget: {this.props.name}</div> : null}
        {this.state.message ? <div className="mt-1 text-xs opacity-80">{this.state.message}</div> : null}
      </div>
    );
  }
}

export function SafeClientBoundary(props: Props) {
  return <SafeClientBoundaryImpl {...props} />;
}
