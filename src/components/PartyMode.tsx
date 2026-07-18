import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SignInButton, useAuth, useUser } from '@clerk/clerk-react';
import { renderSVG } from 'uqr';
import AvatarPreview from './AvatarPreview';
import MapGuess from './MapGuess';
import PanoramaViewer from './PanoramaViewer';
import RoundResult from './RoundResult';
import Timer from './Timer';
import {
  advanceParty,
  createParty,
  endParty,
  getPartyDisplayName,
  getPartyPlayerKey,
  joinParty,
  setPartyDisplayName,
  setPartyPlayerKey,
  startParty,
  markPartyRoundReady,
  submitPartyGuess,
} from '../party/client';
import { PARTY_ROUND_COUNTDOWN_SECONDS } from '../party/constants';
import type { PartyPlayerSummary, PartyTopEntry } from '../party/types';
import { usePartySession } from '../hooks/usePartySession';
import PartyPill from './PartyPill';
import './PartyMode.css';

interface PartyModeProps {
  pathname: string;
  navigate: (path: string) => void;
}

function parsePartyPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (pathname === '/party') {
    return { type: 'entry' as const };
  }

  if (pathname === '/party/host') {
    return { type: 'host-setup' as const };
  }

  if (pathname === '/party/join') {
    return { type: 'join' as const };
  }

  if (segments.length === 3 && segments[0] === 'party' && /^\d{6}$/.test(segments[1]) && segments[2] === 'host') {
    return { type: 'host-live' as const, joinCode: segments[1] };
  }

  if (segments.length === 3 && segments[0] === 'party' && /^\d{6}$/.test(segments[1]) && segments[2] === 'play') {
    return { type: 'player-live' as const, joinCode: segments[1] };
  }

  return { type: 'entry' as const };
}

function getCodeFromJoinQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6);
}

function buildPartyJoinUrl(joinCode: string) {
  return new URL(`/party/join?code=${encodeURIComponent(joinCode)}`, window.location.origin).toString();
}

type PartyOverviewTab = 'join' | 'create';

const PARTY_FOLDER_DESKTOP_TAB_HEIGHT = 74;
const PARTY_FOLDER_MOBILE_TAB_HEIGHT = 64;
const PARTY_FOLDER_DESKTOP_RADIUS = 28;
const PARTY_FOLDER_MOBILE_RADIUS = 24;
const PARTY_FOLDER_DESKTOP_INNER_RADIUS = 22;
const PARTY_FOLDER_MOBILE_INNER_RADIUS = 18;

function getPartyFolderMetrics(width: number, height: number) {
  const safeWidth = Math.max(width, 280);
  const isCompact = safeWidth <= 380;
  const tabHeight = isCompact ? PARTY_FOLDER_MOBILE_TAB_HEIGHT : PARTY_FOLDER_DESKTOP_TAB_HEIGHT;
  const outerRadius = isCompact ? PARTY_FOLDER_MOBILE_RADIUS : PARTY_FOLDER_DESKTOP_RADIUS;
  const innerRadius = isCompact ? PARTY_FOLDER_MOBILE_INNER_RADIUS : PARTY_FOLDER_DESKTOP_INNER_RADIUS;
  const safeHeight = Math.max(height, tabHeight + outerRadius * 3);
  const tabWidth = safeWidth / 2;

  return {
    width: safeWidth,
    height: safeHeight,
    tabHeight,
    tabWidth,
    outerRadius,
    innerRadius,
  };
}

function buildJoinFrontSheetPath(metrics: ReturnType<typeof getPartyFolderMetrics>) {
  const {
    width,
    height,
    tabHeight,
    tabWidth,
    outerRadius,
    innerRadius,
  } = metrics;

  return [
    `M 0 ${outerRadius}`,
    `Q 0 0 ${outerRadius} 0`,
    `L ${tabWidth - outerRadius} 0`,
    `Q ${tabWidth} 0 ${tabWidth} ${outerRadius}`,
    `L ${tabWidth} ${tabHeight - innerRadius}`,
    `Q ${tabWidth} ${tabHeight} ${tabWidth + innerRadius} ${tabHeight}`,
    `L ${width} ${tabHeight}`,
    `L ${width} ${height - outerRadius}`,
    `Q ${width} ${height} ${width - outerRadius} ${height}`,
    `L ${outerRadius} ${height}`,
    `Q 0 ${height} 0 ${height - outerRadius}`,
    'Z',
  ].join(' ');
}

function buildCreateFrontSheetPath(metrics: ReturnType<typeof getPartyFolderMetrics>) {
  const {
    width,
    height,
    tabHeight,
    tabWidth,
    outerRadius,
    innerRadius,
  } = metrics;

  return [
    `M 0 ${tabHeight}`,
    `L ${width - tabWidth - innerRadius} ${tabHeight}`,
    `Q ${width - tabWidth} ${tabHeight} ${width - tabWidth} ${tabHeight - innerRadius}`,
    `L ${width - tabWidth} ${outerRadius}`,
    `Q ${width - tabWidth} 0 ${width - tabWidth + outerRadius} 0`,
    `L ${width - outerRadius} 0`,
    `Q ${width} 0 ${width} ${outerRadius}`,
    `L ${width} ${height - outerRadius}`,
    `Q ${width} ${height} ${width - outerRadius} ${height}`,
    `L ${outerRadius} ${height}`,
    `Q 0 ${height} 0 ${height - outerRadius}`,
    `L 0 ${tabHeight}`,
    'Z',
  ].join(' ');
}

function PartyStandingsList({ entries }: { entries: PartyTopEntry[] }) {
  return (
    <div className="party-standings">
      {entries.map((entry) => (
        <div className="party-standing-row" key={`${entry.displayName}-${entry.rank}`}>
          <span>#{entry.rank ?? '-'}</span>
          <strong>{entry.displayName}</strong>
          <span>{entry.points.toLocaleString()} pts</span>
        </div>
      ))}
    </div>
  );
}

