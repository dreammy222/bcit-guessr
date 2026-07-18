import type { RoundResult } from '../hooks/useGameState';
import { LOGO, SCHOOL } from '../config/school';
import {
  BASE_AVATAR_HEAD_ASSET_PATH,
  BASE_AVATAR_LEFT_ARM_ASSET_PATH,
  BASE_AVATAR_RIGHT_ARM_ASSET_PATH,
  BASE_AVATAR_SIT_BODY_ASSET_PATH,
  resolveAvatarCosmetics,
  type AvatarState,
} from '../data/cosmetics';
import { formatDistance } from './scoring';

const CARD_WIDTH = 720;
const CARD_HEIGHT = 1280;
const LOGO_Y = 78;
const SCORE_RING_CENTER_X = CARD_WIDTH / 2;
const SCORE_RING_CENTER_Y = 320;
const SCORE_RING_RADIUS = 116;
const SCORE_RING_LINE_WIDTH = 18;
const PANEL_X = 24;
const PANEL_Y = 694;
const PANEL_WIDTH = CARD_WIDTH - PANEL_X * 2;
const PANEL_HEIGHT = 540;
const PANEL_RADIUS = 26;
const PANEL_HEADER_HEIGHT = 70;
const PANEL_BOTTOM_PADDING = 28;
const AVATAR_FRAME_X = 12;
const AVATAR_FRAME_Y = 390;
const AVATAR_FRAME_WIDTH = 300;
const AVATAR_FRAME_HEIGHT = 375;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

interface NativeShareData {
  title?: string;
  files?: File[];
}

type ShareNavigator = Navigator & {
  share?: (data: NativeShareData) => Promise<void>;
  canShare?: (data: NativeShareData) => boolean;
};

interface AvatarImageLayers {
  bodySit: HTMLImageElement;
  head: HTMLImageElement | null;
  leftArm: HTMLImageElement;
  rightArm: HTMLImageElement;
  shirtBody: HTMLImageElement | null;
  leftSleeve: HTMLImageElement | null;
  rightSleeve: HTMLImageElement | null;
  glasses: HTMLImageElement | null;
  moustache: HTMLImageElement | null;
  hat: HTMLImageElement | null;
}

interface AvatarFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScoreSharePayload {
  title: string;
  fileName: string;
  totalScore: number;
  maxScore: number;
  results: RoundResult[];
  avatar: AvatarState | null;
}

