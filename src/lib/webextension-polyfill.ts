// Reference Source: https://github.com/mozilla/webextension-polyfill/blob/master/src/browser-polyfill.js

/* eslint-disable @typescript-eslint/no-explicit-any */
const wrapAsyncFunction = (method: FunctionShape) => {
  return (target: typeof chrome, ...args: any[]) => {
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

const wrapMethod = (target: typeof chrome, method: any, wrapper: FunctionShape) => {
  return new Proxy(method, {
    apply(_, thisArg, args) {
      return wrapper.call(thisArg, target, ...args);
    }
  });
};

const wrapObject = (target: typeof chrome) => {
  const cache = Object.create(null);
  const handlers: ProxyHandler<typeof chrome> = {
    has(_, prop) {
      return prop in target || prop in cache;
    },
    get(_, prop, receiver) {
      if (prop in cache) {
        return cache[prop];
      }

      if (!(prop in target)) {
        console.error(`Property "${String(prop)}" does not exist on the chrome object.`);
        return undefined;
      }

      if (typeof target[prop as keyof typeof target] === 'function') {
        cache[prop] = wrapMethod(target, target[prop as keyof typeof target], wrapAsyncFunction);
        return cache[prop];
      } else {
        Object.defineProperty(cache, prop, {
          configurable: true,
          enumerable: true,
          get() {
            return target[prop as keyof typeof target];
          },
          set(value) {
            target[prop as keyof typeof target] = value;
          }
        });
      }

      return Reflect.get(cache, prop, receiver);
    },
    set(_, prop, value) {
      prop in cache ? (cache[prop] = value) : (target[prop as keyof typeof target] = value);
      return true;
    },
    defineProperty(_, prop, descriptor) {
      return Reflect.defineProperty(cache, prop, descriptor);
    },
    deleteProperty(_, prop) {
      return Reflect.deleteProperty(cache, prop);
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
