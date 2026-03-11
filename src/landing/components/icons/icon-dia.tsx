import type { SVGProps } from 'react';

export function IconDia(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M5 0h14a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5V5a5 5 0 0 1 5-5Zm7 8a8 8 0 1 0 0 16 8 8 0 1 0 0-16Z"
        fillRule="evenodd"
      />
    </svg>
  );
}
