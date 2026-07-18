import { useAuth, useUser } from '@clerk/clerk-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyChallengeResult, DailyChallengeStartPayload } from '../daily/types';

const DAILY_TIMER_SECONDS = 60;

type DailyViewPhase = 'loading' | 'playing' | 'result' | 'auth-required' | 'unavailable' | 'error';

function getTimeRemaining(deadlineAt: number | null) {
  if (deadlineAt === null) {
    return DAILY_TIMER_SECONDS;
  }

  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
}

export interface DailyChallengeState {
  phase: DailyViewPhase;
  photoUrl: string | null;
  result: DailyChallengeResult | null;
  pendingGuess: [number, number] | null;
  timeRemaining: number;
  timerActive: boolean;
  awaitingPhotoReady: boolean;
  message: string | null;
  isReady: boolean;
}

export interface DailyChallengeActions {
  handlePhotoReady: () => void;
  setGuess: (coords: [number, number]) => void;
  submitGuess: () => void;
  retry: () => Promise<void>;
}

export function useDailyChallengeState(): DailyChallengeState & DailyChallengeActions {
  const { getToken } = useAuth();
  const { isSignedIn } = useUser();
  const [phase, setPhase] = useState<DailyViewPhase>('loading');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DailyChallengeResult | null>(null);
  const [pendingGuess, setPendingGuess] = useState<[number, number] | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(DAILY_TIMER_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [awaitingPhotoReady, setAwaitingPhotoReady] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSubmittingRef = useRef(false);
  const isBeginningRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const loadChallenge = useCallback(async () => {
    clearTimer();
    isSubmittingRef.current = false;
    isBeginningRef.current = false;
    setTimerActive(false);
    setAwaitingPhotoReady(false);
    setPhase('loading');
    setMessage(null);

    try {
      const token = await getToken();
      if (!token) {
        setPhotoUrl(null);
        setResult(null);
        setPendingGuess(null);
        setDeadlineAt(null);
        setTimeRemaining(DAILY_TIMER_SECONDS);
        setPhase('auth-required');
        setMessage("Sign in to play today's daily challenge.");
        return;
      }

      const response = await fetch('/api/daily?action=start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        setPhotoUrl(null);
        setResult(null);
        setPendingGuess(null);
        setDeadlineAt(null);
        setTimeRemaining(DAILY_TIMER_SECONDS);
        setPhase('auth-required');
        setMessage("Sign in to play today's daily challenge.");
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load daily challenge.');
      }

      const payload = (await response.json()) as DailyChallengeStartPayload;

      if (payload.state === 'unavailable') {
        setPhotoUrl(null);
        setResult(null);
        setPendingGuess(null);
        setDeadlineAt(null);
        setTimeRemaining(DAILY_TIMER_SECONDS);
        setPhase('unavailable');
        setMessage(payload.message);
        return;
      }

      if (payload.state === 'played') {
        setPhotoUrl(null);
        setResult(payload.result);
        setPendingGuess(payload.result.guessCoords);
        setDeadlineAt(null);
        setTimeRemaining(DAILY_TIMER_SECONDS);
        setPhase('result');
        return;
      }

      const nextAwaitingPhotoReady = payload.awaitingPhotoReady || payload.deadlineAt === null;
      const nextTimeRemaining = nextAwaitingPhotoReady ? DAILY_TIMER_SECONDS : getTimeRemaining(payload.deadlineAt);

      setPhotoUrl(payload.photoUrl);
      setResult(null);
      setPendingGuess(null);
      setDeadlineAt(payload.deadlineAt);
      setAwaitingPhotoReady(nextAwaitingPhotoReady);
      setTimeRemaining(nextTimeRemaining);
      setPhase('playing');
    } catch (error) {
      console.error('Error loading daily challenge:', error);
      setPhotoUrl(null);
      setResult(null);
      setPendingGuess(null);
      setDeadlineAt(null);
      setTimeRemaining(DAILY_TIMER_SECONDS);
      setPhase('error');
      setMessage('Could not load the daily challenge right now.');
    } finally {
      setIsReady(true);
    }
  }, [clearTimer, getToken, isSignedIn]);

  const handlePhotoReady = useCallback(() => {
    if (phase !== 'playing' || !photoUrl || !awaitingPhotoReady || isBeginningRef.current) {
      return;
    }

    isBeginningRef.current = true;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setAwaitingPhotoReady(false);
          setPhase('auth-required');
          setMessage("Sign in to play today's daily challenge.");
          return;
        }

        const response = await fetch('/api/daily?action=begin', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          setAwaitingPhotoReady(false);
          setPhase('auth-required');
          setMessage("Sign in to play today's daily challenge.");
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to begin daily challenge.');
        }

        const payload = (await response.json()) as DailyChallengeStartPayload;

        if (payload.state === 'played') {
          setPhotoUrl(null);
          setResult(payload.result);
          setPendingGuess(payload.result.guessCoords);
          setDeadlineAt(null);
          setAwaitingPhotoReady(false);
          setTimeRemaining(DAILY_TIMER_SECONDS);
          setPhase('result');
          return;
        }

        if (payload.state === 'unavailable') {
          setPhotoUrl(null);
          setResult(null);
          setPendingGuess(null);
          setDeadlineAt(null);
          setAwaitingPhotoReady(false);
          setTimeRemaining(DAILY_TIMER_SECONDS);
          setPhase('unavailable');
          setMessage(payload.message);
          return;
        }

        if (payload.deadlineAt === null) {
          throw new Error('Daily challenge timer did not start.');
        }

        const nextTimeRemaining = getTimeRemaining(payload.deadlineAt);

        setDeadlineAt(payload.deadlineAt);
        setAwaitingPhotoReady(false);
        setTimeRemaining(nextTimeRemaining);
        setTimerActive(nextTimeRemaining > 0);
      } catch (error) {
        console.error('Error beginning daily challenge:', error);
        setPhase('error');
        setMessage('Could not start the daily challenge timer.');
      } finally {
        isBeginningRef.current = false;
      }
    })();
  }, [awaitingPhotoReady, getToken, phase, photoUrl]);

  const submitGuess = useCallback(async () => {
    if (isSubmittingRef.current || phase !== 'playing' || awaitingPhotoReady) {
      return;
    }

    isSubmittingRef.current = true;
    clearTimer();
    setTimerActive(false);

    try {
      const token = await getToken();
      if (!token) {
        setAwaitingPhotoReady(false);
        setPhase('auth-required');
        setMessage("Sign in to play today's daily challenge.");
        return;
      }

      const response = await fetch('/api/daily?action=submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          guessCoords: pendingGuess,
        }),
      });

      if (response.status === 401) {
        setAwaitingPhotoReady(false);
        setPhase('auth-required');
        setMessage("Sign in to play today's daily challenge.");
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to submit daily challenge.');
      }

      const nextResult = (await response.json()) as DailyChallengeResult;
      setResult(nextResult);
      setDeadlineAt(null);
      setAwaitingPhotoReady(false);
      setPhase('result');
    } catch (error) {
      console.error('Error submitting daily challenge:', error);
      setPhase('error');
      setMessage('Could not submit your daily challenge guess.');
      setAwaitingPhotoReady(false);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [awaitingPhotoReady, clearTimer, getToken, pendingGuess, phase]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    clearTimer();

    if (phase !== 'playing' || awaitingPhotoReady || deadlineAt === null) {
      setTimerActive(false);
      return;
    }

    const syncTimer = () => {
      const nextTimeRemaining = getTimeRemaining(deadlineAt);
      setTimeRemaining((previousTimeRemaining) => (
        previousTimeRemaining === nextTimeRemaining ? previousTimeRemaining : nextTimeRemaining
      ));

      if (nextTimeRemaining <= 0) {
        clearTimer();
        setTimerActive(false);
        void submitGuess();
      }
    };

    syncTimer();

    if (getTimeRemaining(deadlineAt) <= 0) {
      return;
    }

    setTimerActive(true);
    timerRef.current = setInterval(syncTimer, 1000);

    return clearTimer;
  }, [awaitingPhotoReady, clearTimer, deadlineAt, phase, submitGuess]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    phase,
    photoUrl,
    result,
    pendingGuess,
    timeRemaining,
    timerActive,
    awaitingPhotoReady,
    message,
    isReady,
    handlePhotoReady,
    setGuess: setPendingGuess,
    submitGuess,
    retry: loadChallenge,
  };
}
