// Reference Source: https://github.com/mozilla/webextension-polyfill/blob/master/src/browser-polyfill.js

/* eslint-disable @typescript-eslint/no-explicit-any */
const wrapAsyncFunction = (method: FunctionShape) => {
  return (target: typeof chrome | typeof browser, ...args: any[]) => {
    return new Promise((resolve, reject) => {
      method.call(target, ...args, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  };
};

const wrapMethod = (
  target: typeof chrome | typeof browser,
  method: any,
  wrapper: FunctionShape
) => {
  return new Proxy(method, {
    apply(_, thisArg, args) {
      return wrapper.call(thisArg, target, ...args);
    }
  });
};

const wrapObject = (target: typeof chrome | typeof browser) => {
  const cache = Object.create(null);
  const handlers: ProxyHandler<typeof chrome | typeof browser> = {
    has(_, prop) {
      return prop in target || prop in cache;
    },
    get(_, prop, receiver) {
      if (typeof prop !== 'string' || !(prop in target)) {
        throw new Error(`Property "${String(prop)}" does not exist on the chrome object.`);
      }

      if (prop in cache) {
        return cache[prop];
      }

      if (typeof target[prop as keyof typeof target] === 'function') {
        cache[prop] = wrapMethod(target, target[prop as keyof typeof target], wrapAsyncFunction);
        return cache[prop];
      }

      return Reflect.get(target, prop, receiver);
    }
  };

  const proxyTarget = Object.create(target);
  return new Proxy(proxyTarget, handlers);
};

export const createWebExtensionPolyfillObj = (): typeof webExtension => {
  if (!globalThis.chrome?.runtime?.id) {
    throw new Error('This script should only be loaded in a browser extension.');
  }

  if (!globalThis.browser?.runtime?.id) {
    return wrapObject(chrome) as typeof webExtension;
  } else {
    return globalThis.browser as typeof webExtension;
  }
};
