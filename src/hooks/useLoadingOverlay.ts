import { useEffect, useRef, useState } from 'react';

interface LoadingOverlayState {
  /** Whether the overlay should be rendered at all. */
  visible: boolean;
  /** True once the work is done and the overlay is fading out. */
  exiting: boolean;
}

/**
 * Drives a loading overlay with a floor on how briefly it can appear, plus a fade-out
 * window before it unmounts. The floor stops a warm cache from flashing the overlay for
 * a frame or two, which reads as a glitch rather than as loading.
 *
 * Visibility is derived during render rather than set from an effect: effects run after
 * paint, so an effect-driven overlay lets one uncovered frame of the view underneath
 * reach the screen first.
 */
export function useLoadingOverlay(
  loading: boolean,
  minMs = 600,
  fadeMs = 320
): LoadingOverlayState {
  // Keeps the overlay mounted after the work finishes, for the floor plus the fade.
  const [lingering, setLingering] = useState(false);
  const [exiting, setExiting] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (loading) {
      shownAtRef.current = Date.now();
      setLingering(true);
      setExiting(false);
      return;
    }

    if (!lingering) {
      return;
    }

    const hold = Math.max(0, minMs - (Date.now() - shownAtRef.current));
    const fadeTimer = window.setTimeout(() => setExiting(true), hold);
    const unmountTimer = window.setTimeout(() => {
      setLingering(false);
      setExiting(false);
    }, hold + fadeMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [fadeMs, lingering, loading, minMs]);

  return {
    visible: loading || lingering,
    exiting: exiting && !loading,
  };
}
