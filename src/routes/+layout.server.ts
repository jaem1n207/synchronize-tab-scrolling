import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ route }) => {
	if (route.id === '/') {
		redirect(302, '/popup');
	}
};
