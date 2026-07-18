import React, { useEffect, useState } from 'react';
import { ROUND_TIMER_SECONDS } from '../utils/scoring';
import './Timer.css';

interface TimerProps {
  timeRemaining: number;
  isActive: boolean;
  variant?: 'default' | 'hud-pill';
  durationSeconds?: number;
}

const HUD_PILL_PATH = 'M 110 3 H 192 A 25 25 0 0 1 192 53 H 28 A 25 25 0 0 1 28 3 H 110';

const Timer: React.FC<TimerProps> = ({
  timeRemaining,
  isActive,
  variant = 'default',
  durationSeconds = ROUND_TIMER_SECONDS,
}) => {
  const [prevTime, setPrevTime] = useState(timeRemaining);
  const [flash, setFlash] = useState(false);
  const isResetting = timeRemaining > prevTime;

  useEffect(() => {
    if (timeRemaining !== prevTime) {
      setPrevTime(timeRemaining);
      if (timeRemaining < prevTime && timeRemaining <= 10 && timeRemaining > 0) {
        setFlash(true);
        setTimeout(() => setFlash(false), 300);
      }
    }
  }, [timeRemaining, prevTime]);

  const pct = (timeRemaining / durationSeconds) * 100;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const isUrgent = timeRemaining <= 10;
  const isCritical = timeRemaining <= 5;

  const barColor = isCritical
    ? 'var(--color-danger)'
    : isUrgent
    ? 'var(--color-warning)'
    : 'var(--color-gold)';
  const shouldAnimateProgress =
    isActive &&
    !isResetting &&
    timeRemaining < durationSeconds;

  const timerClassName = `timer timer--${variant} ${isUrgent ? 'timer--urgent' : ''} ${flash ? 'timer--flash' : ''}`;
  const countClassName = `timer__count ${isUrgent ? 'timer__count--urgent' : ''} ${isCritical ? 'timer__count--critical' : ''}`;
  const hudProgressStyle = {
    stroke: barColor,
    strokeDasharray: `${clampedPct} 100`,
    transition: shouldAnimateProgress ? 'stroke-dasharray 1s linear, stroke 0.3s ease' : 'none',
  } as React.CSSProperties;

  if (variant === 'hud-pill') {
    return (
      <div className={timerClassName}>
        <svg
          className="timer__pill-outline"
          viewBox="0 0 220 56"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="timer__pill-track"
            d={HUD_PILL_PATH}
            pathLength={100}
          />
          <path
            className="timer__pill-progress"
            d={HUD_PILL_PATH}
            pathLength={100}
            style={hudProgressStyle}
          />
        </svg>
        <div className="timer__pill-body">
          <span className={countClassName}>
            {timeRemaining}s
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={timerClassName}>
      <div className="timer__header">
        <span className={countClassName}>
          {timeRemaining}s
        </span>
      </div>
      <div className="timer__bar-track">
        <div
          className="timer__bar-fill"
          style={{
            width: `${clampedPct}%`,
            backgroundColor: barColor,
            transition: shouldAnimateProgress ? 'width 1s linear, background-color 0.3s ease' : 'none',
          }}
        />
      </div>
    </div>
  );
};

export default Timer;
