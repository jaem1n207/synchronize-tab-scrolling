import { dev } from '$app/environment';
import { chromeApi, tabKeys } from '@/lib/tabs/tabs';
import type { PageLoad } from './$types';

// we don't need any JS on this page, though we'll load
// it in dev so that we get hot module replacement
export const csr = dev;

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = true;

export const load: PageLoad = async ({ parent }) => {
	const { queryClient } = await parent();

	await queryClient.prefetchQuery({
		queryKey: tabKeys.activeList(),
		queryFn: () => chromeApi.getActiveTabs()
	});
};
