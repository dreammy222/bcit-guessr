import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { createPortal } from 'react-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoundResult } from '../hooks/useGameState';
import { SCHOOL } from '../config/school';
import { createEmptyAvatarState, type AvatarState } from '../data/cosmetics';
import { isAvatarState, readCachedAvatar, writeCachedAvatar } from '../utils/avatarCache';
import RoundResultPerformancePopup from './RoundResultPerformancePopup';
import { formatDistance, ROUNDS_PER_GAME } from '../utils/scoring';
import './RoundResult.css';

const correctIcon = L.divIcon({
  className: '',
  html: `<div class="result-marker result-marker--correct">
    <span>&#10003;</span>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const guessResultIcon = L.divIcon({
  className: '',
  html: `<div class="result-marker result-marker--guess">
    <span>?</span>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

interface FitBoundsProps {
  guess: [number, number] | null;
  actual: [number, number];
}

interface PerformanceFeedback {
  label: string;
  showConfetti?: boolean;
}

interface ConfettiPiece {
  id: number;
  style: ConfettiPieceStyle;
}

interface ConfettiPieceStyle extends CSSProperties {
  '--confetti-color': string;
  '--confetti-delay': string;
  '--confetti-drift-end': string;
  '--confetti-drift-mid': string;
  '--confetti-drift-start': string;
  '--confetti-duration': string;
  '--confetti-flutter-delay': string;
  '--confetti-flutter-duration': string;
  '--confetti-left': string;
  '--confetti-rotate-end': string;
  '--confetti-rotate-mid': string;
  '--confetti-rotate-start': string;
  '--confetti-size': string;
}

const CONFETTI_PIECE_COUNT = 60;
const CONFETTI_COLORS = [
  'var(--color-brand-navy)',
  'var(--color-navy)',
  'var(--color-brand-navy-hover)',
  'var(--color-gold)',
  'var(--color-gold-strong)',
  'var(--color-gold-soft)',
];

const confettiPieces: ConfettiPiece[] = Array.from({ length: CONFETTI_PIECE_COUNT }, (_, index) => {
  const row = Math.floor(index / 6);
  const lane = index % 6;
  const horizontalSeed = (index * 17) % 59;
  const left = 1 + (horizontalSeed / 58) * 98;
  const size = 8 + (index % 5) * 2 + (row % 2);
  const duration = 1.95 + (index % 5) * 0.16 + row * 0.05;
  const delay = -1.15 + lane * 0.14 + row * 0.16;
  const driftStart = ((index % 4) - 1.5) * 10;
  const driftMid = (((index * 7) % 9) - 4) * 18;
  const driftEnd = driftMid + ((((index * 11) % 7) - 3) * 22);
  const rotateStart = -140 + ((index * 37) % 120);
  const rotateMid = rotateStart + 150 + (index % 4) * 28;
  const rotateEnd = rotateMid + 180 + (row % 3) * 36;
  const flutterDuration = 0.46 + (index % 4) * 0.12;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];

  return {
    id: index + 1,
    style: {
      '--confetti-color': color,
      '--confetti-delay': `${delay.toFixed(2)}s`,
      '--confetti-drift-end': `${driftEnd.toFixed(0)}px`,
      '--confetti-drift-mid': `${driftMid.toFixed(0)}px`,
      '--confetti-drift-start': `${driftStart.toFixed(0)}px`,
      '--confetti-duration': `${duration.toFixed(2)}s`,
      '--confetti-flutter-delay': `${(delay / 2).toFixed(2)}s`,
      '--confetti-flutter-duration': `${flutterDuration.toFixed(2)}s`,
      '--confetti-left': `${left.toFixed(2)}%`,
      '--confetti-rotate-end': `${rotateEnd.toFixed(0)}deg`,
      '--confetti-rotate-mid': `${rotateMid.toFixed(0)}deg`,
      '--confetti-rotate-start': `${rotateStart.toFixed(0)}deg`,
      '--confetti-size': `${size}px`,
    },
  };
});

function getPerformanceFeedback(
  guessCoords: [number, number] | null,
  distanceKm: number | null,
): PerformanceFeedback | null {
  if (guessCoords === null) {
    return {
      label: "Time's up!",
    };
  }

  if (distanceKm === null) {
    return null;
  }

  // Tiers are campus-scaled in src/config/school.ts, nearest-first.
  const tier = SCHOOL.scoring.reactionTiers.find(
    ({ maxKm }) => maxKm === null || distanceKm <= maxKm,
  );

  if (!tier) {
    return null;
  }

  return {
    label: tier.label,
    ...(tier.showConfetti ? { showConfetti: true } : {}),
  };
}

function FitBounds({ guess, actual }: FitBoundsProps) {
  const map = useMap();

  useEffect(() => {
    const applyView = () => {
      map.invalidateSize();

      if (guess) {
        const bounds = L.latLngBounds([guess, actual]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
        map.setView(actual, 15);
      }
    };

    const frame = window.requestAnimationFrame(applyView);
    const settleTimer = window.setTimeout(applyView, 220);
    const animationTimer = window.setTimeout(applyView, 420);
    const container = map.getContainer().parentElement;
    const observer =
      typeof window.ResizeObserver !== 'undefined' && container
        ? new window.ResizeObserver(() => applyView())
        : null;

    observer?.observe(container ?? map.getContainer());

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.clearTimeout(animationTimer);
      observer?.disconnect();
    };
  }, [map, guess, actual]);

  return null;
}

function useRoundResultAvatar() {
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const [avatar, setAvatar] = useState<AvatarState>(() => readCachedAvatar() ?? createEmptyAvatarState());

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      const emptyAvatar = createEmptyAvatarState();
      setAvatar(emptyAvatar);
      writeCachedAvatar(null);
      return;
    }

    const cachedAvatar = readCachedAvatar();
    if (cachedAvatar) {
      setAvatar(cachedAvatar);
      return;
    }

    let isCancelled = false;

    const fetchAvatar = async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Missing auth token');
        }

        const response = await fetch('/api/account', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load account avatar');
        }

        const payload = await response.json() as {
          avatar?: unknown;
        };

        if (!isAvatarState(payload.avatar) || isCancelled) {
          return;
        }

        setAvatar(payload.avatar);
        writeCachedAvatar(payload.avatar);
      } catch (error) {
        console.error('Failed to load round result avatar.', error);

        if (isCancelled) {
          return;
        }

        setAvatar(readCachedAvatar() ?? createEmptyAvatarState());
      }
    };

    void fetchAvatar();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  return avatar;
}

