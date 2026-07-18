import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LOGO, SCHOOL } from '../config/school';
import { SignInButton, UserButton } from '@clerk/clerk-react';
import Leaderboard from './Leaderboard';
import DailyChallengeCard from './DailyChallengeCard';
import AvatarPreview from './AvatarPreview';
import InstagramLink from './InstagramLink';
import type { StartScreenLayoutProps } from './StartScreen.types';

const StartScreenMobile: React.FC<StartScreenLayoutProps> = ({
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
  const [activeTab, setActiveTab] = useState(1); // 0: Shop, 1: Play, 2: Leaderboard
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const showSignedIn = isAuthLoaded && isSignedIn;
  const showSignedOut = !showSignedIn;
  const showGuestControls = !showSignedIn;

  // Synchronize the bottom nav with the scroll position
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isScrollingRef.current) return;

    const { scrollLeft, offsetWidth } = scrollContainerRef.current;
    if (offsetWidth === 0) return;

    const newTab = Math.round(scrollLeft / offsetWidth);
    if (newTab !== activeTab && newTab >= 0 && newTab <= 2) {
      setActiveTab(newTab);
    }
  }, [activeTab]);

  // Programmatically scroll when a nav button is clicked
  const scrollToTab = (tabIndex: number) => {
    if (!scrollContainerRef.current) return;
    
    isScrollingRef.current = true;
    setActiveTab(tabIndex);
    
    const targetX = tabIndex * scrollContainerRef.current.offsetWidth;
    scrollContainerRef.current.scrollTo({
      left: targetX,
      behavior: 'smooth'
    });

    // Reset the scrolling flag after the animation completes
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 500);
  };

  // Start on the Play pane (index 1) on load
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetX = 1 * scrollContainerRef.current.offsetWidth;
      scrollContainerRef.current.scrollLeft = targetX;
    }
  }, []);

  return (
    <div className="start-screen-mobile">
      <div 
        className="start-screen-mobile__viewport"
        onScroll={handleScroll}
        ref={scrollContainerRef}
      >
        <div className="start-screen-mobile__panes">
          {/* Pane 0: Shop */}
          <div className="start-screen-mobile__pane start-screen-mobile__pane--shop">
            {showSignedIn && (
              <div className="start-screen-mobile__shop-bar">
                {coinBalance !== null && (
                  <div className="start-screen__coin-pill ui-badge" aria-label={`Coins: ${coinBalance.toLocaleString()}`}>
                    <img alt="" className="start-screen__coin-icon" decoding="async" src="/coins.png" />
                    <span className="start-screen__coin-value">{coinBalance.toLocaleString()}</span>
                  </div>
                )}
                <button
                  className="start-screen__shop-button start-screen-mobile__shop-trigger ui-button"
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
            )}

            <div className="start-screen-mobile__pane-content">
              <div className="start-screen-mobile__avatar-wrapper">
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

              {showSignedOut && (
                <div className="start-screen-mobile__auth-prompt">
                  <p>Sign in to visit the shop and customize your avatar!</p>
                  <SignInButton mode="modal">
                    <button className="ui-button ui-button--primary ui-button--md" disabled={!isAuthLoaded} type="button">
                      {isAuthLoaded ? 'Sign In' : 'Loading...'}
                    </button>
                  </SignInButton>
                </div>
              )}
            </div>
          </div>

          {/* Pane 1: Play (Default) */}
          <div className="start-screen-mobile__pane start-screen-mobile__pane--play">
            {showSignedIn && (
              <div className="start-screen-mobile__top-bar">
                {highscore !== null && (
                  <div className="start-screen-desktop__highscore ui-badge">
                    Highscore: {highscore.toLocaleString()}
                  </div>
                )}
                <div className="start-screen-mobile__user-profile">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </div>
            )}
            {showSignedOut && (
              <div className="start-screen-mobile__top-bar">
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

            <div className="start-screen-mobile__pane-content">
              <div className="start-screen-mobile__title-block">
                <h1 className="start-screen-mobile__title ui-hero-title">
                  <em>{LOGO.prefix}</em>
                  <span>{LOGO.suffix}</span>
                </h1>
                <p className="start-screen-mobile__subtitle">{SCHOOL.tagline}</p>
              </div>

              <div className="start-screen-mobile__actions">
                {showSignedIn && (
                  <div className="start-screen-mobile__auth-group">
                    <button
                      className="start-screen-mobile__cta ui-button ui-button--primary ui-button--lg"
                      onClick={onStart}
                      id="start-game-btn"
                      type="button"
                    >
                      Play
                    </button>
                    <span className="start-screen-mobile__or-text">or</span>
                    <button
                      className="start-screen-mobile__cta start-screen-mobile__cta--stacked ui-button ui-button--dark ui-button--md"
                      onClick={onPartyMode}
                      id="party-mode-btn"
                      type="button"
                    >
                      <span className="start-screen-mobile__cta-stack">
                        <span>Party Mode</span>
                        <span className="start-screen-mobile__cta-meta">(beta)</span>
                      </span>
                    </button>
                  </div>
                )}

                {showGuestControls && (
                  <div className="start-screen-mobile__auth-group">
                    <button
                      className="start-screen-mobile__cta ui-button ui-button--primary ui-button--lg"
                      onClick={onStart}
                      id="start-game-btn"
                      type="button"
                    >
                      Play as Guest
                    </button>
                    <span className="start-screen-mobile__or-text">or</span>
                    <button
                      className="start-screen-mobile__cta start-screen-mobile__cta--stacked ui-button ui-button--dark ui-button--md"
                      onClick={onPartyMode}
                      id="party-mode-btn"
                      type="button"
                    >
                      <span className="start-screen-mobile__cta-stack">
                        <span>Party Mode</span>
                        <span className="start-screen-mobile__cta-meta">(beta)</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="start-screen-mobile__daily-social">
                <DailyChallengeCard dailyStatus={dailyStatus} onStartDaily={onStartDaily} />
                <InstagramLink isMobile={true} />
              </div>
            </div>
          </div>

          {/* Pane 2: Leaderboard */}
          <div className="start-screen-mobile__pane start-screen-mobile__pane--leaderboard">
            <div className="start-screen-mobile__pane-content">
              <div className="start-screen-mobile__leaderboard-wrapper">
                <Leaderboard
                  embedded={true}
                  entries={leaderboardEntries}
                  loading={leaderboardLoading}
                  disableAutoFetch={true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav className="mobile-nav-bar">
        <button
          className={`mobile-nav-bar__item ${activeTab === 0 ? 'mobile-nav-bar__item--active' : ''}`}
          onClick={() => scrollToTab(0)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M3 5.25h2.05l1.35 8.12a1 1 0 0 0 .99.83h8.96a1 1 0 0 0 .96-.73l1.56-5.47H7.56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            <circle cx="10" cy="18.2" r="1.45" fill="currentColor" />
            <circle cx="16.8" cy="18.2" r="1.45" fill="currentColor" />
          </svg>
          <span>Shop</span>
        </button>
        <button
          className={`mobile-nav-bar__item ${activeTab === 1 ? 'mobile-nav-bar__item--active' : ''}`}
          onClick={() => scrollToTab(1)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
          <span>Play</span>
        </button>
        <button
          className={`mobile-nav-bar__item mobile-nav-bar__item--leaderboard ${activeTab === 2 ? 'mobile-nav-bar__item--active' : ''}`}
          onClick={() => scrollToTab(2)}
        >
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M9 4.5h2.7l1.3 3.8h-2.7z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
            <path
              d="M12.3 4.5H15l-1.3 3.8H11z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
            <path
              d="M12 10.2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 0 1 0-9.6z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
            <path
              d="M12 12.2l.9 1.8l2 .3l-1.4 1.4l.3 2l-1.8-.9l-1.8.9l.3-2l-1.4-1.4l2-.3z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
          </svg>
          <span>Leaderboard</span>
        </button>
      </nav>
    </div>
  );
};

export default StartScreenMobile;
