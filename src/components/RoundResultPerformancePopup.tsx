import React from 'react';
import {
  AVATAR_ASPECT_RATIO,
  BASE_AVATAR_BODY_ASSET_PATH,
  BASE_AVATAR_HEAD_ASSET_PATH,
  BASE_AVATAR_LEFT_ARM_ASSET_PATH,
  BASE_AVATAR_RIGHT_ARM_ASSET_PATH,
  resolveAvatarCosmetics,
  type AvatarState,
} from '../data/cosmetics';

interface RoundResultPerformancePopupProps {
  avatar: AvatarState | null;
  label: string;
}

const RoundResultPerformancePopup: React.FC<RoundResultPerformancePopupProps> = ({ avatar, label }) => {
  const { shirt, hat, glasses, moustache, shouldRenderBaseHead } = resolveAvatarCosmetics(avatar);
  const shirtBodyAssetPath = shirt?.bodyAssetPath ?? shirt?.assetPath;
  const leftSleeveAssetPath = shirt?.leftSleeveAssetPath;
  const rightSleeveAssetPath = shirt?.rightSleeveAssetPath;

  return (
    <div className="round-result__performance-display">
      <div className="round-result__performance-group">
        <div
          aria-hidden="true"
          className="round-result__performance-avatar round-result__performance-avatar--back"
          style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
        >
          <img
            alt=""
            className="round-result__performance-avatar-layer round-result__performance-avatar-layer--body"
            src={BASE_AVATAR_BODY_ASSET_PATH}
          />
          {shirtBodyAssetPath && (
            <img
              alt=""
              className="round-result__performance-avatar-layer round-result__performance-avatar-layer--shirt"
              src={shirtBodyAssetPath}
            />
          )}
        </div>

        <div className="round-result__performance-card">
          <span className="round-result__kicker">Round result</span>
          <span className="round-result__label">{label}</span>
        </div>

        <div
          aria-hidden="true"
          className="round-result__performance-avatar round-result__performance-avatar--front"
          style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
        >
          <img
            alt=""
            className="round-result__performance-avatar-layer round-result__performance-avatar-layer--arm round-result__performance-avatar-layer--arm-left"
            src={BASE_AVATAR_LEFT_ARM_ASSET_PATH}
          />
          <img
            alt=""
            className="round-result__performance-avatar-layer round-result__performance-avatar-layer--arm round-result__performance-avatar-layer--arm-right"
            src={BASE_AVATAR_RIGHT_ARM_ASSET_PATH}
          />
        </div>

        <div
          aria-hidden="true"
          className="round-result__performance-avatar round-result__performance-avatar--body-overlay"
          style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
        >
          <img
            alt=""
            className="round-result__performance-avatar-layer round-result__performance-avatar-layer--body"
            src={BASE_AVATAR_BODY_ASSET_PATH}
          />
        </div>

        {(leftSleeveAssetPath || rightSleeveAssetPath) && (
          <div
            aria-hidden="true"
            className="round-result__performance-avatar round-result__performance-avatar--sleeves-overlay"
            style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
          >
            {leftSleeveAssetPath && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--sleeve round-result__performance-avatar-layer--sleeve-left"
                src={leftSleeveAssetPath}
              />
            )}
            {rightSleeveAssetPath && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--sleeve round-result__performance-avatar-layer--sleeve-right"
                src={rightSleeveAssetPath}
              />
            )}
          </div>
        )}

        {shirtBodyAssetPath && (
          <div
            aria-hidden="true"
            className="round-result__performance-avatar round-result__performance-avatar--shirt-overlay"
            style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
          >
            <img
              alt=""
              className="round-result__performance-avatar-layer round-result__performance-avatar-layer--shirt"
              src={shirtBodyAssetPath}
            />
          </div>
        )}

        <div
          aria-hidden="true"
          className="round-result__performance-avatar round-result__performance-avatar--head-overlay"
          style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
        >
          <div className="round-result__performance-avatar-head-group">
            {shouldRenderBaseHead && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--head"
                src={BASE_AVATAR_HEAD_ASSET_PATH}
              />
            )}
            {glasses && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--glasses"
                src={glasses.assetPath}
              />
            )}
            {moustache && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--moustache"
                src={moustache.assetPath}
              />
            )}
            {hat && (
              <img
                alt=""
                className="round-result__performance-avatar-layer round-result__performance-avatar-layer--hat"
                src={hat.assetPath}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoundResultPerformancePopup;
