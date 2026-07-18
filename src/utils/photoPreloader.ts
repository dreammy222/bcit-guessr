const preloadCache = new Map<string, Promise<void>>();

export function preloadPhoto(url: string): Promise<void> {
  if (!url) {
    return Promise.resolve();
  }

  const cachedRequest = preloadCache.get(url);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    const clearHandlers = () => {
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      clearHandlers();
      resolve();
    };

    image.onerror = () => {
      clearHandlers();
      preloadCache.delete(url);
      reject(new Error(`Failed to preload photo: ${url}`));
    };

    image.src = url;

    if (image.complete) {
      clearHandlers();
      resolve();
    }
  });

  preloadCache.set(url, request);
  return request;
}
