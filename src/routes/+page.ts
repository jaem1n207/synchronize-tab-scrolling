import { chromeApi, tabKeys } from '@/lib/tabs/tabs';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const { queryClient } = await parent();

	await queryClient.prefetchQuery({
		queryKey: tabKeys.lists(),
		queryFn: () => chromeApi.getTabs()
	});

	await queryClient.prefetchQuery({
		queryKey: tabKeys.sync(),
		queryFn: () => chromeApi.getSyncTabIds()
	});
};