export type ScoreShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled';

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const cornerRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + cornerRadius, y);
  context.lineTo(x + width - cornerRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  context.lineTo(x + width, y + height - cornerRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
  context.lineTo(x + cornerRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  context.lineTo(x, y + cornerRadius);
  context.quadraticCurveTo(x, y, x + cornerRadius, y);
  context.closePath();
}

function loadImage(assetPath: string) {
  const cachedImage = imageCache.get(assetPath);
  if (cachedImage) {
    return cachedImage;
  }

  const nextImage = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load share asset: ${assetPath}`));
    image.src = new URL(assetPath, window.location.origin).toString();
  });

  imageCache.set(assetPath, nextImage);
  return nextImage;
}

function loadOptionalImage(assetPath?: string | null) {
  if (!assetPath) {
    return Promise.resolve(null);
  }

  return loadImage(assetPath);
}

async function resolveAvatarImageLayers(avatar: AvatarState | null): Promise<AvatarImageLayers> {
  const { shirt, hat, glasses, moustache, shouldRenderBaseHead } = resolveAvatarCosmetics(avatar);
  const shirtBodyAssetPath = shirt?.bodyAssetPath ?? shirt?.assetPath ?? null;

  const [bodySit, head, leftArm, rightArm, shirtBody, leftSleeve, rightSleeve, glassesImage, moustacheImage, hatImage] = await Promise.all([
    loadImage(BASE_AVATAR_SIT_BODY_ASSET_PATH),
    shouldRenderBaseHead ? loadImage(BASE_AVATAR_HEAD_ASSET_PATH) : Promise.resolve(null),
    loadImage(BASE_AVATAR_LEFT_ARM_ASSET_PATH),
    loadImage(BASE_AVATAR_RIGHT_ARM_ASSET_PATH),
    loadOptionalImage(shirtBodyAssetPath),
    loadOptionalImage(shirt?.leftSleeveAssetPath),
    loadOptionalImage(shirt?.rightSleeveAssetPath),
    loadOptionalImage(glasses?.assetPath),
    loadOptionalImage(moustache?.assetPath),
    loadOptionalImage(hat?.assetPath),
  ]);

  return {
    bodySit,
    head,
    leftArm,
    rightArm,
    shirtBody,
    leftSleeve,
    rightSleeve,
    glasses: glassesImage,
    moustache: moustacheImage,
    hat: hatImage,
  };
}

function drawLogo(context: CanvasRenderingContext2D) {
  context.save();
  context.font = "900 64px 'Inter', system-ui, sans-serif";
  context.textBaseline = 'top';

  const prefix = LOGO.prefix;
  const suffix = LOGO.suffix;
  const prefixWidth = context.measureText(prefix).width;
  const suffixWidth = context.measureText(suffix).width;
  const totalWidth = prefixWidth + suffixWidth;
  const startX = (CARD_WIDTH - totalWidth) / 2;

  context.shadowColor = 'rgba(0, 0, 0, 0.28)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;

  context.fillStyle = '#F5F7FB';
  context.fillText(prefix, startX, LOGO_Y);

  context.fillStyle = '#FFC700';
  context.fillText(suffix, startX + prefixWidth, LOGO_Y);
  context.restore();
}

function drawScoreRing(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  totalScore: number,
  maxScore: number
) {
  const ratio = Math.min(1, Math.max(0, maxScore === 0 ? 0 : totalScore / maxScore));

  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.lineWidth = SCORE_RING_LINE_WIDTH;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = '#FFD100';
  context.lineCap = 'round';
  context.beginPath();
  context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  context.stroke();
  context.restore();

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#FFC700';
  context.font = "900 54px 'Inter', system-ui, sans-serif";
  context.fillText(totalScore.toLocaleString(), centerX, centerY - 8);

  context.fillStyle = 'rgba(232, 240, 255, 0.72)';
  context.font = "800 25px 'Inter', system-ui, sans-serif";
  context.fillText(`/ ${maxScore.toLocaleString()}`, centerX, centerY + 42);
  context.restore();
}

function drawEllipsizedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y);
    return;
  }

  const ellipsis = '...';
  let truncated = text;

  while (truncated.length > 0 && context.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  context.fillText(`${truncated}${ellipsis}`, x, y);
}

function drawBackground(context: CanvasRenderingContext2D) {
  context.fillStyle = '#051531';
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawRoundsPanelBase(context: CanvasRenderingContext2D) {
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.32)';
  context.shadowBlur = 20;
  context.shadowOffsetY = 12;
  drawRoundedRect(context, PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_RADIUS);
  context.fillStyle = 'rgba(11, 27, 67, 0.97)';
  context.fill();
  context.restore();
}

function drawRoundsPanelContent(context: CanvasRenderingContext2D, payload: ScoreSharePayload) {
  context.save();
  drawRoundedRect(context, PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_RADIUS);
  context.clip();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(226, 234, 246, 0.62)';
  context.font = "800 24px 'Inter', system-ui, sans-serif";
  context.fillText('ROUND BREAKDOWN', PANEL_X + (PANEL_WIDTH / 2), PANEL_Y + 44);

  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PANEL_X + 1, PANEL_Y + PANEL_HEADER_HEIGHT);
  context.lineTo(PANEL_X + PANEL_WIDTH - 1, PANEL_Y + PANEL_HEADER_HEIGHT);
  context.stroke();

  const rowCount = Math.max(payload.results.length, 1);
  const availableRowHeight = PANEL_HEIGHT - PANEL_HEADER_HEIGHT - PANEL_BOTTOM_PADDING;
  const rowHeight = availableRowHeight / rowCount;
  const numberX = PANEL_X + 44;
  const scoreX = PANEL_X + PANEL_WIDTH - 40;
  const distanceX = scoreX - 120;
  const labelX = PANEL_X + 94;
  const labelWidth = distanceX - labelX - 22;

  payload.results.forEach((result, index) => {
    const rowTop = PANEL_Y + PANEL_HEADER_HEIGHT + index * rowHeight;
    const baselineY = rowTop + rowHeight * 0.55;

    if (index > 0) {
      context.beginPath();
      context.moveTo(PANEL_X + 1, rowTop);
      context.lineTo(PANEL_X + PANEL_WIDTH - 1, rowTop);
      context.stroke();
    }

    context.textAlign = 'left';
    context.fillStyle = 'rgba(231, 238, 250, 0.45)';
    context.font = "800 31px 'Inter', system-ui, sans-serif";
    context.fillText(`${index + 1}`, numberX, baselineY);

    context.fillStyle = '#E8EEF9';
    context.font = "800 24px 'Inter', system-ui, sans-serif";
    drawEllipsizedText(context, result.photoLabel, labelX, baselineY, labelWidth);

    context.textAlign = 'right';
    context.fillStyle = 'rgba(231, 238, 250, 0.52)';
    context.font = "700 20px 'Inter', system-ui, sans-serif";
    context.fillText(formatDistance(result.distanceKm), distanceX, baselineY);

    context.fillStyle = '#FFD100';
    context.font = "900 24px 'Inter', system-ui, sans-serif";
    context.fillText(`+${result.points.toLocaleString()}`, scoreX, baselineY);
  });

  context.restore();

  context.save();
  drawRoundedRect(context, PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_RADIUS);
  const panelGlow = context.createLinearGradient(PANEL_X, PANEL_Y, PANEL_X, PANEL_Y + 160);
  panelGlow.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  panelGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = panelGlow;
  context.fill();

  context.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawAvatarLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: AvatarFrame,
  options?: {
    pivotX?: number;
    pivotY?: number;
    rotationDeg?: number;
    shiftX?: number;
    shiftY?: number;
  }
) {
  const {
    pivotX = 0.5,
    pivotY = 0.5,
    rotationDeg = 0,
    shiftX = 0,
    shiftY = 0,
  } = options ?? {};

  const pivotCanvasX = frame.x + frame.width * pivotX + frame.width * shiftX;
  const pivotCanvasY = frame.y + frame.height * pivotY + frame.height * shiftY;

  context.save();
  context.translate(pivotCanvasX, pivotCanvasY);
  context.rotate((rotationDeg * Math.PI) / 180);
  context.drawImage(
    image,
    -frame.width * pivotX,
    -frame.height * pivotY,
    frame.width,
    frame.height,
  );
  context.restore();
}

function drawAvatar(context: CanvasRenderingContext2D, layers: AvatarImageLayers) {
  const frame: AvatarFrame = {
    x: AVATAR_FRAME_X,
    y: AVATAR_FRAME_Y,
    width: AVATAR_FRAME_WIDTH,
    height: AVATAR_FRAME_HEIGHT,
  };

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.22)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 7;

  drawAvatarLayer(context, layers.leftArm, frame);
  drawAvatarLayer(context, layers.rightArm, frame);
  drawAvatarLayer(context, layers.bodySit, frame);

  if (layers.leftSleeve) {
    drawAvatarLayer(context, layers.leftSleeve, frame);
  }

  if (layers.rightSleeve) {
    drawAvatarLayer(context, layers.rightSleeve, frame);
  }

  if (layers.shirtBody) {
    drawAvatarLayer(context, layers.shirtBody, frame);
  }

  if (layers.head) {
    drawAvatarLayer(context, layers.head, frame);
  }

  if (layers.glasses) {
    drawAvatarLayer(context, layers.glasses, frame);
  }

  if (layers.moustache) {
    drawAvatarLayer(context, layers.moustache, frame);
  }

  if (layers.hat) {
    drawAvatarLayer(context, layers.hat, frame);
  }

  context.restore();
}

async function renderShareCard(payload: ScoreSharePayload) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const avatarLayers = await resolveAvatarImageLayers(payload.avatar);

  drawBackground(context);
  drawRoundsPanelBase(context);
  drawLogo(context);
  drawScoreRing(context, SCORE_RING_CENTER_X, SCORE_RING_CENTER_Y, SCORE_RING_RADIUS, payload.totalScore, payload.maxScore);
  drawAvatar(context, avatarLayers);
  drawRoundsPanelContent(context, payload);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Failed to export share image'));
    }, 'image/png');
  });
}

async function createScoreCardFile(payload: ScoreSharePayload) {
  const canvas = await renderShareCard(payload);
  const blob = await canvasToBlob(canvas);

  return {
    blob,
    file: new File([blob], payload.fileName, { type: 'image/png' }),
  };
}

async function copyImageToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is unavailable');
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob,
    }),
  ]);
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export function createScoreSharePayload(
  totalScore: number,
  maxScore: number,
  results: RoundResult[],
  avatar: AvatarState | null
): ScoreSharePayload {
  return {
    title: SCHOOL.gameName,
    fileName: `${SCHOOL.slug}-guessr-endcard-${Math.max(0, Math.round(totalScore))}.png`,
    totalScore,
    maxScore,
    results,
    avatar,
  };
}

export async function shareScore(payload: ScoreSharePayload): Promise<ScoreShareResult> {
  const shareNavigator = navigator as ShareNavigator;
  const { blob, file } = await createScoreCardFile(payload);
  const fileShareData: NativeShareData = { files: [file], title: payload.title };

  if (typeof shareNavigator.share === 'function') {
    const canShareFiles = typeof shareNavigator.canShare === 'function' ? shareNavigator.canShare(fileShareData) : true;

    if (canShareFiles) {
      try {
        await shareNavigator.share(fileShareData);
        return 'shared';
      } catch (error) {
        if (isAbortError(error)) {
          return 'cancelled';
        }
      }
    }
  }

  try {
    await copyImageToClipboard(blob);
    return 'copied';
  } catch {
    downloadBlob(blob, payload.fileName);
    return 'downloaded';
  }
}
