import { useAuth } from '@clerk/clerk-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getPhotoUrl } from '../data/photoService';
import { ROUND_TIMER_SECONDS, ROUNDS_PER_GAME } from '../utils/scoring';
import type { PhotoLocation } from '../data/locations';
import { preloadPhoto } from '../utils/photoPreloader';
import { getOrCreateSinglePlayerClientToken } from '../utils/singlePlayerClientToken';

export type GamePhase = 'start' | 'playing' | 'round-result' | 'game-summary';

type PersistedGamePhase = Exclude<GamePhase, 'start'>;

const PHOTO_PRELOAD_WINDOW_SIZE = 2;
const SESSION_STORAGE_KEY = 'ubc_guessr_single_player_session';
const SESSION_STORAGE_VERSION = 5;

function warmPhotoCache(photos: PhotoLocation[]) {
  photos.forEach((photo) => {
    preloadPhoto(getPhotoUrl(photo)).catch(() => undefined);
  });
}

function isNumberTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function isPhotoLocation(value: unknown): value is PhotoLocation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const location = value as Partial<PhotoLocation>;

  return (
    typeof location.id === 'string' &&
    typeof location.filename === 'string' &&
    (location.coordinates === null || isNumberTuple(location.coordinates)) &&
    (location.label === undefined || typeof location.label === 'string') &&
    (location.hint === undefined || typeof location.hint === 'string')
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface RoundResult {
  photoId: string;
  photoLabel: string;
  guessCoords: [number, number] | null;
  actualCoords: [number, number];
  distanceKm: number | null;
  timeRemaining: number;
  points: number;
}

function isRoundResult(value: unknown): value is RoundResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const result = value as Partial<RoundResult>;

  return (
    typeof result.photoId === 'string' &&
    typeof result.photoLabel === 'string' &&
    (result.guessCoords === null || isNumberTuple(result.guessCoords)) &&
    isNumberTuple(result.actualCoords) &&
    (result.distanceKm === null || (typeof result.distanceKm === 'number' && Number.isFinite(result.distanceKm))) &&
    typeof result.timeRemaining === 'number' &&
    Number.isFinite(result.timeRemaining) &&
    typeof result.points === 'number' &&
    Number.isFinite(result.points)
  );
}

export interface ActiveRound {
  photoId: string;
  photoUrl: string;
  photoLabel: string;
  roundIndex: number;
}

interface PersistedGameSession {
  version: number;
  gameSessionId: string;
  leaderboardEligible: boolean;
  phase: PersistedGamePhase;
  selectedPhotos: PhotoLocation[];
  currentRoundIndex: number;
  roundResults: RoundResult[];
  totalScore: number;
  pendingGuess: [number, number] | null;
  awaitingRoundStart: boolean;
  timedOut: boolean;
  roundDeadlineAt: number | null;
}

function isPersistedGamePhase(value: unknown): value is PersistedGamePhase {
  return value === 'playing' || value === 'round-result' || value === 'game-summary';
}

