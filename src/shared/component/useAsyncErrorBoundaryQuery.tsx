import {
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
  useQuery,
} from "@tanstack/react-query";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import AsyncErrorBoundary from "./AsyncErrorBoundary";

export interface BaseUseAsyncErrorBoundaryResult<TData = unknown>
  extends Omit<UseQueryResult<TData>, "error" | "isError" | "isFetching"> {
  status: "success" | "loading";
}

export interface UseAsyncErrorBoundaryResultOnSuccess<TData>
  extends BaseUseAsyncErrorBoundaryResult<TData> {
  isLoading: false;
  isSuccess: true;
  status: "success";
  data: TData;
}

export interface UseAsyncErrorBoundaryResultOnLoading
  extends BaseUseAsyncErrorBoundaryResult {
  isLoading: true;
  isSuccess: false;
  status: "loading";
  data: undefined;
}

export type UseAsyncErrorBoundaryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "suspense">;

// In general, we can use `useQuery` in two ways.
// I don't use it because I prefer the object syntax for `useQuery`.
// The reason for preferring the object syntax is to ensure consistency, since the `useQueries` hook only supports object syntax.
// export function useAsyncErrorBoundaryQuery<
//   TQueryFnData = unknown,
//   TError = unknown,
//   TData = TQueryFnData,
//   TQueryKey extends QueryKey = QueryKey
// >(
//   queryKey: TQueryKey,
//   queryFn: QueryFunction<TQueryFnData, TQueryKey>,
//   options?: Omit<
//     UseAsyncErrorBoundaryOptions<TQueryFnData, TError, TData, TQueryKey>,
//     "enabled" | "queryKey" | "queryFn"
//   >
// ): UseAsyncErrorBoundaryResultOnSuccess<TData>;

export function useAsyncErrorBoundaryQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
>(
  options: Omit<
    UseAsyncErrorBoundaryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "enabled"
  >
): UseAsyncErrorBoundaryResultOnSuccess<TQueryFnData>;

/**
 * It does not return errors or loading status, which are handled by the AsyncErrorBoundary component.
 * By default, this has the same effect as setting the `suspense` option to `true`.
 *
 * used with {@link AsyncErrorBoundary}.
 */
export function useAsyncErrorBoundaryQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
>(arg1: UseAsyncErrorBoundaryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  return useQuery({
    ...arg1,
    suspense: true,
  }) as BaseUseAsyncErrorBoundaryResult<TData>;
}
