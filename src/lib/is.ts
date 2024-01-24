export const isHTMLElement = (element: unknown): element is HTMLElement => {
	return element instanceof HTMLElement;
};

export const isEmptyString = (value: unknown): value is never => {
	return typeof value === 'string' && value.length === 0;
};
