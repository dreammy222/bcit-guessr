import React, { useEffect, useRef, useState } from 'react';
import { preloadPhoto } from '../utils/photoPreloader';
import './PanoramaViewer.css';

interface PanoramaViewerProps {
  photoUrl: string;
  autoRotateDegreesPerSecond?: number;
  onReady?: () => void;
  onError?: () => void;
}

type PanoramaLoadState = 'loading' | 'loaded' | 'error';

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 750;
const VIEWER_LOAD_TIMEOUT_MS = 6000;
const PANNELLUM_CSS_ID = 'pannellum-stylesheet';
const PANNELLUM_SCRIPT_ID = 'pannellum-script';
const PANNELLUM_CSS_URL = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
const PANNELLUM_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';

let pannellumLoadPromise: Promise<void> | null = null;

function buildPanoramaRequestUrl(photoUrl: string, attempt: number): string {
  if (attempt === 0) {
    return photoUrl;
  }

  const separator = photoUrl.includes('?') ? '&' : '?';
  return `${photoUrl}${separator}retry=${attempt}`;
}

function getFriendlyErrorMessage(): string {
  return 'This photo could not be loaded right now. Please try again.';
}

type PannellumViewer = {
  destroy: () => void;
  on: (eventName: string, listener: (payload?: string) => void) => void;
};

declare global {
  interface Window {
    pannellum: {
      viewer: (container: string | HTMLElement, config: Record<string, unknown>) => PannellumViewer;
    };
  }
}

function ensurePannellumLoaded() {
  if (typeof window !== 'undefined' && window.pannellum) {
    return Promise.resolve();
  }

  if (pannellumLoadPromise) {
    return pannellumLoadPromise;
  }

  pannellumLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Pannellum can only load in a browser environment.'));
      return;
    }

    if (!document.getElementById(PANNELLUM_CSS_ID)) {
      const stylesheet = document.createElement('link');
      stylesheet.id = PANNELLUM_CSS_ID;
      stylesheet.rel = 'stylesheet';
      stylesheet.href = PANNELLUM_CSS_URL;
      document.head.appendChild(stylesheet);
    }

    const script = (document.getElementById(PANNELLUM_SCRIPT_ID) as HTMLScriptElement | null) ?? document.createElement('script');

    script.id = PANNELLUM_SCRIPT_ID;
    script.src = PANNELLUM_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';

      if (window.pannellum) {
        resolve();
        return;
      }

      pannellumLoadPromise = null;
      reject(new Error('Pannellum loaded without exposing window.pannellum.'));
    };
    script.onerror = () => {
      script.remove();
      pannellumLoadPromise = null;
      reject(new Error('Failed to load Pannellum.'));
    };

    if (!script.parentElement) {
      document.head.appendChild(script);
    }
  });

  return pannellumLoadPromise;
}