interface RoundResultProps {
  result: Pick<RoundResult, 'photoLabel' | 'guessCoords' | 'actualCoords' | 'distanceKm' | 'points'>;
  roundNumber: number;
  totalScore: number;
  onNext?: () => void;
  isLastRound?: boolean;
  roundsCount?: number;
  footerNote?: string;
  showAdvanceButton?: boolean;
  advanceLabel?: string;
  showRoundBadge?: boolean;
  showTotalScoreBadge?: boolean;
  showPointsPlus?: boolean;
}

const RoundResult: React.FC<RoundResultProps> = ({
  result,
  roundNumber,
  totalScore,
  onNext,
  isLastRound,
  roundsCount = ROUNDS_PER_GAME,
  footerNote,
  showAdvanceButton = true,
  advanceLabel,
  showRoundBadge = true,
  showTotalScoreBadge = true,
  showPointsPlus = true,
}) => {
  const scoreRef = useRef<HTMLSpanElement>(null);
  const avatar = useRoundResultAvatar();
  const hasAdvanceButton = showAdvanceButton && Boolean(onNext);
  const performanceFeedback = getPerformanceFeedback(result.guessCoords, result.distanceKm);
  const showConfetti = Boolean(performanceFeedback?.showConfetti);
  const confettiKey = `${roundNumber}-${performanceFeedback?.label ?? 'no-label'}`;

  return (
    <>
      {showConfetti && typeof document !== 'undefined'
        ? createPortal(
            <div aria-hidden="true" className="round-result__confetti" key={confettiKey}>
              {confettiPieces.map((piece) => (
                <span
                  key={`${confettiKey}-${piece.id}`}
                  className="round-result__confetti-piece"
                  style={piece.style}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
      <div className="round-result">
        <div className="round-result__map">
          <MapContainer
            key={`${result.actualCoords.join(',')}-${result.guessCoords?.join(',') ?? 'no-guess'}`}
            className="round-result__leaflet"
            center={result.actualCoords}
            zoom={14}
            zoomControl={false}
            scrollWheelZoom={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <FitBounds guess={result.guessCoords} actual={result.actualCoords} />
            <Marker position={result.actualCoords} icon={correctIcon} />
            {result.guessCoords && <Marker position={result.guessCoords} icon={guessResultIcon} />}
            {result.guessCoords && (
              <Polyline
                positions={[result.guessCoords, result.actualCoords]}
                color="#002145"
                weight={2}
                dashArray="8,6"
                opacity={0.8}
              />
            )}
          </MapContainer>
          {showRoundBadge && (
            <div className="round-result__map-round">
              <div className="game-hud__round-label">
                Round {roundNumber}/{roundsCount}
              </div>
            </div>
          )}
          <div className="round-result__map-title">
            <div className="round-result__location">{result.photoLabel}</div>
          </div>
          {showTotalScoreBadge && (
            <div className="round-result__map-score">
              <div className="game-hud__score game-hud__score--pill">
                <span className="game-hud__score-label">Score</span>
                <span className="game-hud__score-value">{totalScore.toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="round-result__map-legend">
            <span className="legend-correct">Actual</span>
            <span className="legend-guess">Your guess</span>
          </div>
          {performanceFeedback && (
            <div
              key={`${roundNumber}-${performanceFeedback.label}`}
              aria-live="polite"
              className="round-result__performance-popup"
              role="status"
            >
              <RoundResultPerformancePopup avatar={avatar} label={performanceFeedback.label} />
            </div>
          )}
        </div>

        <div className="round-result__footer">
          <div className={`round-result__bottom-bar${hasAdvanceButton ? '' : ' round-result__bottom-bar--stats-only'}`}>
            <div className="round-result__bottom-stat round-result__bottom-stat--left">
              <span className="round-result__stat-label">Distance</span>
              <span className="round-result__stat-value round-result__stat-value--distance">
                {formatDistance(result.distanceKm)}
              </span>
            </div>
            {hasAdvanceButton && (
              <button className="btn-next ui-button ui-button--primary ui-button--lg" onClick={onNext} type="button">
                {advanceLabel ?? (isLastRound ? 'See Final Score' : 'Next Round')}
              </button>
            )}
            <div className="round-result__bottom-stat round-result__bottom-stat--right">
              <span className="round-result__stat-label">Points</span>
              <span className="round-result__stat-value round-result__stat-value--points" ref={scoreRef}>
                {showPointsPlus ? '+' : ''}
                {result.points.toLocaleString()}
              </span>
            </div>
          </div>
          {footerNote && <div className="round-result__note">{footerNote}</div>}
        </div>
      </div>
    </>
  );
};

export default RoundResult;
