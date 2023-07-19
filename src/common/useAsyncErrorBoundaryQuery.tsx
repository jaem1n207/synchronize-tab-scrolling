import {
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
  useQuery,
} from "@tanstack/react-query";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import AsyncErrorBoundary from "./AsyncErrorBoundary";

/**
 * A custom hook with the same effect as setting 'suspense' option of 'useQuery' to 'true'.
 * Primarily used with {@link AsyncErrorBoundary}.
 */
export const useAsyncErrorBoundaryQuery = <
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
>(
  options: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "suspense"
  >
): UseQueryResult<TData, TError> => {
  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    ...options,
    suspense: true,
  });
};
