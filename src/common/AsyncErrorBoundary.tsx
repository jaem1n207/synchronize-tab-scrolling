import React, { Suspense } from "react";
import { ComponentProps } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { ErrorBoundaryProps } from "react-error-boundary";

interface Props
  extends React.PropsWithChildren<{}>,
    Omit<
      ErrorBoundaryProps,
      "fallbackRender" | "fallback" | "FallbackComponent"
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
    <ErrorBoundary fallbackRender={errorFallback} {...restErrorBoundaryProps}>
      <Suspense fallback={pendingFallback}>{children}</Suspense>
    </ErrorBoundary>
  );
};

export default AsyncErrorBoundary;
