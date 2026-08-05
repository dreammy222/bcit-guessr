import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { useLoadingOverlay } from './hooks/useLoadingOverlay';
import StartScreen from './components/StartScreen';
import SkeletonPlayScreen from './components/SkeletonPlayScreen';
import Timer from './components/Timer';
import './App.css';
import { ROUNDS_PER_GAME } from './utils/scoring';
import { Analytics } from '@vercel/analytics/react';

const DailyChallengeView = lazy(() => import('./components/DailyChallengeView'));
const GameSummary = lazy(() => import('./components/GameSummary'));
const MapGuess = lazy(() => import('./components/MapGuess'));
const PanoramaViewer = lazy(() => import('./components/PanoramaViewer'));
const PartyMode = lazy(() => import('./components/PartyMode'));
const RoundResult = lazy(() => import('./components/RoundResult'));

function App() {
  const game = useGameState();
  const [mapExpanded, setMapExpanded] = useState(() => window.innerWidth >= 768);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [settledRoundKey, setSettledRoundKey] = useState<string | null>(null);

  // Identifies the round currently on screen, so a new round re-arms the overlay.
  const activeRoundKey = game.activeRound
    ? `${game.activeRound.roundIndex}:${game.activeRound.photoUrl}`
    : null;
  // The panorama has either loaded or given up for this round.
  const roundSettled = activeRoundKey !== null && settledRoundKey === activeRoundKey;
  const isLoadingRound = game.isStarting || (game.phase === 'playing' && !roundSettled);
  const { visible: showSkeleton, exiting: skeletonExiting } = useLoadingOverlay(isLoadingRound, 600);

  const isHomeScreen = !pathname.startsWith('/party') && pathname !== '/daily' && game.isReady && game.phase === 'start' && !showSkeleton;
  const appClassName = isHomeScreen ? 'app app--scrollable' : 'app';

  const { handleActiveRoundReady } = game;

  const handlePanoramaReady = useCallback(() => {
    setSettledRoundKey(activeRoundKey);
    handleActiveRoundReady();
  }, [activeRoundKey, handleActiveRoundReady]);

  // Drop the overlay on failure too, otherwise it would hide the retry UI indefinitely.
  const handlePanoramaError = useCallback(() => {
    setSettledRoundKey(activeRoundKey);
  }, [activeRoundKey]);

  const toggleMap = () => setMapExpanded((prev) => !prev);
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (window.location.pathname === path) {
      setPathname(path);
      return;
    }

    if (options?.replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }

    setPathname(path);
  }, []);

  const handleNextRound = () => {
    setMapExpanded(window.innerWidth >= 768);
    void game.nextRound();
  };

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;

      if (pathname === '/play' && !nextPath.startsWith('/party') && game.isReady && game.phase !== 'start' && nextPath !== '/play') {
        window.history.pushState({}, '', '/play');
        setPathname('/play');
        return;
      }

      setPathname(nextPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [game.isReady, game.phase, pathname]);

  useEffect(() => {
    if (!game.isReady || pathname.startsWith('/party') || pathname === '/daily') {
      return;
    }

    if (game.phase === 'start') {
      if (pathname.startsWith('/play')) {
        navigate('/', { replace: true });
      }

      return;
    }

    if (pathname !== '/play') {
      navigate('/play');
    }
  }, [game.isReady, game.phase, navigate, pathname]);

  if (pathname.startsWith('/party')) {
    return (
      <div className={appClassName}>
        <Suspense fallback={null}>
          <PartyMode pathname={pathname} navigate={navigate} />
        </Suspense>
        <Analytics />
      </div>
    );
  }

  if (pathname === '/daily') {
    return (
      <div className={appClassName}>
        <Suspense fallback={null}>
          <DailyChallengeView navigate={navigate} />
        </Suspense>
        <Analytics />
      </div>
    );
  }

  if (!game.isReady) {
    return (
      <div className={appClassName}>
        <Analytics />
      </div>
    );
  }

  return (
    <div className={appClassName}>
      {game.phase === 'start' && !showSkeleton && (
        <StartScreen
          onStart={game.startGame}
          onStartDaily={() => navigate('/daily')}
          onPartyMode={() => navigate('/party')}
        />
      )}

      {game.phase === 'playing' && game.activeRound && (
        <div className="game-view">
          {/* Top HUD */}
          <div className="game-hud">
            <div className="game-hud__left">
              <div className="game-hud__round-label">
                Round {game.activeRound.roundIndex + 1}/{ROUNDS_PER_GAME}
              </div>
            </div>
            <div className="game-hud__center">
              <Timer
                timeRemaining={game.timeRemaining}
                isActive={game.timerActive}
                variant="hud-pill"
              />
            </div>
            <div className="game-hud__right">
              <div className="game-hud__score game-hud__score--pill">
                <span className="game-hud__score-label">Score</span>
                <span className="game-hud__score-value">{game.totalScore.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Panorama */}
          <div className="game-panorama">
            <Suspense fallback={null}>
              <PanoramaViewer
                photoUrl={game.activeRound.photoUrl}
                onReady={handlePanoramaReady}
                onError={handlePanoramaError}
              />
            </Suspense>
          </div>

          {/* Bottom overlay: map */}
          <div className="game-overlay">
            <Suspense fallback={null}>
              <MapGuess
                pendingGuess={game.pendingGuess}
                onGuess={game.setGuess}
                onSubmit={game.submitGuess}
                isExpanded={mapExpanded}
                onToggleExpand={toggleMap}
                canGuess={!game.awaitingRoundStart}
                canSubmit={!game.awaitingRoundStart}
              />
            </Suspense>
          </div>
        </div>
      )}

      {game.phase === 'round-result' && game.activeRound && game.roundResults.length > 0 && (
        <div className="result-view">
          <div className="result-view__content">
            <Suspense fallback={null}>
              <RoundResult
                result={game.roundResults[game.roundResults.length - 1]}
                roundNumber={game.activeRound.roundIndex + 1}
                totalScore={game.totalScore}
                onNext={handleNextRound}
                isLastRound={game.activeRound.roundIndex + 1 >= ROUNDS_PER_GAME}
              />
            </Suspense>
          </div>
        </div>
      )}

      {game.phase === 'game-summary' && (
        <div className="summary-view">
          <Suspense fallback={null}>
            <GameSummary
              gameSessionId={game.gameSessionId}
              leaderboardEligible={game.leaderboardEligible}
              results={game.roundResults}
              totalScore={game.totalScore}
              onPlayAgain={game.startGame}
              onReturnHome={game.restartGame}
            />
          </Suspense>
        </div>
      )}

      {showSkeleton && (
        <SkeletonPlayScreen mapExpanded={mapExpanded} isExiting={skeletonExiting} />
      )}
      <Analytics />
    </div>
  );
}

export default App;
