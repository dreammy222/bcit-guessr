import React, { useState } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import PanoramaViewer from './PanoramaViewer';
import MapGuess from './MapGuess';
import Timer from './Timer';
import RoundResult from './RoundResult';
import { useDailyChallengeState } from '../hooks/useDailyChallengeState';

interface DailyChallengeViewProps {
  navigate: (path: string, options?: { replace?: boolean }) => void;
}

const DAILY_TIMER_SECONDS = 60;

const DailyChallengeView: React.FC<DailyChallengeViewProps> = ({ navigate }) => {
  const daily = useDailyChallengeState();
  const [mapExpanded, setMapExpanded] = useState(() => window.innerWidth >= 768);

  const handleReturnHome = () => {
    navigate('/', { replace: true });
  };

  if (!daily.isReady || daily.phase === 'loading') {
    return (
      <div className="summary-view">
        <div className="daily-route-card">
          <h2 className="daily-route-card__title">Loading Daily Challenge</h2>
          <p className="daily-route-card__text">Fetching today's challenge...</p>
        </div>
      </div>
    );
  }

  if (daily.phase === 'auth-required') {
    return (
      <div className="summary-view">
        <div className="daily-route-card">
          <h2 className="daily-route-card__title">Sign In Required</h2>
          <p className="daily-route-card__text">{daily.message ?? "Sign in to play today's daily challenge."}</p>
          <div className="daily-route-card__actions">
            <button className="ui-button ui-button--light ui-button--md" onClick={handleReturnHome} type="button">
              Home
            </button>
            <SignInButton mode="modal" fallbackRedirectUrl={undefined} forceRedirectUrl={undefined}>
              <button className="ui-button ui-button--primary ui-button--md" type="button">
                Sign In
              </button>
            </SignInButton>
          </div>
        </div>
      </div>
    );
  }

  if (daily.phase === 'unavailable' || daily.phase === 'error') {
    return (
      <div className="summary-view">
        <div className="daily-route-card">
          <h2 className="daily-route-card__title">
            {daily.phase === 'unavailable' ? 'Daily Challenge Unavailable' : 'Something Went Wrong'}
          </h2>
          <p className="daily-route-card__text">{daily.message ?? 'Please try again in a moment.'}</p>
          <div className="daily-route-card__actions">
            <button className="ui-button ui-button--light ui-button--md" onClick={handleReturnHome} type="button">
              Home
            </button>
            {daily.phase === 'error' && (
              <button className="ui-button ui-button--primary ui-button--md" onClick={() => void daily.retry()} type="button">
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (daily.phase === 'playing' && daily.photoUrl) {
    return (
      <div className="game-view">
        <div className="game-hud game-hud--daily">
          <div className="game-hud__center">
            <Timer
              timeRemaining={daily.timeRemaining}
              isActive={daily.timerActive}
              variant="hud-pill"
              durationSeconds={DAILY_TIMER_SECONDS}
            />
          </div>
        </div>

        <div className="game-panorama">
          <PanoramaViewer photoUrl={daily.photoUrl} onReady={daily.handlePhotoReady} />
        </div>

        <div className="game-overlay">
          <MapGuess
            pendingGuess={daily.pendingGuess}
            onGuess={daily.setGuess}
            onSubmit={daily.submitGuess}
            isExpanded={mapExpanded}
            onToggleExpand={() => setMapExpanded((previous) => !previous)}
            canGuess={!daily.awaitingPhotoReady}
            canSubmit={!daily.awaitingPhotoReady}
          />
        </div>
      </div>
    );
  }

  if (daily.phase === 'result' && daily.result) {
    return (
      <div className="result-view">
        <div className="result-view__content">
          <RoundResult
            result={daily.result}
            roundNumber={1}
            totalScore={daily.result.points}
            onNext={handleReturnHome}
            isLastRound={true}
            roundsCount={1}
            advanceLabel="Finish & Go Home"
            showRoundBadge={false}
            showTotalScoreBadge={false}
            showPointsPlus={false}
          />
        </div>
      </div>
    );
  }

  return null;
};

export default DailyChallengeView;
