import React, { useEffect, useRef, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import type { RoundResult } from '../hooks/useGameState';
import { createEmptyAvatarState, type AvatarState } from '../data/cosmetics';
import { isAvatarState } from '../utils/avatarCache';
import { formatDistance, MAX_POINTS_PER_ROUND, ROUNDS_PER_GAME } from '../utils/scoring';
import { createScoreSharePayload, shareScore } from '../utils/shareScore';
import { getOrCreateSinglePlayerClientToken } from '../utils/singlePlayerClientToken';
import './GameSummary.css';

interface GameSummaryProps {
  gameSessionId: string | null;
  leaderboardEligible: boolean;
  results: RoundResult[];
  totalScore: number;
  onPlayAgain: () => void;
  onReturnHome: () => void;
}

const GameSummary: React.FC<GameSummaryProps> = ({
  gameSessionId,
  results,
  totalScore,
  onPlayAgain,
  onReturnHome,
}) => {
  const maxScore = MAX_POINTS_PER_ROUND * ROUNDS_PER_GAME;
  const fillFraction = Math.min(1, Math.max(0, totalScore / maxScore));
  const [scoreStats, setScoreStats] = useState<{ isNewBest: boolean; personalBest: number | null }>({
    isNewBest: false,
    personalBest: null,
  });
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const { getToken } = useAuth();
  const { user, isSignedIn, isLoaded } = useUser();
  const hasSubmittedRef = useRef(false);
  const shareAvatarRef = useRef<AvatarState | null>(null);

  useEffect(() => {
    if (
      isLoaded &&
      isSignedIn &&
      user &&
      totalScore > 0 &&
      gameSessionId &&
      !hasSubmittedRef.current
    ) {
      hasSubmittedRef.current = true;

      const submitScore = async () => {
        try {
          const token = await getToken();
          if (!token) {
            throw new Error('Missing auth token');
          }

          const res = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'X-Single-Player-Client': getOrCreateSinglePlayerClientToken(),
            },
            body: JSON.stringify({
              gameSessionId,
              username: user.username || user.firstName || 'Anonymous',
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setScoreStats({ isNewBest: data.isNewBest, personalBest: data.personalBest });
            return;
          }

          const data = await res.json().catch(() => null) as { error?: unknown } | null;
          console.warn(
            'Score was not submitted to the leaderboard.',
            typeof data?.error === 'string' ? data.error : res.status
          );
        } catch (err) {
          console.error('Failed to submit score', err);
          hasSubmittedRef.current = false;
        }
      };

      void submitScore();
    }
  }, [gameSessionId, getToken, isLoaded, isSignedIn, totalScore, user]);

  useEffect(() => {
    if (!shareFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShareFeedback(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [shareFeedback]);

  useEffect(() => {
    shareAvatarRef.current = null;
  }, [isSignedIn, user?.id]);

  const resolveShareAvatar = async () => {
    if (shareAvatarRef.current) {
      return shareAvatarRef.current;
    }

    const fallbackAvatar = createEmptyAvatarState();

    if (!isSignedIn) {
      shareAvatarRef.current = fallbackAvatar;
      return fallbackAvatar;
    }

    try {
      const token = await getToken();
      if (!token) {
        shareAvatarRef.current = fallbackAvatar;
        return fallbackAvatar;
      }

      const res = await fetch('/api/account', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch avatar for share export (${res.status})`);
      }

      const data = await res.json() as { avatar?: unknown };
      const avatar = isAvatarState(data.avatar) ? data.avatar : fallbackAvatar;
      shareAvatarRef.current = avatar;
      return avatar;
    } catch (error) {
      console.warn('Falling back to default avatar for share export.', error);
      shareAvatarRef.current = fallbackAvatar;
      return fallbackAvatar;
    }
  };

  const handleShareScore = async () => {
    if (isSharing) {
      return;
    }

    setIsSharing(true);
    setShareFeedback(null);

    try {
      const avatar = await resolveShareAvatar();
      const result = await shareScore(createScoreSharePayload(totalScore, maxScore, results, avatar));

      if (result === 'copied') {
        setShareFeedback({ message: 'Image copied to clipboard', tone: 'success' });
      } else if (result === 'downloaded') {
        setShareFeedback({ message: 'Image downloaded', tone: 'success' });
      }
    } catch (error) {
      console.error('Failed to share score', error);
      setShareFeedback({ message: 'Could not export image', tone: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="game-summary">
      <SignedIn>
        <div className="game-summary__top-right">
          {scoreStats.personalBest !== null && (
            <div className="game-summary__highscore ui-badge">
              Highscore: {(scoreStats.isNewBest ? totalScore : scoreStats.personalBest).toLocaleString()}
            </div>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>

      <div className="game-summary__hero">
        <div className="game-summary__logo ui-page-logo">
          UBC<span>Guessr</span>
        </div>
        <div className="game-summary__score-ring">
          <svg viewBox="0 0 120 120" className="game-summary__ring-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#FFD100"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${2 * Math.PI * 52 * (1 - fillFraction)}`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div className="game-summary__ring-label">
            <span className="game-summary__score-big">{totalScore.toLocaleString()}</span>
            <span className="game-summary__score-max">/ {maxScore.toLocaleString()}</span>
          </div>
        </div>
        {scoreStats.isNewBest && <div className="game-summary__new-highscore ui-badge ui-badge--gold">New Highscore</div>}
        <SignedOut>
          {gameSessionId && totalScore > 0 && (
            <SignInButton mode="modal" fallbackRedirectUrl={undefined} forceRedirectUrl={undefined}>
              <button className="game-summary__record-score-link" type="button">
                sign in to record score
              </button>
            </SignInButton>
          )}
        </SignedOut>
      </div>

      <div className="game-summary__rounds">
        <h3 className="game-summary__rounds-title">Round Breakdown</h3>
        <div className="game-summary__rounds-list">
          {results.map((result, index) => (
            <div key={result.photoId} className="game-summary__round-row">
              <span className="game-summary__round-num">{index + 1}</span>
              <span className="game-summary__round-location">{result.photoLabel}</span>
              <span className="game-summary__round-distance">{formatDistance(result.distanceKm)}</span>
              <span className="game-summary__round-points">+{result.points.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="game-summary__actions">
        <button className="btn-return-home ui-button ui-button--light ui-button--md" onClick={onReturnHome} id="return-home-btn" type="button">
          Home
        </button>
        <div className="game-summary__share-action">
          <button
            className="game-summary__share-button ui-button ui-button--dark ui-button--md"
            onClick={() => void handleShareScore()}
            type="button"
            disabled={isSharing}
          >
            <svg className="game-summary__share-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14 3h7v7h-2V6.41l-7.29 7.3-1.42-1.42L17.59 5H14V3Zm-9 2h6v2H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6h2v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"
                fill="currentColor"
              />
            </svg>
            {isSharing ? 'Exporting...' : 'Share'}
          </button>
          {shareFeedback && (
            <span
              aria-live="polite"
              className={`game-summary__share-feedback game-summary__share-feedback--${shareFeedback.tone}`}
            >
              {shareFeedback.message}
            </span>
          )}
        </div>
        <button className="btn-play-again ui-button ui-button--primary ui-button--md" onClick={onPlayAgain} id="play-again-btn" type="button">
          Play Again
        </button>
      </div>
    </div>
  );
};

export default GameSummary;
