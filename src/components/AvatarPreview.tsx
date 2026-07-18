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

interface AvatarPreviewProps {
  avatar: AvatarState | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const AvatarPreview: React.FC<AvatarPreviewProps> = ({ avatar, size = 'md' }) => {
  const { shirt, hat, glasses, moustache, shouldRenderBaseHead } = resolveAvatarCosmetics(avatar);
  const animateHead = size === 'lg';
  const animateArms = size === 'lg';
  const shirtBodyAssetPath = shirt?.bodyAssetPath ?? shirt?.assetPath;
  const leftSleeveAssetPath = shirt?.leftSleeveAssetPath;
  const rightSleeveAssetPath = shirt?.rightSleeveAssetPath;

  return (
    <div
      aria-label="Avatar preview"
      className={`avatar-preview avatar-preview--${size}${animateArms ? ' avatar-preview--arms-animated' : ''}`}
      role="img"
      style={{ aspectRatio: AVATAR_ASPECT_RATIO }}
    >
      <div
        className="avatar-preview__arm-group avatar-preview__arm-group--left"
      >
        <img
          alt=""
          aria-hidden="true"
          className="avatar-preview__layer avatar-preview__layer--arm"
          src={BASE_AVATAR_LEFT_ARM_ASSET_PATH}
        />
      </div>
      <div
        className="avatar-preview__arm-group avatar-preview__arm-group--right"
      >
        <img
          alt=""
          aria-hidden="true"
          className="avatar-preview__layer avatar-preview__layer--arm"
          src={BASE_AVATAR_RIGHT_ARM_ASSET_PATH}
        />
      </div>
      <img
        alt=""
        aria-hidden="true"
        className="avatar-preview__layer avatar-preview__layer--body"
        src={BASE_AVATAR_BODY_ASSET_PATH}
      />
      {shirtBodyAssetPath && (
        <img
          alt=""
          aria-hidden="true"
          className="avatar-preview__layer avatar-preview__layer--shirt"
          src={shirtBodyAssetPath}
        />
      )}
      <div
        className={`avatar-preview__head-group${animateHead ? ' avatar-preview__head-group--animated' : ''}`}
      >
        {shouldRenderBaseHead && (
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--head"
            src={BASE_AVATAR_HEAD_ASSET_PATH}
          />
        )}
        {glasses && (
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--glasses"
            src={glasses.assetPath}
          />
        )}
        {moustache && (
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--moustache"
            src={moustache.assetPath}
          />
        )}
        {hat && (
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--hat"
            src={hat.assetPath}
          />
        )}
      </div>
      {leftSleeveAssetPath && (
        <div
          className="avatar-preview__sleeve-group avatar-preview__sleeve-group--left"
        >
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--sleeve"
            src={leftSleeveAssetPath}
          />
        </div>
      )}
      {rightSleeveAssetPath && (
        <div
          className="avatar-preview__sleeve-group avatar-preview__sleeve-group--right"
        >
          <img
            alt=""
            aria-hidden="true"
            className="avatar-preview__layer avatar-preview__layer--sleeve"
            src={rightSleeveAssetPath}
          />
        </div>
      )}
    </div>
  );
};

export default AvatarPreview;
