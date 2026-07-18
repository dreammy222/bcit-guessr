import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import type { DailyChallengeStatusPayload } from '../daily/types';

interface DailyChallengeCardProps {
  dailyStatus: DailyChallengeStatusPayload | null;
  onStartDaily: () => void;
}

function formatCountdown(refreshAt: number, now: number) {
  const remainingMs = Math.max(0, refreshAt - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

const DailyChallengeCard: React.FC<DailyChallengeCardProps> = ({ dailyStatus, onStartDaily }) => {
  const { isSignedIn } = useUser();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const countdown = dailyStatus ? formatCountdown(dailyStatus.refreshAt, now) : '--:--:--';
  const isResume = dailyStatus?.state === 'in_progress';
  const isUnavailable = dailyStatus?.state === 'unavailable';
  const isPlayed = dailyStatus?.state === 'played';
  const requiresAuth = !isSignedIn;
  const actionLabel = isResume ? 'Resume' : isPlayed ? 'Played Today' : requiresAuth ? 'Sign In' : 'Start!';

  return (
    <section className="daily-challenge-card ui-card">
      <div className="daily-challenge-card__eyebrow">One Photo. One Minute.</div>
      <h2 className="daily-challenge-card__title">Daily Challenge</h2>
      <p className="daily-challenge-card__countdown">Refresh in {countdown}</p>

      {requiresAuth ? (
        <div className="daily-challenge-card__locked-copy" role="note">
          <svg
            aria-hidden="true"
            className="daily-challenge-card__lock-icon"
            viewBox="0 0 24 24"
          >
            <path
              d="M8 10V7a4 4 0 1 1 8 0v3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1zm2 0h4V7a2 2 0 1 0-4 0v3z"
              fill="currentColor"
            />
          </svg>
          <span>Sign in to play</span>
        </div>
      ) : (
        <button
          className={`daily-challenge-card__button ui-button ui-button--primary ui-button--md${isPlayed ? ' daily-challenge-card__button--played' : ''}`}
          type="button"
          onClick={onStartDaily}
          disabled={isPlayed || isUnavailable}
        >
          {isUnavailable ? 'Unavailable' : actionLabel}
        </button>
      )}

      <p className="daily-challenge-card__description">
        {isPlayed
          ? "You've already played today's daily challenge."
          : 'Play daily challenge to collect coins for avatar cosmetics!'}
      </p>
    </section>
  );
};

export default DailyChallengeCard;
