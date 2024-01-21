// import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// error(402, {
	// 	message: 'This is a custom error page'
	// });

	return {
		status: 200,
		headers: {
			'content-type': 'application/json'
		},
		body: {
			foo: 'bar'
		}
	};
};
