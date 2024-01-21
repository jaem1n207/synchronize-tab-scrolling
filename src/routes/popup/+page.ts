import { dev } from '$app/environment';

// we don't need any JS on this page, though we'll load
// it in dev so that we get hot module replacement
export const csr = dev;

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = true;

// request pokeymon api
export const load = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await queryClient.prefetchQuery({
		queryKey: ['pokemon'],
		queryFn: async () => (await fetch('https://pokeapi.co/api/v2/pokemon?limit=33')).json()
	});
};