function isPersistedGameSession(value: unknown): value is PersistedGameSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<PersistedGameSession>;

  return (
    session.version === SESSION_STORAGE_VERSION &&
    isNonEmptyString(session.gameSessionId) &&
    typeof session.leaderboardEligible === 'boolean' &&
    isPersistedGamePhase(session.phase) &&
    Array.isArray(session.selectedPhotos) &&
    session.selectedPhotos.length > 0 &&
    session.selectedPhotos.every(isPhotoLocation) &&
    typeof session.currentRoundIndex === 'number' &&
    Number.isInteger(session.currentRoundIndex) &&
    session.currentRoundIndex >= 0 &&
    session.currentRoundIndex < session.selectedPhotos.length &&
    Array.isArray(session.roundResults) &&
    session.roundResults.every(isRoundResult) &&
    session.roundResults.length <= session.currentRoundIndex + 1 &&
    !(session.phase === 'playing' && session.roundResults.length > session.currentRoundIndex) &&
    !((session.phase === 'round-result' || session.phase === 'game-summary') && session.roundResults.length !== session.currentRoundIndex + 1) &&
    typeof session.totalScore === 'number' &&
    Number.isFinite(session.totalScore) &&
    (session.pendingGuess === null || isNumberTuple(session.pendingGuess)) &&
    typeof session.awaitingRoundStart === 'boolean' &&
    typeof session.timedOut === 'boolean' &&
    (session.roundDeadlineAt === null || (typeof session.roundDeadlineAt === 'number' && Number.isFinite(session.roundDeadlineAt))) &&
    !(session.phase !== 'playing' && session.awaitingRoundStart) &&
    !(session.phase === 'playing' && session.awaitingRoundStart && session.timedOut) &&
    !(session.phase === 'playing' && session.awaitingRoundStart && session.roundDeadlineAt !== null) &&
    !(session.phase === 'playing' && !session.awaitingRoundStart && !session.timedOut && session.roundDeadlineAt === null)
  );
}

function getTimeRemaining(roundDeadlineAt: number | null) {
  if (roundDeadlineAt === null) {
    return ROUND_TIMER_SECONDS;
  }

  return Math.max(0, Math.ceil((roundDeadlineAt - Date.now()) / 1000));
}

function rebaseRoundDeadlineAt(roundDeadlineAt: number, serverNow: number) {
  const remainingMs = Math.max(0, roundDeadlineAt - serverNow);
  return Date.now() + remainingMs;
}

function clearPersistedSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function readPersistedSession(): PersistedGameSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession);

    if (!isPersistedGameSession(parsedSession)) {
      clearPersistedSession();
      return null;
    }

    return parsedSession;
  } catch (error) {
    console.error('Error restoring saved game session:', error);
    clearPersistedSession();
    return null;
  }
}

function persistSession(session: PersistedGameSession) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving game session:', error);
  }
}

export interface GameState {
  phase: GamePhase;
  activeRound: ActiveRound | null;
  gameSessionId: string | null;
  leaderboardEligible: boolean;
  roundResults: RoundResult[];
  totalScore: number;
  timeRemaining: number;
  timerActive: boolean;
  pendingGuess: [number, number] | null;
  awaitingRoundStart: boolean;
  timedOut: boolean;
  isReady: boolean;
}

export interface GameActions {
  startGame: () => void;
  handleActiveRoundReady: () => void;
  setGuess: (coords: [number, number]) => void;
  submitGuess: () => void;
  nextRound: () => Promise<void>;
  restartGame: () => void;
}

