import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPartyProgress, fetchPartyStatus } from '../party/client';
import type {
  PartyProgressPayload,
  PartyStatusResponse,
  PartyStatusValue,
  PartyViewerRole,
} from '../party/types';

function getStatusPollIntervalMs(status?: PartyStatusValue) {
  if (status === 'lobby') {
    return 500;
  }

  return null;
}

function getProgressPollIntervalMs(status?: PartyStatusValue) {
  if (status === 'round_loading' || status === 'round_countdown') {
    return 500;
  }

  if (status === 'round_active' || status === 'finalizing') {
    return 1000;
  }

  if (status === 'round_result') {
    return 1500;
  }

  return null;
}

function mergeStatusWithProgress(
  previous: PartyStatusResponse,
  progress: PartyProgressPayload
): PartyStatusResponse {
  return {
    ...previous,
    session: {
      ...previous.session,
      status: progress.status,
      currentRoundIndex: progress.currentRoundIndex,
      roundTimeSeconds: progress.roundTimeSeconds,
      secondsRemaining: progress.secondsRemaining,
      serverNow: progress.serverNow,
      roundStartsAt: progress.roundStartsAt ?? null,
      loadingDeadlineAt: progress.loadingDeadlineAt ?? null,
      readyCount: progress.readyCount,
      readyTarget: progress.readyTarget,
      playerIsReadyForCurrentRound: progress.playerIsReadyForCurrentRound,
      ...(typeof progress.playerHasSubmittedCurrentRound === 'boolean'
        ? {
            playerHasSubmittedCurrentRound: progress.playerHasSubmittedCurrentRound,
          }
        : {}),
    },
  };
}

export function usePartySession(joinCode: string, role: PartyViewerRole, playerKey?: string) {
  const { getToken } = useAuth();
  const [data, setData] = useState<PartyStatusResponse | null>(null);
  const [progress, setProgress] = useState<PartyProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const dataRef = useRef<PartyStatusResponse | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadStatus = useCallback(async () => {
    if (!joinCode) {
      return;
    }

    try {
      const token = await getToken();
      const response = await fetchPartyStatus(joinCode, role, playerKey, token);
      setServerTimeOffsetMs(new Date(response.session.serverNow).getTime() - Date.now());
      setData(response);
      setProgress(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load party');
    } finally {
      setLoading(false);
    }
  }, [getToken, joinCode, playerKey, role]);

  const loadProgress = useCallback(async () => {
    if (!joinCode) {
      return;
    }

    const current = dataRef.current;
    if (!current) {
      await loadStatus();
      return;
    }

    try {
      const token = await getToken();
      const response = await fetchPartyProgress(joinCode, role, playerKey, token);
      const progressSession = response.session;
      setServerTimeOffsetMs(new Date(progressSession.serverNow).getTime() - Date.now());
      const currentSession = current.session;
      const phaseChanged =
        currentSession.status !== progressSession.status ||
        currentSession.currentRoundIndex !== progressSession.currentRoundIndex;
      const requiresRichReload =
        phaseChanged ||
        (progressSession.status === 'round_result' && !currentSession.roundTopFive) ||
        (progressSession.status === 'finished' && !currentSession.finalStandings);

      if (requiresRichReload) {
        setProgress(progressSession);
        await loadStatus();
        return;
      }

      setProgress(progressSession);
      setData((previous) => (previous ? mergeStatusWithProgress(previous, progressSession) : previous));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load party progress');
    } finally {
      setLoading(false);
    }
  }, [getToken, joinCode, playerKey, role, loadStatus]);

  useEffect(() => {
    setData(null);
    setProgress(null);
    setLoading(true);
    setError(null);
    void loadStatus();
  }, [joinCode, loadStatus, playerKey, role]);

  useEffect(() => {
    const sessionStatus = data?.session.status;
    if (!data || !sessionStatus) {
      return;
    }

    const progressPollIntervalMs = getProgressPollIntervalMs(sessionStatus);
    if (progressPollIntervalMs) {
      void loadProgress();
      const interval = window.setInterval(() => {
        void loadProgress();
      }, progressPollIntervalMs);
      return () => window.clearInterval(interval);
    }

    const statusPollIntervalMs = getStatusPollIntervalMs(sessionStatus);
    if (!statusPollIntervalMs) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadStatus();
    }, statusPollIntervalMs);

    return () => window.clearInterval(interval);
  }, [data?.session.currentRoundIndex, data?.session.status, loadProgress, loadStatus]);

  return {
    data,
    progress,
    loading,
    error,
    serverTimeOffsetMs,
    refresh: loadStatus,
  };
}
