import { isAbsolute, relative, resolve, sep } from 'node:path';

function stripLandingBase(pathname: string, landingBase: string): string {
  if (landingBase === '/') {
    return pathname;
  }

  const normalizedBase = landingBase.endsWith('/') ? landingBase : `${landingBase}/`;
  const baseWithoutTrailingSlash = normalizedBase.slice(0, -1);

  if (pathname === baseWithoutTrailingSlash) {
    return '/';
  }

  return pathname.startsWith(normalizedBase)
    ? `/${pathname.slice(normalizedBase.length)}`
    : pathname;
}

export function resolveStaticFilePath(
  rootDirectory: string,
  requestTarget: string,
  landingBase: string,
): string | null {
  const rawPathname = requestTarget.split('?', 1)[0]?.split('#', 1)[0] ?? '/';

  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname).replaceAll('\\', '/');
  } catch {
    return null;
  }

  if (!pathname.startsWith('/') || pathname.includes('\0')) {
    return null;
  }

  const strippedPathname = stripLandingBase(pathname, landingBase);
  const relativeRequestPath =
    strippedPathname === '/' || strippedPathname === '/index.html'
      ? 'landing/index.html'
      : strippedPathname.replace(/^\/+/, '');
  const resolvedRoot = resolve(rootDirectory);
  const resolvedPath = resolve(resolvedRoot, relativeRequestPath);
  const pathWithinRoot = relative(resolvedRoot, resolvedPath);

  if (
    pathWithinRoot === '..' ||
    pathWithinRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathWithinRoot)
  ) {
    return null;
  }

  return resolvedPath;
}
