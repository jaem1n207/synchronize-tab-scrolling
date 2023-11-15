import { QueryErrorResetBoundary } from "@tanstack/react-query";
import React, { Suspense } from "react";
import { ComponentProps } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { ErrorBoundaryProps } from "react-error-boundary";

interface Props
  extends React.PropsWithChildren<{}>,
    Omit<
      ErrorBoundaryProps,
      "fallbackRender" | "fallback" | "FallbackComponent" | "onReset"
    > {
  pendingFallback: ComponentProps<typeof Suspense>["fallback"];
  errorFallback: ComponentProps<typeof ErrorBoundary>["fallbackRender"];
}

const AsyncErrorBoundary = ({
  pendingFallback,
  errorFallback,
  children,
  ...restErrorBoundaryProps
}: Props) => {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={errorFallback}
          {...restErrorBoundaryProps}
        >
          <Suspense fallback={pendingFallback}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};

export default AsyncErrorBoundary;