const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  photoUrl,
  autoRotateDegreesPerSecond = 0,
  onReady,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const retryTimeoutRef = useRef<number | null>(null);
  const viewerTimeoutRef = useRef<number | null>(null);
  const activePhotoUrlRef = useRef(photoUrl);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<PanoramaLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | null>(null);

  const isNewPhotoUrl = activePhotoUrlRef.current !== photoUrl;
  if (isNewPhotoUrl) {
    activePhotoUrlRef.current = photoUrl;
  }
  const effectiveLoadAttempt = isNewPhotoUrl ? 0 : loadAttempt;

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    setLoadAttempt(0);
    setLoadState('loading');
    setErrorMessage(null);
    setResolvedPhotoUrl(null);
  }, [photoUrl]);

  useEffect(() => {
    let isActive = true;

    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (viewerTimeoutRef.current) {
      window.clearTimeout(viewerTimeoutRef.current);
      viewerTimeoutRef.current = null;
    }

    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    const requestUrl = buildPanoramaRequestUrl(photoUrl, effectiveLoadAttempt);
    setLoadState('loading');
    setErrorMessage(null);
    setResolvedPhotoUrl(null);

    void ensurePannellumLoaded().catch(() => undefined);

    preloadPhoto(requestUrl)
      .then(() => {
        if (!isActive) {
          return;
        }

        setResolvedPhotoUrl(requestUrl);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        if (effectiveLoadAttempt < MAX_AUTO_RETRIES) {
          retryTimeoutRef.current = window.setTimeout(() => {
            setLoadAttempt((attempt) => attempt + 1);
          }, RETRY_DELAY_MS);
          return;
        }

        setLoadState('error');
        setErrorMessage(getFriendlyErrorMessage());
        onErrorRef.current?.();
      });

    return () => {
      isActive = false;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (viewerTimeoutRef.current) {
        window.clearTimeout(viewerTimeoutRef.current);
        viewerTimeoutRef.current = null;
      }
    };
  }, [loadAttempt, photoUrl]);

  useEffect(() => {
    if (!containerRef.current || !resolvedPhotoUrl) {
      return;
    }

    let isActive = true;
    let viewer: PannellumViewer | null = null;

    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    ensurePannellumLoaded()
      .then(() => {
        if (!isActive || !containerRef.current) {
          return;
        }

        viewer = window.pannellum.viewer(containerRef.current, {
          type: 'equirectangular',
          panorama: resolvedPhotoUrl,
          autoLoad: true,
          showZoomCtrl: false,
          showFullscreenCtrl: false,
          mouseZoom: true,
          hfov: 100,
          minHfov: 50,
          maxHfov: 120,
          autoRotate: autoRotateDegreesPerSecond || undefined,
          compass: false,
          hotSpots: [],
          strings: {
            loadButtonLabel: 'Click to load panorama',
            loadingLabel: 'Loading...',
            bylineLabel: '',
          },
        });

        viewerRef.current = viewer;
        viewerTimeoutRef.current = window.setTimeout(() => {
          if (!isActive) {
            return;
          }

          setLoadState('error');
          setErrorMessage(getFriendlyErrorMessage());
          onErrorRef.current?.();
        }, VIEWER_LOAD_TIMEOUT_MS);

        viewer.on('load', () => {
          if (!isActive) {
            return;
          }

          if (viewerTimeoutRef.current) {
            window.clearTimeout(viewerTimeoutRef.current);
            viewerTimeoutRef.current = null;
          }

          setLoadState('loaded');
          setErrorMessage(null);
          onReadyRef.current?.();
        });

        viewer.on('error', () => {
          // Pannellum can briefly emit error during setup even when the image
          // ultimately loads, so we rely on the timeout above before surfacing
          // a hard failure to the player.
        });
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setLoadState('error');
        setErrorMessage(getFriendlyErrorMessage());
        onErrorRef.current?.();
      });

    return () => {
      isActive = false;
      if (viewerTimeoutRef.current) {
        window.clearTimeout(viewerTimeoutRef.current);
        viewerTimeoutRef.current = null;
      }
      viewer?.destroy();
      if (viewerRef.current === viewer) {
        viewerRef.current = null;
      }
    };
  }, [autoRotateDegreesPerSecond, resolvedPhotoUrl]);

  return (
    <div className={`panorama-wrapper panorama-wrapper--${loadState}`}>
      <div ref={containerRef} className="panorama-container" />
      {loadState === 'loading' && (
        <div className="panorama-overlay panorama-overlay--loading">
          <div className="panorama-loading-card">Loading photo...</div>
        </div>
      )}
      {loadState === 'error' && (
        <div className="panorama-overlay panorama-overlay--error">
          <div className="panorama-error-card">
            <h3>Photo failed to load</h3>
            <p>{errorMessage || getFriendlyErrorMessage()}</p>
            <button
              type="button"
              className="panorama-retry-button"
              onClick={() => {
                setLoadState('loading');
                setErrorMessage(null);
                setResolvedPhotoUrl(null);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Retry image
            </button>
          </div>
        </div>
      )}
      {loadState !== 'error' && (
        <div className="panorama-hint">
          <span>Drag to look around - Scroll to zoom</span>
        </div>
      )}
    </div>
  );
};

export default PanoramaViewer;