function PartyLeaderboard({ title, entries }: { title: string; entries: PartyTopEntry[] }) {
  return (
    <div className="party-card party-card--leaderboard">
      <h3 className="party-card__title">{title}</h3>
      <PartyStandingsList entries={entries} />
    </div>
  );
}

interface PartyDecoratedTopEntry extends PartyTopEntry {
  avatar: PartyPlayerSummary['avatar'] | null;
  placement: number;
}

function sortPartyTopEntries(entries: PartyTopEntry[]) {
  return [...entries].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    if (b.points !== a.points) {
      return b.points - a.points;
    }

    return a.displayName.localeCompare(b.displayName);
  });
}

function decoratePartyTopEntries(entries: PartyTopEntry[], players: PartyPlayerSummary[]): PartyDecoratedTopEntry[] {
  const avatarByName = new Map(players.map((player) => [player.displayName, player.avatar ?? null]));

  return sortPartyTopEntries(entries).map((entry, index) => ({
    ...entry,
    avatar: avatarByName.get(entry.displayName) ?? null,
    placement: entry.rank ?? index + 1,
  }));
}

function getPodiumDisplayEntries(entries: PartyDecoratedTopEntry[]) {
  if (entries.length <= 1) {
    return entries;
  }

  if (entries.length === 2) {
    return [entries[1], entries[0]];
  }

  return [entries[1], entries[0], entries[2]];
}

function getPodiumPlacementLabel(placement: number) {
  if (placement === 1) {
    return '\u{1F947}';
  }

  if (placement === 2) {
    return '\u{1F948}';
  }

  if (placement === 3) {
    return '\u{1F949}';
  }

  return `#${placement}`;
}

function PartyPodiumSlot({ entry }: { entry: PartyDecoratedTopEntry }) {
  const placeClass =
    entry.placement === 1
      ? 'party-podium__slot--first'
      : entry.placement === 2
        ? 'party-podium__slot--second'
        : 'party-podium__slot--third';

  return (
    <article className={`party-podium__slot ${placeClass}`}>
      <div className="party-podium__identity">
        <span className="party-podium__name" title={entry.displayName}>{entry.displayName}</span>
        <div className="party-podium__avatar-shell">
          <AvatarPreview avatar={entry.avatar} size="sm" />
        </div>
      </div>
      <div className="party-podium__pillar">
        <div className="party-podium__rank-badge">{getPodiumPlacementLabel(entry.placement)}</div>
        <div className="party-podium__score">
          <strong>{entry.points.toLocaleString()}</strong>
          <span>Points</span>
        </div>
      </div>
    </article>
  );
}

