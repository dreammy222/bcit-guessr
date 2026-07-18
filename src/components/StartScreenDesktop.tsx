import React from 'react';
import { SignInButton, UserButton } from '@clerk/clerk-react';
import Leaderboard from './Leaderboard';
import DailyChallengeCard from './DailyChallengeCard';
import AvatarPreview from './AvatarPreview';
import InstagramLink from './InstagramLink';
import type { StartScreenLayoutProps } from './StartScreen.types';

const StartScreenDesktop: React.FC<StartScreenLayoutProps> = ({
  avatar,
  coinBalance,
  highscore,
  isAuthLoaded,
  isSignedIn,
  dailyStatus,
  leaderboardEntries,
  leaderboardLoading,
  onOpenCustomize,
  onOpenShop,
  onStart,
  onStartDaily,
  onPartyMode,
}) => {
  const showSignedIn = isAuthLoaded && isSignedIn;
  const showSignedOut = !showSignedIn;
  const showGuestControls = !showSignedIn;

  return (
    <div className="start-screen-desktop">
      {showSignedIn && (
        <>
        <div className="start-screen__top-left">
          <div className="start-screen__top-left-actions">
            {coinBalance !== null && (
              <div className="start-screen__coin-pill ui-badge" aria-label={`Coins: ${coinBalance.toLocaleString()}`}>
                <img alt="" className="start-screen__coin-icon" decoding="async" src="/coins.png" />
                <span className="start-screen__coin-value">{coinBalance.toLocaleString()}</span>
              </div>
            )}
            <button
              className="start-screen__shop-button ui-button"
              onClick={onOpenShop}
              type="button"
            >
              <span aria-hidden="true" className="start-screen__shop-icon">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M3 5.25h2.05l1.35 8.12a1 1 0 0 0 .99.83h8.96a1 1 0 0 0 .96-.73l1.56-5.47H7.56"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <circle cx="10" cy="18.2" r="1.45" fill="currentColor" />
                  <circle cx="16.8" cy="18.2" r="1.45" fill="currentColor" />
                </svg>
              </span>
              <span>Shop</span>
            </button>
          </div>
        </div>
        <div className="start-screen-desktop__top-right">
          {highscore !== null && (
            <div className="start-screen-desktop__highscore ui-badge">
              Highscore: {highscore.toLocaleString()}
            </div>
          )}
          <div className="start-screen-desktop__user-profile">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        </>
      )}
      {showSignedOut && (
        <div className="start-screen-desktop__top-right">
          <SignInButton mode="modal" fallbackRedirectUrl={undefined} forceRedirectUrl={undefined}>
            <button
              className="start-screen__top-sign-in ui-button ui-button--dark ui-button--sm"
              disabled={!isAuthLoaded}
              id="sign-in-btn"
              type="button"
            >
              {isAuthLoaded ? 'Sign In' : 'Loading...'}
            </button>
          </SignInButton>
        </div>
      )}

      <div className="start-screen-desktop__shell">
        <div className="start-screen-desktop__avatar-wrapper">
          <div className="start-screen__avatar-card">
            <div className="start-screen__avatar-stage">
              <AvatarPreview avatar={avatar} size="lg" />
            </div>
            {showSignedIn && (
              <button
                className="start-screen__avatar-action ui-button ui-button--primary ui-button--md"
                onClick={onOpenCustomize}
                type="button"
              >
                Customize
              </button>
            )}
            {!showSignedIn && (
              <p className="start-screen__avatar-note">sign in to customize avatar</p>
            )}
          </div>
        </div>

        <div className="start-screen-desktop__content">
          <div className="start-screen-desktop__title-block">
            <h1 className="start-screen-desktop__title ui-hero-title">
              <em>UBC</em>
              <span>Guessr</span>
            </h1>
            <p className="start-screen-desktop__subtitle">Know Your Campus</p>
          </div>

          <div className="start-screen-desktop__auth-group">
            {showGuestControls && (
              <>
              <button
                className="start-screen-desktop__cta ui-button ui-button--primary ui-button--lg"
                onClick={onStart}
                id="start-game-btn"
                type="button"
              >
                Play as Guest
              </button>
              <span className="start-screen-desktop__or-text">or</span>
              <button
                className="start-screen-desktop__cta start-screen-desktop__cta--stacked ui-button ui-button--dark ui-button--md"
                onClick={onPartyMode}
                id="party-mode-btn"
                type="button"
              >
                <span className="start-screen-desktop__cta-stack">
                  <span>Party Mode</span>
                  <span className="start-screen-desktop__cta-meta">(beta)</span>
                </span>
              </button>
              </>
            )}

            {showSignedIn && (
              <>
              <button
                className="start-screen-desktop__cta ui-button ui-button--primary ui-button--lg"
                onClick={onStart}
                id="start-game-btn"
                type="button"
              >
                Play
              </button>
              <span className="start-screen-desktop__or-text">or</span>
              <button
                className="start-screen-desktop__cta start-screen-desktop__cta--secondary start-screen-desktop__cta--stacked ui-button ui-button--dark ui-button--md"
                onClick={onPartyMode}
                id="party-mode-btn"
                type="button"
              >
                <span className="start-screen-desktop__cta-stack">
                  <span>Party Mode</span>
                  <span className="start-screen-desktop__cta-meta">(beta)</span>
                </span>
              </button>
              </>
            )}
          </div>

          <div className="start-screen-desktop__leaderboard-wrapper">
            <Leaderboard
              embedded={true}
              entries={leaderboardEntries}
              loading={leaderboardLoading}
              disableAutoFetch={true}
            />
          </div>
        </div>

        <div className="start-screen-desktop__daily-wrapper">
          <DailyChallengeCard dailyStatus={dailyStatus} onStartDaily={onStartDaily} />
        </div>
      </div>

      <InstagramLink />
    </div>
  );
};

export default StartScreenDesktop;