export function useGameState(): GameState & GameActions {
  const { getToken, isSignedIn } = useAuth();
  const [phase, setPhase] = useState<GamePhase>('start');
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoLocation[]>([]);
  const [gameSessionId, setGameSessionId] = useState<string | null>(null);
  const [leaderboardEligible, setLeaderboardEligible] = useState(false);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(ROUND_TIMER_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [pendingGuess, setPendingGuess] = useState<[number, number] | null>(null);
  const [awaitingRoundStart, setAwaitingRoundStart] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [roundDeadlineAt, setRoundDeadlineAt] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRemainingRef = useRef(ROUND_TIMER_SECONDS);
  const isStartingRef = useRef(false);
  const isBeginningRoundRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const isAdvancingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetGameState = useCallback(() => {
    clearTimer();
    isSubmittingRef.current = false;
    isAdvancingRef.current = false;
    setPhase('start');
    setSelectedPhotos([]);
    setGameSessionId(null);
    setLeaderboardEligible(false);
    setCurrentRoundIndex(0);
    setRoundResults([]);
    setTotalScore(0);
    setTimeRemaining(ROUND_TIMER_SECONDS);
    timeRemainingRef.current = ROUND_TIMER_SECONDS;
    setTimerActive(false);
    setPendingGuess(null);
    setAwaitingRoundStart(false);
    setTimedOut(false);
    setRoundDeadlineAt(null);
    isBeginningRoundRef.current = false;
    clearPersistedSession();
  }, [clearTimer]);

  useEffect(() => {
    const savedSession = readPersistedSession();

    if (savedSession) {
      const restoredTimeRemaining = savedSession.phase === 'playing'
        ? savedSession.awaitingRoundStart
          ? ROUND_TIMER_SECONDS
          : savedSession.timedOut
          ? 0
          : getTimeRemaining(savedSession.roundDeadlineAt)
        : ROUND_TIMER_SECONDS;

      setPhase(savedSession.phase);
      setGameSessionId(savedSession.gameSessionId);
      setLeaderboardEligible(savedSession.leaderboardEligible);
      setSelectedPhotos(savedSession.selectedPhotos);
      setCurrentRoundIndex(savedSession.currentRoundIndex);
      setRoundResults(savedSession.roundResults);
      setTotalScore(savedSession.totalScore);
      setPendingGuess(savedSession.pendingGuess);
      setAwaitingRoundStart(savedSession.awaitingRoundStart);
      setTimedOut(savedSession.timedOut);
      setRoundDeadlineAt(savedSession.roundDeadlineAt);
      setTimeRemaining(restoredTimeRemaining);
      timeRemainingRef.current = restoredTimeRemaining;
      setTimerActive(
        savedSession.phase === 'playing' &&
        !savedSession.awaitingRoundStart &&
        !savedSession.timedOut &&
        restoredTimeRemaining > 0
      );
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (phase === 'start' || selectedPhotos.length === 0 || !gameSessionId) {
      clearPersistedSession();
      return;
    }

    persistSession({
      version: SESSION_STORAGE_VERSION,
      gameSessionId,
      leaderboardEligible,
      phase,
      selectedPhotos,
      currentRoundIndex,
      roundResults,
      totalScore,
      pendingGuess,
      awaitingRoundStart,
      timedOut,
      roundDeadlineAt,
    });
  }, [
    awaitingRoundStart,
    currentRoundIndex,
    gameSessionId,
    isReady,
    leaderboardEligible,
    pendingGuess,
    phase,
    roundDeadlineAt,
    roundResults,
    selectedPhotos,
    timedOut,
    totalScore,
  ]);

  const currentPhoto = selectedPhotos[currentRoundIndex] ?? null;

  useEffect(() => {
    clearTimer();

    if (phase !== 'playing' || !currentPhoto) {
      setTimerActive(false);
      return;
    }

    if (awaitingRoundStart) {
      setTimerActive(false);
      return;
    }

    if (timedOut) {
      setTimerActive(false);
      setTimeRemaining(0);
      timeRemainingRef.current = 0;
      return;
    }

    if (roundDeadlineAt === null) {
      return;
    }

    const syncTimer = () => {
      const nextTimeRemaining = getTimeRemaining(roundDeadlineAt);

      timeRemainingRef.current = nextTimeRemaining;
      setTimeRemaining((previousTimeRemaining) => (
        previousTimeRemaining === nextTimeRemaining ? previousTimeRemaining : nextTimeRemaining
      ));

      if (nextTimeRemaining <= 0) {
        clearTimer();
        setTimerActive(false);
        setTimedOut(true);
      }
    };

    syncTimer();

    if (getTimeRemaining(roundDeadlineAt) <= 0) {
      return;
    }

    setTimerActive(true);
    timerRef.current = setInterval(syncTimer, 1000);

    return clearTimer;
  }, [awaitingRoundStart, clearTimer, currentPhoto, phase, roundDeadlineAt, timedOut]);

  useEffect(() => {
    if (selectedPhotos.length === 0) {
      return;
    }

    warmPhotoCache(selectedPhotos.slice(currentRoundIndex, currentRoundIndex + PHOTO_PRELOAD_WINDOW_SIZE));
  }, [currentRoundIndex, selectedPhotos]);

  const activeRound: ActiveRound | null = currentPhoto && phase !== 'start' && phase !== 'game-summary'
    ? {
        photoId: currentPhoto.id,
        photoUrl: getPhotoUrl(currentPhoto),
        photoLabel: currentPhoto.label ?? currentPhoto.id,
        roundIndex: currentRoundIndex,
      }
    : null;

  const setGuess = useCallback((coords: [number, number]) => {
    setPendingGuess(coords);
  }, []);

  const startGame = useCallback(async () => {
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;

    try {
      clearTimer();

      const token = isSignedIn ? await getToken() : null;
      const response = await fetch('/api/locations', {
        headers: {
          'X-Single-Player-Client': getOrCreateSinglePlayerClientToken(),
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load locations');
      }

      const payload = await response.json() as {
        gameSessionId?: unknown;
        leaderboardEligible?: unknown;
        locations?: unknown;
      };
      const photos = Array.isArray(payload.locations) ? payload.locations.filter(isPhotoLocation) : [];
      const nextGameSessionId = isNonEmptyString(payload.gameSessionId) ? payload.gameSessionId : null;

      if (!nextGameSessionId || photos.length === 0) {
        throw new Error('No playable locations available');
      }

      warmPhotoCache(photos.slice(0, PHOTO_PRELOAD_WINDOW_SIZE));

      setSelectedPhotos(photos);
      setGameSessionId(nextGameSessionId);
      setLeaderboardEligible(payload.leaderboardEligible === true);
      setCurrentRoundIndex(0);
      setRoundResults([]);
      setTotalScore(0);
      setPendingGuess(null);
      setAwaitingRoundStart(true);
      setTimedOut(false);
      setRoundDeadlineAt(null);
      setTimeRemaining(ROUND_TIMER_SECONDS);
      timeRemainingRef.current = ROUND_TIMER_SECONDS;
      setTimerActive(false);
      isBeginningRoundRef.current = false;
      isSubmittingRef.current = false;
      isAdvancingRef.current = false;
      setPhase('playing');
    } catch (error) {
      console.error('Error starting game:', error);
      alert('Could not start game. Please check your connection to the server database.');
    } finally {
      isStartingRef.current = false;
    }
  }, [clearTimer, getToken, isSignedIn]);

  const handleActiveRoundReady = useCallback(() => {
    if (!currentPhoto || !gameSessionId || phase !== 'playing' || !awaitingRoundStart) {
      return;
    }

    if (isBeginningRoundRef.current) {
      return;
    }

    isBeginningRoundRef.current = true;

    void (async () => {
      try {
        const response = await fetch('/api/score?action=begin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Single-Player-Client': getOrCreateSinglePlayerClientToken(),
          },
          body: JSON.stringify({
            gameSessionId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to start round timer');
        }

        const payload = await response.json() as {
          serverNow?: unknown;
          roundDeadlineAt?: unknown;
        };
        const nextRoundDeadlineAt = (
          typeof payload.roundDeadlineAt === 'number' &&
          Number.isFinite(payload.roundDeadlineAt) &&
          typeof payload.serverNow === 'number' &&
          Number.isFinite(payload.serverNow)
        )
          ? rebaseRoundDeadlineAt(payload.roundDeadlineAt, payload.serverNow)
          : null;

        if (nextRoundDeadlineAt === null) {
          throw new Error('Missing round deadline');
        }

        const nextTimeRemaining = getTimeRemaining(nextRoundDeadlineAt);

        setAwaitingRoundStart(false);
        setTimedOut(nextTimeRemaining <= 0);
        setRoundDeadlineAt(nextRoundDeadlineAt);
        setTimeRemaining(nextTimeRemaining);
        timeRemainingRef.current = nextTimeRemaining;
        setTimerActive(nextTimeRemaining > 0);
      } catch (error) {
        console.error('Error starting round timer:', error);
        alert('Could not start the round. Please start a new game.');
        resetGameState();
      } finally {
        isBeginningRoundRef.current = false;
      }
    })();
  }, [awaitingRoundStart, currentPhoto, gameSessionId, phase, resetGameState]);

  const submitGuess = useCallback(async () => {
    if (!currentPhoto || !gameSessionId || awaitingRoundStart) {
      return;
    }

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    clearTimer();
    setTimerActive(false);

    const guessCoords = pendingGuess;

    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Single-Player-Client': getOrCreateSinglePlayerClientToken(),
        },
        body: JSON.stringify({
          gameSessionId,
          guessCoords,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to score guess');
      }

      const payload = await response.json() as {
        isGameFinished?: unknown;
        result?: unknown;
        totalScore?: unknown;
      };
      if (!isRoundResult(payload.result) || typeof payload.totalScore !== 'number' || !Number.isFinite(payload.totalScore)) {
        throw new Error('Invalid score response');
      }

      const result: RoundResult = payload.result;

      setRoundDeadlineAt(null);
      setTimeRemaining(result.timeRemaining);
      timeRemainingRef.current = result.timeRemaining;
      setRoundResults((previousResults) => [...previousResults, result]);
      setTotalScore(payload.totalScore);
      setAwaitingRoundStart(false);
      setPhase('round-result');
    } catch (error) {
      console.error('Error submitting guess:', error);
      alert('Failed to score guess! Please check your connection or server logs.');
      resetGameState();
    }
  }, [awaitingRoundStart, clearTimer, currentPhoto, gameSessionId, pendingGuess, resetGameState]);

  useEffect(() => {
    if (timedOut && phase === 'playing' && !awaitingRoundStart) {
      void submitGuess();
    }
  }, [awaitingRoundStart, phase, submitGuess, timedOut]);

  const nextRound = useCallback(async () => {
    const nextRoundIndex = currentRoundIndex + 1;

    if (nextRoundIndex >= selectedPhotos.length || nextRoundIndex >= ROUNDS_PER_GAME || !gameSessionId) {
      clearTimer();
      isSubmittingRef.current = false;
      isAdvancingRef.current = false;
      setTimerActive(false);
      setAwaitingRoundStart(false);
      setRoundDeadlineAt(null);
      setTimedOut(false);
      setPhase('game-summary');
      return;
    }

    if (isAdvancingRef.current) {
      return;
    }

    isAdvancingRef.current = true;

    try {
      const response = await fetch('/api/score?action=next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Single-Player-Client': getOrCreateSinglePlayerClientToken(),
        },
        body: JSON.stringify({
          gameSessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to advance round');
      }
      isBeginningRoundRef.current = false;

      isSubmittingRef.current = false;
      setTimedOut(false);
      setCurrentRoundIndex(nextRoundIndex);
      setPendingGuess(null);
      setAwaitingRoundStart(true);
      setRoundDeadlineAt(null);
      setTimeRemaining(ROUND_TIMER_SECONDS);
      timeRemainingRef.current = ROUND_TIMER_SECONDS;
      setTimerActive(false);
      setPhase('playing');
    } catch (error) {
      console.error('Error advancing round:', error);
      alert('Could not load the next round. Please start a new game.');
      resetGameState();
    } finally {
      isAdvancingRef.current = false;
    }
  }, [clearTimer, currentRoundIndex, gameSessionId, resetGameState, selectedPhotos.length]);

  const restartGame = useCallback(() => {
    resetGameState();
  }, [resetGameState]);

  return {
    phase,
    activeRound,
    gameSessionId,
    leaderboardEligible,
    roundResults,
    totalScore,
    timeRemaining,
    timerActive,
    pendingGuess,
    awaitingRoundStart,
    timedOut,
    isReady,
    startGame,
    handleActiveRoundReady,
    setGuess,
    submitGuess,
    nextRound,
    restartGame,
  };
}