function PartyRunnerUps({ entries }: { entries: PartyDecoratedTopEntry[] }) {
  if (!entries.length) {
    return null;
  }

  return (
    <div className="party-runnerups">
      <h3 className="party-runnerups__title">Runner Ups</h3>
      <div className="party-runnerups__list">
        {entries.map((entry) => (
          <div className="party-runnerups__row" key={`${entry.displayName}-${entry.placement}`}>
            <span className="party-runnerups__rank">#{entry.placement}</span>
            <div className="party-runnerups__avatar">
              <AvatarPreview avatar={entry.avatar} size="xs" />
            </div>
            <strong title={entry.displayName}>{entry.displayName}</strong>
            <span>{entry.points.toLocaleString()} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyRoundCountdownOverlay({
  roundNumber,
  roundsCount,
  secondsRemaining,
}: {
  roundNumber: number;
  roundsCount: number;
  secondsRemaining: number;
}) {
  return (
    <div className="party-round-overlay">
      <div className="party-round-overlay__card">
        <span className="party-round-overlay__eyebrow">Round {roundNumber} / {roundsCount}</span>
        <strong className="party-round-overlay__count">{secondsRemaining}s</strong>
      </div>
    </div>
  );
}

function PartyRoundLoadingOverlay({
  roundNumber,
  roundsCount,
  readyCount,
  readyTarget,
}: {
  roundNumber: number;
  roundsCount: number;
  readyCount: number;
  readyTarget: number;
}) {
  return (
    <div className="party-round-overlay">
      <div className="party-round-overlay__card">
        <span className="party-round-overlay__eyebrow">Round {roundNumber} / {roundsCount}</span>
        <strong className="party-round-overlay__status">Loading</strong>
        <span className="party-round-overlay__meta">{readyCount} / {readyTarget} ready</span>
      </div>
    </div>
  );
}

function getAdjustedNow(serverTimeOffsetMs = 0) {
  return Date.now() + serverTimeOffsetMs;
}

function getCountdownSecondsUntil(roundStartsAt?: string | null, serverTimeOffsetMs = 0) {
  if (!roundStartsAt) {
    return 0;
  }

  const remainingMs = new Date(roundStartsAt).getTime() - getAdjustedNow(serverTimeOffsetMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function getRoundSecondsRemaining(
  roundStartsAt: string | null | undefined,
  roundTimeSeconds: number,
  serverTimeOffsetMs = 0
) {
  if (!roundStartsAt) {
    return roundTimeSeconds;
  }

  const elapsedSeconds = Math.floor(
    Math.max(0, getAdjustedNow(serverTimeOffsetMs) - new Date(roundStartsAt).getTime()) / 1000
  );

  return Math.max(0, roundTimeSeconds - elapsedSeconds);
}

function usePartyRoundCountdown(
  isActive: boolean,
  roundStartsAt?: string | null,
  serverTimeOffsetMs = 0,
  fallbackSeconds = 0
) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => (
    isActive ? getCountdownSecondsUntil(roundStartsAt, serverTimeOffsetMs) || fallbackSeconds : 0
  ));

  useEffect(() => {
    if (!isActive) {
      setSecondsRemaining(0);
      return;
    }

    const updateCountdown = () => {
      const nextSeconds = getCountdownSecondsUntil(roundStartsAt, serverTimeOffsetMs);
      setSecondsRemaining(nextSeconds > 0 ? nextSeconds : 0);
    };

    updateCountdown();

    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [fallbackSeconds, isActive, roundStartsAt, serverTimeOffsetMs]);

  return secondsRemaining;
}

function usePartyRoundTimer(
  isActive: boolean,
  roundStartsAt: string | null | undefined,
  roundTimeSeconds: number,
  serverTimeOffsetMs = 0,
  fallbackSeconds = 0
) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => (
    isActive ? getRoundSecondsRemaining(roundStartsAt, roundTimeSeconds, serverTimeOffsetMs) : fallbackSeconds
  ));

  useEffect(() => {
    if (!isActive) {
      setSecondsRemaining(fallbackSeconds);
      return;
    }

    const updateTimer = () => {
      setSecondsRemaining(getRoundSecondsRemaining(roundStartsAt, roundTimeSeconds, serverTimeOffsetMs));
    };

    updateTimer();

    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [fallbackSeconds, isActive, roundStartsAt, roundTimeSeconds, serverTimeOffsetMs]);

  return secondsRemaining;
}

function PartyFinalStandings({
  title,
  entries,
  players,
  summaryItems = [],
}: {
  title: string;
  entries: PartyTopEntry[];
  players: PartyPlayerSummary[];
  summaryItems?: Array<{ label: string; value: string }>;
}) {
  const decoratedEntries = useMemo(() => decoratePartyTopEntries(entries, players), [entries, players]);
  const podiumEntries = decoratedEntries.slice(0, 3);
  const podiumDisplayEntries = useMemo(() => getPodiumDisplayEntries(podiumEntries), [podiumEntries]);
  const runnerUps = decoratedEntries.slice(3);

  return (
    <div className="party-card party-card--podium">
      <div className="party-podium__header">
        <h2 className="party-podium__title">{title}</h2>
        {summaryItems.length > 0 && (
          <div className="party-podium__summary">
            {summaryItems.map((item) => (
              <div className="party-podium__summary-badge" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {podiumEntries.length > 0 ? (
        <div className={`party-podium party-podium--count-${podiumEntries.length}`}>
          <div className="party-podium__winners">
            {podiumDisplayEntries.map((entry) => (
              <PartyPodiumSlot entry={entry} key={`${entry.displayName}-${entry.placement}`} />
            ))}
          </div>
          <PartyRunnerUps entries={runnerUps} />
        </div>
      ) : (
        <p className="party-helper-copy">Final standings will appear here once the party wraps up.</p>
      )}
    </div>
  );
}

function buildCumulativeStandings(players: PartyPlayerSummary[]): PartyTopEntry[] {
  return [...players]
    .sort((a, b) => {
      const rankA = a.currentRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.currentRank ?? Number.MAX_SAFE_INTEGER;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, 5)
    .map((player, index) => ({
      displayName: player.displayName,
      points: player.totalPoints,
      rank: player.currentRank ?? index + 1,
    }));
}

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

function PartyJoinQrCode({ joinCode, joinUrl }: { joinCode: string; joinUrl: string }) {
  const qrSvg = useMemo(
    () => renderSVG(joinUrl, {
      blackColor: '#0d1b3e',
      border: 2,
      ecc: 'M',
      pixelSize: 4,
      whiteColor: '#ffffff',
    }),
    [joinUrl]
  );

  return (
    <a
      aria-label={`Open party join link for code ${joinCode}`}
      className="party-join-qr"
      href={joinUrl}
      rel="noreferrer"
      target="_blank"
    >
      <span
        aria-hidden="true"
        className="party-join-qr__image"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
    </a>
  );
}

function PartyOverview({ navigate, initialTab = 'join' }: { navigate: (path: string) => void; initialTab?: 'join' | 'create' }) {
  const { getToken } = useAuth();
  const { user, isSignedIn } = useUser();
  const initialJoinCode = useMemo(() => getCodeFromJoinQuery(), []);
  const [activeTab, setActiveTab] = useState<PartyOverviewTab>(initialJoinCode ? 'join' : initialTab);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rawClipPathId = useId();
  const frontClipPathId = `party-folder-front-${rawClipPathId.replace(/:/g, '')}`;
  const [cardSize, setCardSize] = useState({ width: 440, height: 394 });

  // Join State
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [displayName, setDisplayName] = useState(user?.username || user?.firstName || '');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Host State
  const [roundsDraft, setRoundsDraft] = useState('5');
  const [roundTimeDraft, setRoundTimeDraft] = useState('30');
  const [isCreating, setIsCreating] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const normalizeRounds = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);

    if (!digits) {
      return 5;
    }

    return Math.max(1, Math.min(Number(digits), 20));
  };

  const normalizeRoundTime = (value: string) => {
    const digits = value.replace(/\D/g, '');

    if (!digits) {
      return 30;
    }

    const seconds = Number(digits);
    return Number.isFinite(seconds) ? Math.floor(seconds) : 30;
  };

  const validateRoundTime = () => {
    const roundTimeSeconds = normalizeRoundTime(roundTimeDraft);

    if (roundTimeSeconds < 10) {
      return null;
    }

    return roundTimeSeconds;
  };

  useEffect(() => {
    if (isSignedIn && !displayName) {
      setDisplayName(user?.username || user?.firstName || '');
    }
  }, [isSignedIn, user, displayName]);

  useLayoutEffect(() => {
    const node = cardRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.round(node.clientWidth);
      const nextHeight = Math.round(node.clientHeight);

      setCardSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ));
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);

    return () => observer.disconnect();
  }, [activeTab]);

  const folderMetrics = useMemo(
    () => getPartyFolderMetrics(cardSize.width, cardSize.height),
    [cardSize.height, cardSize.width]
  );

  const frontSheetPath = useMemo(
    () => (activeTab === 'join' ? buildJoinFrontSheetPath(folderMetrics) : buildCreateFrontSheetPath(folderMetrics)),
    [activeTab, folderMetrics]
  );

  const folderStyle = useMemo(
    () => ({
      '--party-folder-tab-height': `${folderMetrics.tabHeight}px`,
      '--party-folder-tab-width': `${folderMetrics.tabWidth}px`,
      '--party-folder-tab-radius': `${folderMetrics.outerRadius}px`,
    }) as React.CSSProperties,
    [folderMetrics.outerRadius, folderMetrics.tabHeight, folderMetrics.tabWidth]
  );

  const handleJoin = async () => {
    if (!joinCode || !displayName) return;
    try {
      setIsJoining(true);
      setJoinError(null);
      const token = await getToken();
      const result = await joinParty(joinCode.trim(), displayName.trim(), token);
      setPartyPlayerKey(result.joinCode, result.playerKey);
      setPartyDisplayName(result.joinCode, result.displayName);
      navigate(`/party/${result.joinCode}/play`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join party');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      setHostError(null);
      const roundsCount = normalizeRounds(roundsDraft);
      const roundTimeSeconds = validateRoundTime();

      if (roundTimeSeconds === null) {
        setHostError('Time too short');
        return;
      }

      setRoundsDraft(String(roundsCount));
      setRoundTimeDraft(String(roundTimeSeconds));
      const token = await getToken();
      const result = await createParty(roundsCount, roundTimeSeconds, user?.username || user?.firstName || 'Host', token);
      navigate(`/party/${result.joinCode}/host`);
    } catch (err) {
      setHostError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="party-shell party-shell--overview">
      <div className="party-overview-content">
        <div className="party-header">
          <button className="party-back ui-button ui-button--dark ui-button--sm" onClick={() => navigate('/')} type="button">Home</button>
          <h1 className="party-title ui-hero-title">Party <span>Mode</span></h1>
        </div>

        <div
          ref={cardRef}
          className={`party-auth-card party-auth-card--${activeTab}`}
          style={folderStyle}
        >
          <svg
            aria-hidden="true"
            className="party-auth-card__defs"
            focusable="false"
            width="100%"
            height="100%"
            viewBox={`0 0 ${folderMetrics.width} ${folderMetrics.height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <clipPath id={frontClipPathId} clipPathUnits="userSpaceOnUse">
                <path d={frontSheetPath} />
              </clipPath>
            </defs>
          </svg>
          <div className="party-auth-card__stack" aria-hidden="true">
            <div className="party-auth-card__back-tab" />
            <div
              className="party-auth-card__front-sheet"
              style={{
                clipPath: `url(#${frontClipPathId})`,
                WebkitClipPath: `url(#${frontClipPathId})`,
              }}
            />
          </div>
          <div className="party-tabs">
            <button
              className={`party-tab ${activeTab === 'join' ? 'party-tab--active' : ''}`}
              onClick={() => setActiveTab('join')}
              data-tab="join"
              type="button"
            >
              Join
            </button>
            <button
              className={`party-tab ${activeTab === 'create' ? 'party-tab--active' : ''}`}
              onClick={() => setActiveTab('create')}
              data-tab="create"
              type="button"
            >
              Create
            </button>
          </div>

          <div className="party-tab-content">
            {activeTab === 'join' ? (
              <>
                <div className="party-form-group">
                  <label className="party-label" htmlFor="join-code">Enter 6 digit Code</label>
                  <input
                    id="join-code"
                    className="party-input"
                    inputMode="numeric"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <div className="party-form-group">
                  <label className="party-label" htmlFor="display-name">Enter Alias</label>
                  <input
                    id="display-name"
                    className="party-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <button
                  className="party-action-btn ui-button ui-button--primary ui-button--md"
                  onClick={handleJoin}
                  disabled={isJoining || !joinCode || !displayName}
                  type="button"
                >
                  {isJoining ? 'Joining...' : 'Join'}
                </button>
                {joinError && <p className="party-error">{joinError}</p>}
              </>
            ) : (
              <>
                {!isSignedIn ? (
                  <div className="party-form-group">
                    <p className="party-helper-copy">Hosts must be signed in.</p>
                    <SignInButton mode="modal">
                      <button className="party-action-btn party-action-btn--alt ui-button ui-button--light ui-button--md" type="button">Sign In</button>
                    </SignInButton>
                  </div>
                ) : (
                  <>
                    <button
                      className="party-action-btn party-action-btn--alt ui-button ui-button--light ui-button--md"
                      onClick={handleCreate}
                      disabled={isCreating}
                      type="button"
                    >
                      {isCreating ? 'Creating...' : 'Create Party'}
                    </button>

                    <button className="party-settings-toggle" onClick={() => setShowSettings(true)} type="button">
                      <SettingsIcon />
                      Settings
                    </button>

                    {hostError && <p className="party-error">{hostError}</p>}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="party-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="party-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Game Settings</h3>
            <div className="party-form-group">
              <label className="party-label" htmlFor="round-count">Number of Rounds</label>
              <input
                id="round-count"
                className="party-input party-input--outlined"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={roundsDraft}
                onChange={(e) => setRoundsDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onBlur={() => setRoundsDraft(String(normalizeRounds(roundsDraft)))}
              />
            </div>
            <div className="party-form-group">
              <label className="party-label" htmlFor="round-time">Time per Round (seconds)</label>
              <input
                id="round-time"
                className="party-input party-input--outlined"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={roundTimeDraft}
                onChange={(e) => {
                  setSettingsError(null);
                  setHostError(null);
                  setRoundTimeDraft(e.target.value.replace(/\D/g, ''));
                }}
              />
            </div>
            {settingsError && <p className="party-error">{settingsError}</p>}
            <button
              className="party-action-btn ui-button ui-button--primary ui-button--md"
              onClick={() => {
                setRoundsDraft(String(normalizeRounds(roundsDraft)));
                const roundTimeSeconds = validateRoundTime();

                if (roundTimeSeconds === null) {
                  setSettingsError('Time too short');
                  return;
                }

                setRoundTimeDraft(String(roundTimeSeconds));
                setSettingsError(null);
                setShowSettings(false);
              }}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HostLive({ joinCode, navigate }: { joinCode: string; navigate: (path: string) => void }) {
  const { getToken } = useAuth();
  const { data, progress, loading, error, refresh, serverTimeOffsetMs } = usePartySession(joinCode, 'host');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const countdownRefreshKeyRef = useRef<string | null>(null);
  const session = data?.session;
  const joinUrl = useMemo(() => buildPartyJoinUrl(joinCode), [joinCode]);
  const isLastRound = Boolean(session && session.currentRoundIndex + 1 >= session.roundsCount);
  const isRoundLoading = session?.status === 'round_loading';
  const isRoundCountdown = session?.status === 'round_countdown';
  const countdownSecondsRemaining = usePartyRoundCountdown(
    isRoundCountdown,
    session?.roundStartsAt,
    serverTimeOffsetMs,
    session?.secondsRemaining ?? 0
  );
  const isCountdownBlocking = isRoundCountdown && countdownSecondsRemaining > 0;
  const isRoundInteractive = session?.status === 'round_active' || (isRoundCountdown && countdownSecondsRemaining === 0);
  const roundTimerSecondsRemaining = usePartyRoundTimer(
    isRoundInteractive,
    session?.roundStartsAt,
    session?.roundTimeSeconds ?? 0,
    serverTimeOffsetMs,
    session?.secondsRemaining ?? 0
  );
  const cumulativeStandings = session ? buildCumulativeStandings(session.players) : [];
  const activeProgressPlayers =
    progress?.players ||
    session?.players.map((player) => ({
      displayName: player.displayName,
      isConnected: player.isConnected,
      isReadyForCurrentRound: false,
      hasSubmittedCurrentRound: false,
    })) ||
    [];
  const readyCount = progress?.readyCount ?? session?.readyCount ?? 0;
  const readyTarget = progress?.readyTarget ?? session?.readyTarget ?? session?.players.length ?? 0;
  const submittedCount =
    progress?.submittedCount ?? activeProgressPlayers.filter((player) => player.hasSubmittedCurrentRound).length;
  const totalPlayers = progress?.totalPlayers ?? session?.players.length ?? 0;

  useEffect(() => {
    if (session?.status !== 'round_result') {
      setShowImageViewer(false);
      setIsAdvancing(false);
    }
  }, [session?.status]);

  useEffect(() => {
    if (!isRoundCountdown) {
      countdownRefreshKeyRef.current = null;
      return;
    }

    if (!isRoundCountdown || countdownSecondsRemaining > 0) {
      return;
    }

    const refreshKey = `${joinCode}:${session?.currentRoundIndex ?? 0}`;
    if (countdownRefreshKeyRef.current === refreshKey) {
      return;
    }

    countdownRefreshKeyRef.current = refreshKey;
    void refresh();
  }, [countdownSecondsRemaining, isRoundCountdown, joinCode, refresh, session?.currentRoundIndex]);

  const handleStart = async () => {
    try {
      setActionError(null);
      const token = await getToken();
      await startParty(joinCode, token);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start party');
    }
  };

  const handleAdvance = async () => {
    try {
      setActionError(null);
      setIsAdvancing(true);
      const token = await getToken();
      await advanceParty(joinCode, token);
      setShowImageViewer(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to continue party');
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleHome = async () => {
    if (!session || session.status === 'finished' || session.status === 'ended') {
      navigate('/');
      return;
    }

    if (!window.confirm('Are you sure you want to end the party for everyone?')) {
      return;
    }

    try {
      setActionError(null);
      setIsEnding(true);
      const token = await getToken();
      await endParty(joinCode, token);
      navigate('/');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to end party');
      setIsEnding(false);
    }
  };

  if (loading && !session) {
    return <div className="party-shell"><div className="party-card">Loading party...</div></div>;
  }

  if (error || !session) {
    return <div className="party-shell"><div className="party-card party-error">{error || 'Party not found.'}</div></div>;
  }

  return (
    <div className="party-shell party-shell--game">
      <div className="party-header">
        <button className="party-back ui-button ui-button--dark ui-button--sm" onClick={handleHome} disabled={isEnding} type="button">
          {isEnding ? 'Ending...' : 'Home'}
        </button>
        <h1 className="party-title ui-hero-title">Party <span>Mode</span></h1>
      </div>
      {actionError && <p className="party-error">{actionError}</p>}

      {session.status === 'lobby' && (
        <div className="party-card party-card--lobby">
          <div className="party-lobby-code-row">
            <div className="party-code" aria-label={`Party code ${session.joinCode}`}>
              <span className="party-code__label">Join Code</span>
              <span className="party-code__value">{session.joinCode}</span>
            </div>
            <PartyJoinQrCode joinCode={session.joinCode} joinUrl={joinUrl} />
          </div>
          <p className="party-helper-copy">
            {session.players.length} player{session.players.length === 1 ? '' : 's'} in the room
          </p>
          <div className="party-pill-row">
            {session.players.map((player) => (
              <PartyPill
                key={player.displayName}
                displayName={player.displayName}
                avatar={player.avatar ?? null}
              />
            ))}
          </div>
          <button className="party-primary ui-button ui-button--light ui-button--md" onClick={handleStart} type="button">Start Game</button>
        </div>
      )}

      {(session.status === 'round_loading' || session.status === 'round_countdown' || session.status === 'round_active') && session.hostRound && (
        <div className="party-host-stage">
          <div className="party-hud">
            <div>
              {isRoundLoading
                ? `Round ${session.currentRoundIndex + 1} loading`
                : isCountdownBlocking
                ? `Round ${session.currentRoundIndex + 1} starts soon`
                : `Round ${session.currentRoundIndex + 1} / ${session.roundsCount}`}
            </div>
            {isRoundLoading ? (
              <div className="party-ready-chip">{readyCount} / {readyTarget} ready</div>
            ) : (
              <Timer
                timeRemaining={isCountdownBlocking ? countdownSecondsRemaining : roundTimerSecondsRemaining}
                isActive={true}
                durationSeconds={isCountdownBlocking ? PARTY_ROUND_COUNTDOWN_SECONDS : session.roundTimeSeconds}
              />
            )}
          </div>
          <div className="party-panorama-spin">
            <PanoramaViewer photoUrl={session.hostRound.photoUrl} autoRotateDegreesPerSecond={18} />
            {isRoundLoading ? (
              <PartyRoundLoadingOverlay
                roundNumber={session.currentRoundIndex + 1}
                roundsCount={session.roundsCount}
                readyCount={readyCount}
                readyTarget={readyTarget}
              />
            ) : isCountdownBlocking ? (
              <PartyRoundCountdownOverlay
                roundNumber={session.currentRoundIndex + 1}
                roundsCount={session.roundsCount}
                secondsRemaining={countdownSecondsRemaining}
              />
            ) : null}
          </div>
          <div className="party-card party-card--progress">
            <div className="party-progress-summary">
              <h2>
                {isRoundLoading
                  ? `${readyCount} / ${readyTarget} ready`
                  : isCountdownBlocking
                    ? `Round ${session.currentRoundIndex + 1} starts in ${countdownSecondsRemaining}s`
                    : `${submittedCount} / ${totalPlayers} submitted`}
              </h2>
              <p>
                {isRoundLoading
                  ? 'Waiting for every player map to finish loading before the shared countdown begins.'
                  : isCountdownBlocking
                  ? 'Everyone is loading into the round now so the map and timer feel synchronized.'
                  : 'Player progress updates live while the round is active.'}
              </p>
            </div>
            <div className="party-progress-list">
              {activeProgressPlayers.map((player) => (
                <div className="party-progress-row" key={player.displayName}>
                  <div className="party-progress-row__identity">
                    <strong>{player.displayName}</strong>
                    <span>{player.isConnected ? 'Connected' : 'Away'}</span>
                  </div>
                  <span
                    className={`party-progress-badge ${
                      (isRoundLoading || isCountdownBlocking)
                        ? player.isReadyForCurrentRound
                          ? 'party-progress-badge--done'
                          : 'party-progress-badge--pending'
                        : player.hasSubmittedCurrentRound
                        ? 'party-progress-badge--done'
                        : 'party-progress-badge--pending'
                    }`}
                  >
                    {isRoundLoading || isCountdownBlocking
                      ? player.isReadyForCurrentRound
                        ? 'Ready'
                        : 'Loading'
                      : player.hasSubmittedCurrentRound
                        ? 'Submitted'
                        : 'Waiting'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {session.status === 'round_result' && (
        <div className="party-host-stage">
          <div className="party-card party-card--result party-card--round-summary">
            <h2>Round {session.currentRoundIndex + 1} Complete</h2>
            <div className="party-host-actions">
              {session.hostRound && (
                <button className="party-secondary ui-button ui-button--glass ui-button--md" onClick={() => setShowImageViewer(true)} type="button">
                  Look at Image
                </button>
              )}
              <button className="party-primary ui-button ui-button--light ui-button--md" onClick={handleAdvance} disabled={isAdvancing} type="button">
                {isAdvancing ? 'Loading...' : isLastRound ? 'Show Final Results' : 'Next Round'}
              </button>
            </div>
          </div>
          <PartyLeaderboard title="Current Standings" entries={cumulativeStandings} />
        </div>
      )}

      {session.status === 'finished' && (
        <PartyFinalStandings
          title="Final Podium"
          entries={session.finalStandings || []}
          players={session.players}
        />
      )}

      {session.status === 'ended' && (
        <div className="party-card party-card--result">
          <h2>Party Ended</h2>
          <p>This party has been ended by the host.</p>
          <button className="party-back-inline ui-button ui-button--dark ui-button--sm" onClick={() => navigate('/party')} type="button">Back to Party Home</button>
        </div>
      )}

      {session.status === 'finalizing' && (
        <div className="party-card party-card--result">
          <h2>Finalizing round...</h2>
          <p>Scores are being calculated right now.</p>
        </div>
      )}

      {showImageViewer && session.hostRound && (
        <div className="party-image-overlay" onClick={() => setShowImageViewer(false)}>
          <div className="party-image-modal" onClick={(e) => e.stopPropagation()}>
            <div className="party-image-modal__header">
              <div>
                <h2>{session.hostRound.photoLabel}</h2>
              </div>
              <button className="party-secondary ui-button ui-button--glass ui-button--sm" onClick={() => setShowImageViewer(false)} type="button">
                Close
              </button>
            </div>
            <div className="party-image-modal__viewer">
              <PanoramaViewer photoUrl={session.hostRound.photoUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerLive({ joinCode, navigate }: { joinCode: string; navigate: (path: string) => void }) {
  const { getToken } = useAuth();
  const playerKey = useMemo(() => getPartyPlayerKey(joinCode), [joinCode]);
  const displayName = useMemo(() => getPartyDisplayName(joinCode), [joinCode]);
  const { data, progress, loading, error, refresh, serverTimeOffsetMs } = usePartySession(joinCode, 'player', playerKey);
  const [pendingGuess, setPendingGuess] = useState<[number, number] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMapAssetReady, setIsMapAssetReady] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const countdownRefreshKeyRef = useRef<string | null>(null);
  const roundReadyAckKeyRef = useRef<string | null>(null);
  const roundReadyRequestKeyRef = useRef<string | null>(null);
  const session = data?.session;
  const playerRoundResult = session?.self ?? null;
  const playerIsReadyForCurrentRound = Boolean(
    progress?.playerIsReadyForCurrentRound ?? session?.playerIsReadyForCurrentRound
  );
  const hasSubmittedGuess = submitted || Boolean(progress?.playerHasSubmittedCurrentRound ?? session?.playerHasSubmittedCurrentRound);
  const isRoundLoading = session?.status === 'round_loading';
  const isRoundCountdown = session?.status === 'round_countdown';
  const countdownFallbackSeconds = session?.secondsRemaining ?? 0;
  const countdownSecondsRemaining = usePartyRoundCountdown(
    isRoundCountdown,
    session?.roundStartsAt,
    serverTimeOffsetMs,
    countdownFallbackSeconds
  );
  const isCountdownBlocking = isRoundCountdown && countdownSecondsRemaining > 0;
  const isRoundInteractive = session?.status === 'round_active' || (isRoundCountdown && countdownSecondsRemaining === 0);
  const isRoundPreOpen = isRoundLoading || isCountdownBlocking;
  const roundTimerSecondsRemaining = usePartyRoundTimer(
    isRoundInteractive,
    session?.roundStartsAt,
    session?.roundTimeSeconds ?? 0,
    serverTimeOffsetMs,
    session?.secondsRemaining ?? session?.roundTimeSeconds ?? 0
  );
  const readyCount = progress?.readyCount ?? session?.readyCount ?? 0;
  const readyTarget = progress?.readyTarget ?? session?.readyTarget ?? session?.players.length ?? 0;

  useEffect(() => {
    setIsMapAssetReady(false);
    roundReadyAckKeyRef.current = null;
    roundReadyRequestKeyRef.current = null;
  }, [session?.currentRoundIndex]);

  useEffect(() => {
    setPendingGuess(null);
    setSubmitted(false);
    setIsSubmitting(false);
    setSubmitError(null);
  }, [session?.currentRoundIndex, session?.status]);

  useEffect(() => {
    if (session?.status !== 'ended') {
      return;
    }

    const timeout = window.setTimeout(() => navigate('/party'), 2500);
    return () => window.clearTimeout(timeout);
  }, [navigate, session?.status]);

  useEffect(() => {
    if (!isRoundCountdown) {
      countdownRefreshKeyRef.current = null;
      return;
    }

    if (!isRoundCountdown || countdownSecondsRemaining > 0) {
      return;
    }

    const refreshKey = `${joinCode}:${session?.currentRoundIndex ?? 0}`;
    if (countdownRefreshKeyRef.current === refreshKey) {
      return;
    }

    countdownRefreshKeyRef.current = refreshKey;
    void refresh();
  }, [countdownSecondsRemaining, isRoundCountdown, joinCode, refresh, session?.currentRoundIndex]);

  useEffect(() => {
    if (!session || !playerKey || !isMapAssetReady || !isRoundLoading || playerIsReadyForCurrentRound) {
      return;
    }

    const readyKey = `${joinCode}:${session.currentRoundIndex}`;
    if (roundReadyAckKeyRef.current === readyKey || roundReadyRequestKeyRef.current === readyKey) {
      return;
    }

    let cancelled = false;
    roundReadyRequestKeyRef.current = readyKey;

    void (async () => {
      try {
        const token = await getToken();
        await markPartyRoundReady(joinCode, playerKey, token);

        if (cancelled) {
          return;
        }

        roundReadyAckKeyRef.current = readyKey;
        void refresh();
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to mark party round ready.', error);
        }
      } finally {
        if (roundReadyRequestKeyRef.current === readyKey) {
          roundReadyRequestKeyRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    getToken,
    isMapAssetReady,
    isRoundLoading,
    joinCode,
    playerIsReadyForCurrentRound,
    playerKey,
    refresh,
    session?.currentRoundIndex,
  ]);

  const handleSubmit = async () => {
    if (!pendingGuess || hasSubmittedGuess || isSubmitting) {
      return;
    }

    try {
      setSubmitted(true);
      setIsSubmitting(true);
      setSubmitError(null);
      const token = await getToken();
      await submitPartyGuess(joinCode, pendingGuess, playerKey, token);
    } catch (err) {
      setSubmitted(false);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit guess');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && !session) {
    return <div className="party-shell"><div className="party-card">Loading party...</div></div>;
  }

  if (error || !session) {
    return (
      <div className="party-shell">
        <div className="party-card party-error">
          {error || 'Party not found.'}
          <button className="party-back-inline ui-button ui-button--dark ui-button--sm" onClick={() => navigate('/party')} type="button">Back to Join</button>
        </div>
      </div>
    );
  }

  return (
    <div className="party-shell party-shell--game">
      <div className="party-header">
        <button className="party-back ui-button ui-button--dark ui-button--sm" onClick={() => navigate('/')} type="button">Home</button>
        <h1 className="party-title ui-hero-title">Party <span>Mode</span></h1>
      </div>

      {session.status === 'lobby' && (
        <div className="party-card party-card--waiting">
          <h2>You are in as {displayName || 'player'}</h2>
          <p className="party-helper-copy">Party code {session.joinCode}</p>
          <p>Please wait for host to start game.</p>
        </div>
      )}

      {(session.status === 'round_loading' || session.status === 'round_countdown' || session.status === 'round_active') && (
        <div className="party-player-stage">
          <div className="party-hud">
            <div>
              {isRoundLoading
                ? `Round ${session.currentRoundIndex + 1} loading`
                : isCountdownBlocking
                ? `Round ${session.currentRoundIndex + 1} starts soon`
                : `Round ${session.currentRoundIndex + 1} / ${session.roundsCount}`}
            </div>
            {isRoundLoading ? (
              <div className="party-ready-chip">{readyCount} / {readyTarget} ready</div>
            ) : (
              <Timer
                timeRemaining={isCountdownBlocking ? countdownSecondsRemaining : roundTimerSecondsRemaining}
                isActive={true}
                durationSeconds={isCountdownBlocking ? PARTY_ROUND_COUNTDOWN_SECONDS : session.roundTimeSeconds}
              />
            )}
          </div>
          <div className="party-map-fullscreen">
            <div className={`party-map-stage${isRoundPreOpen ? ' party-map-stage--preloading' : ''}`}>
              <MapGuess
                pendingGuess={pendingGuess}
                onGuess={setPendingGuess}
                onSubmit={handleSubmit}
                onReady={() => setIsMapAssetReady(true)}
                readyToken={session.currentRoundIndex}
                isExpanded={true}
                onToggleExpand={() => undefined}
                showToggleLabel={false}
                canGuess={!isRoundPreOpen && !hasSubmittedGuess && !isSubmitting}
                canSubmit={!isRoundPreOpen && !hasSubmittedGuess && !isSubmitting}
                submitLabel={
                  isRoundLoading
                    ? playerIsReadyForCurrentRound
                      ? 'Waiting for others...'
                      : 'Loading map...'
                    : isCountdownBlocking
                    ? `Round starts in ${countdownSecondsRemaining}s`
                    : isSubmitting
                      ? 'Submitting...'
                      : hasSubmittedGuess
                        ? 'Guess Submitted'
                        : 'Submit Guess'
                }
              />
              {isRoundLoading ? (
                <PartyRoundLoadingOverlay
                  roundNumber={session.currentRoundIndex + 1}
                  roundsCount={session.roundsCount}
                  readyCount={readyCount}
                  readyTarget={readyTarget}
                />
              ) : isCountdownBlocking ? (
                <PartyRoundCountdownOverlay
                  roundNumber={session.currentRoundIndex + 1}
                  roundsCount={session.roundsCount}
                  secondsRemaining={countdownSecondsRemaining}
                />
              ) : null}
            </div>
          </div>
          {!isRoundPreOpen && hasSubmittedGuess && <div className="party-submit-banner">Guess submitted. Waiting for results...</div>}
          {submitError && <p className="party-error">{submitError}</p>}
        </div>
      )}

      {session.status === 'round_result' && (
        session.hostRound && session.hostRound.actualCoords && playerRoundResult ? (
          <div className="party-review-stage">
            <RoundResult
              result={{
                photoLabel: session.hostRound.photoLabel || playerRoundResult.photoLabel || 'Actual location',
                guessCoords: playerRoundResult.guessCoords ?? null,
                actualCoords: session.hostRound.actualCoords,
                distanceKm: playerRoundResult.distanceKm ?? null,
                points: playerRoundResult.roundPoints || 0,
              }}
              roundNumber={session.currentRoundIndex + 1}
              roundsCount={session.roundsCount}
              totalScore={playerRoundResult.totalPoints || 0}
              showAdvanceButton={false}
              footerNote="Waiting for the host to start the next round."
            />
          </div>
        ) : (
          <div className="party-card party-card--result">
            <h2>Round Complete</h2>
            <p>You gained {playerRoundResult?.roundPoints?.toLocaleString() || 0} points.</p>
            <p>Total points: {playerRoundResult?.totalPoints?.toLocaleString() || 0}</p>
            <p>You are currently in place #{playerRoundResult?.totalRank || '-'}</p>
            <p>Waiting for the host to start the next round.</p>
          </div>
        )
      )}

      {session.status === 'finished' && (
        <PartyFinalStandings
          title="Final Results"
          entries={session.finalStandings || []}
          players={session.players}
          summaryItems={[
            {
              label: 'Your score',
              value: `${session.self?.totalPoints?.toLocaleString() || 0} pts`,
            },
            {
              label: 'Placement',
              value: `#${session.self?.totalRank || '-'}`,
            },
          ]}
        />
      )}

      {session.status === 'ended' && (
        <div className="party-card party-card--result">
          <h2>Party Ended</h2>
          <p>The host ended this party. Sending you back to the join screen.</p>
          <button className="party-back-inline ui-button ui-button--dark ui-button--sm" onClick={() => navigate('/party')} type="button">Back to Join</button>
        </div>
      )}

      {session.status === 'finalizing' && (
        <div className="party-card party-card--result">
          <h2>Calculating results...</h2>
          <p>Your round is being scored.</p>
        </div>
      )}
    </div>
  );
}

const PartyMode: React.FC<PartyModeProps> = ({ pathname, navigate }) => {
  const route = parsePartyPath(pathname);

  if (route.type === 'host-live') {
    return <HostLive joinCode={route.joinCode} navigate={navigate} />;
  }

  if (route.type === 'player-live') {
    return <PlayerLive joinCode={route.joinCode} navigate={navigate} />;
  }

  // Handle entry, join, and host-setup as tabs in the Overview
  return (
    <PartyOverview
      navigate={navigate}
      initialTab={route.type === 'host-setup' ? 'create' : 'join'}
    />
  );
};
export default PartyMode;
