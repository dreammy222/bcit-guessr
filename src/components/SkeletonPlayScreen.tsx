import React from 'react';
import './SkeletonPlayScreen.css';

interface SkeletonPlayScreenProps {
  mapExpanded: boolean;
  isExiting?: boolean;
}

/**
 * Placeholder shell covering the play screen until the round is fully loaded — both the
 * /api/locations call and the panorama itself. Mirrors the layout of the playing phase in
 * App.tsx so the real game view drops into the same boxes underneath it.
 */
const SkeletonPlayScreen: React.FC<SkeletonPlayScreenProps> = ({ mapExpanded, isExiting = false }) => (
  <div
    className={`skeleton-play${isExiting ? ' skeleton-play--exiting' : ''}`}
    role="status"
    aria-live="polite"
    aria-label="Loading your game"
  >
    <div className="skeleton-play__panorama">
      <div className="skeleton-play__loader">
        <div className="skeleton-play__stage">
          <span className="skeleton-play__ring" />
          <span className="skeleton-play__ring" />
          <span className="skeleton-play__ring" />
          <div className="skeleton-play__pin-shadow" />
          <div className="skeleton-play__pin">
            <div className="skeleton-play__pin-head" />
          </div>
        </div>
        <div className="skeleton-play__caption">Finding locations&hellip;</div>
      </div>
    </div>

    <div className="skeleton-play__hud">
      <div className="skeleton-play__hud-left">
        <div className="skeleton-block skeleton-play__round" />
      </div>
      <div className="skeleton-play__hud-center">
        <div className="skeleton-block skeleton-play__timer" />
      </div>
      <div className="skeleton-play__hud-right">
        <div className="skeleton-block skeleton-play__score" />
      </div>
    </div>

    <div className="skeleton-play__overlay">
      <div
        className={`skeleton-play__panel ${
          mapExpanded ? 'skeleton-play__panel--expanded' : 'skeleton-play__panel--collapsed'
        }`}
      >
        <div className="skeleton-play__panel-header">
          <div className="skeleton-block skeleton-play__panel-title" />
          <div className="skeleton-block skeleton-play__panel-toggle" />
        </div>
        <div className="skeleton-play__panel-map" />
      </div>

      <div className="skeleton-play__submit-row">
        <div className="skeleton-block skeleton-play__submit" />
      </div>
    </div>
  </div>
);

export default SkeletonPlayScreen;
