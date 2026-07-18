import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import StartScreenDesktop from './StartScreenDesktop';
import StartScreenMobile from './StartScreenMobile';
import type { DailyChallengeStatusPayload } from '../daily/types';
import type { AvatarModalTab, LeaderboardEntry } from './StartScreen.types';
import {
  createEmptyAvatarState,
  type AccountAvatarPayload,
  type AvatarState,
  type CosmeticSlot,
} from '../data/cosmetics';
import { isAvatarState, writeCachedAvatar } from '../utils/avatarCache';
import './StartScreen.css';

interface StartScreenProps {
  onStart: () => void;
  onStartDaily: () => void;
  onPartyMode: () => void;
}

const MOBILE_LAYOUT_QUERY = '(max-width: 767px)';
const AvatarShopModal = React.lazy(() => import('./AvatarShopModal'));

const getInitialIsMobileLayout = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
};

interface PromoRedeemResult {
  success: boolean;
  message: string;
}

function parseAccountAvatarPayload(value: unknown): AccountAvatarPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as {
    coinBalance?: unknown;
    avatar?: unknown;
    ownedCosmeticIds?: unknown;
  };

  if (typeof payload.coinBalance !== 'number' || !isAvatarState(payload.avatar) || !Array.isArray(payload.ownedCosmeticIds)) {
    return null;
  }

  const ownedCosmeticIds = payload.ownedCosmeticIds.filter((entry): entry is string => typeof entry === 'string');

  return {
    coinBalance: payload.coinBalance,
    avatar: payload.avatar,
    ownedCosmeticIds,
  };
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart, onStartDaily, onPartyMode }) => {
  const [highscore, setHighscore] = useState<number | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [avatar, setAvatar] = useState<AvatarState | null>(null);
  const [ownedCosmeticIds, setOwnedCosmeticIds] = useState<string[] | null>(null);
  const [dailyStatus, setDailyStatus] = useState<DailyChallengeStatusPayload | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [isMobileLayout, setIsMobileLayout] = useState(getInitialIsMobileLayout);
  const [avatarModalTab, setAvatarModalTab] = useState<AvatarModalTab>('shop');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingAvatarActionKey, setPendingAvatarActionKey] = useState<string | null>(null);
  const bootstrapRequestId = useRef(0);

  const { isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();

  const applyAccountSnapshot = useCallback((value: unknown) => {
    const snapshot = parseAccountAvatarPayload(value);
    if (!snapshot) {
      return false;
    }

    setCoinBalance(snapshot.coinBalance);
    setAvatar(snapshot.avatar);
    setOwnedCosmeticIds(snapshot.ownedCosmeticIds);
    return true;
  }, []);

  useEffect(() => {
    const requestId = bootstrapRequestId.current + 1;
    bootstrapRequestId.current = requestId;

    const fetchBootstrap = async () => {
      setLeaderboardLoading(true);

      try {
        const token = isLoaded && isSignedIn ? await getToken() : null;
        const res = await fetch('/api/bootstrap', {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
        });

        if (!res.ok) {
          throw new Error('Failed to load start screen data');
        }

        const data = await res.json() as {
          avatar?: unknown;
          coinBalance?: unknown;
          dailyStatus?: unknown;
          highscore?: unknown;
          leaderboard?: unknown;
          ownedCosmeticIds?: unknown;
        };

        if (requestId !== bootstrapRequestId.current) {
          return;
        }

        setDailyStatus(data.dailyStatus as DailyChallengeStatusPayload | null);
        setHighscore(typeof data.highscore === 'number' ? data.highscore : null);

        const accountSnapshot = parseAccountAvatarPayload({
          coinBalance: data.coinBalance,
          avatar: data.avatar,
          ownedCosmeticIds: data.ownedCosmeticIds,
        });

        if (accountSnapshot) {
          setCoinBalance(accountSnapshot.coinBalance);
          setAvatar(accountSnapshot.avatar);
          setOwnedCosmeticIds(accountSnapshot.ownedCosmeticIds);
        } else {
          setCoinBalance(null);
          setAvatar(isSignedIn ? createEmptyAvatarState() : null);
          setOwnedCosmeticIds(isSignedIn ? [] : null);
        }

        setLeaderboardEntries(
          Array.isArray(data.leaderboard)
            ? data.leaderboard.filter(
                (entry): entry is LeaderboardEntry =>
                  Boolean(entry) &&
                  typeof entry === 'object' &&
                  typeof (entry as LeaderboardEntry).username === 'string' &&
                  typeof (entry as LeaderboardEntry).score === 'number'
              )
            : []
        );
      } catch (err) {
        if (requestId !== bootstrapRequestId.current) {
          return;
        }

        console.error('Failed to load start screen data', err);
        setDailyStatus(null);
        setHighscore(null);
        setCoinBalance(null);
        setAvatar(isSignedIn ? createEmptyAvatarState() : null);
        setOwnedCosmeticIds(isSignedIn ? [] : null);
        setLeaderboardEntries([]);
      } finally {
        if (requestId === bootstrapRequestId.current) {
          setLeaderboardLoading(false);
        }
      }
    };

    void fetchBootstrap();
  }, [applyAccountSnapshot, getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const handleLayoutChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleLayoutChange);
      return () => mediaQuery.removeEventListener('change', handleLayoutChange);
    }

    mediaQuery.addListener(handleLayoutChange);
    return () => mediaQuery.removeListener(handleLayoutChange);
  }, []);

  useEffect(() => {
    writeCachedAvatar(avatar);
  }, [avatar]);

  useEffect(() => {
    if (isSignedIn) {
      return;
    }

    setIsAvatarModalOpen(false);
    setAvatarError(null);
    setPendingAvatarActionKey(null);
  }, [isSignedIn]);

  const canManageAvatar = isSignedIn && coinBalance !== null && avatar !== null && ownedCosmeticIds !== null;

  const openAvatarModal = useCallback((tab: AvatarModalTab) => {
    if (!canManageAvatar) {
      return;
    }

    setAvatarError(null);
    setAvatarModalTab(tab);
    setIsAvatarModalOpen(true);
  }, [canManageAvatar]);

  const submitAvatarRequest = useCallback(async (
    endpoint: string,
    body: Record<string, unknown>,
    actionKey: string,
    fallbackError: string,
  ) => {
    try {
      setAvatarError(null);
      setPendingAvatarActionKey(actionKey);

      const token = await getToken();
      if (!token) {
        throw new Error('Missing auth token');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null) as {
        account?: unknown;
        error?: unknown;
      } | null;

      if (!res.ok) {
        if (data?.account) {
          applyAccountSnapshot(data.account);
        }

        setAvatarError(typeof data?.error === 'string' ? data.error : fallbackError);
        return false;
      }

      if (!data?.account || !applyAccountSnapshot(data.account)) {
        setAvatarError(fallbackError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Avatar request failed', error);
      setAvatarError(fallbackError);
      return false;
    } finally {
      setPendingAvatarActionKey(null);
    }
  }, [applyAccountSnapshot, getToken]);

  const handlePurchase = useCallback((cosmeticId: string) => {
    void submitAvatarRequest(
      '/api/avatar/purchase',
      { cosmeticId },
      `purchase:${cosmeticId}`,
      'Failed to purchase cosmetic.',
    );
  }, [submitAvatarRequest]);

  const handleEquip = useCallback((slot: CosmeticSlot, cosmeticId: string | null) => {
    void submitAvatarRequest(
      '/api/avatar/equip',
      { slot, cosmeticId },
      `equip:${slot}:${cosmeticId ?? 'none'}`,
      'Failed to update equipped cosmetic.',
    );
  }, [submitAvatarRequest]);

  const handleRedeemPromo = useCallback(async (promoCode: string): Promise<PromoRedeemResult> => {
    const fallbackError = 'Failed to redeem promo code.';

    try {
      setAvatarError(null);
      setPendingAvatarActionKey('promo:redeem');

      const token = await getToken();
      if (!token) {
        throw new Error('Missing auth token');
      }

      const res = await fetch('/api/avatar/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ promoCode }),
      });

      const data = await res.json().catch(() => null) as {
        account?: unknown;
        awardedCoins?: unknown;
        coinRewardAmount?: unknown;
        error?: unknown;
        grantedCosmeticIds?: unknown;
      } | null;

      if (!res.ok) {
        if (data?.account) {
          applyAccountSnapshot(data.account);
        }

        return {
          success: false,
          message: typeof data?.error === 'string' ? data.error : fallbackError,
        };
      }

      if (!data?.account || !applyAccountSnapshot(data.account)) {
        return {
          success: false,
          message: fallbackError,
        };
      }

      const grantedCosmeticIds = Array.isArray(data.grantedCosmeticIds)
        ? data.grantedCosmeticIds.filter(
            (cosmeticId): cosmeticId is string => typeof cosmeticId === 'string'
          )
        : [];
      const awardedCoins = typeof data.awardedCoins === 'number' && Number.isFinite(data.awardedCoins)
        ? data.awardedCoins
        : 0;
      const coinRewardAmount = typeof data.coinRewardAmount === 'number' && Number.isFinite(data.coinRewardAmount)
        ? data.coinRewardAmount
        : 0;
      let promoMessage = grantedCosmeticIds.length > 0
        ? 'HKSA cap and shirt unlocked.'
        : 'HKSA cap and shirt already unlocked.';

      if (coinRewardAmount > 0) {
        promoMessage = awardedCoins > 0
          ? `${awardedCoins.toLocaleString()} coins added.`
          : `${coinRewardAmount.toLocaleString()} coin promo already redeemed.`;
      }

      return {
        success: true,
        message: promoMessage,
      };
    } catch (error) {
      console.error('Promo code request failed', error);
      return {
        success: false,
        message: fallbackError,
      };
    } finally {
      setPendingAvatarActionKey(null);
    }
  }, [applyAccountSnapshot, getToken]);

  const resolvedAvatar = avatar ?? createEmptyAvatarState();
  const resolvedCoinBalance = coinBalance ?? 0;
  const resolvedOwnedCosmeticIds = ownedCosmeticIds ?? [];

  return (
    <div className="start-screen">
      <div aria-hidden="true" className="start-screen__background" />
      {isMobileLayout ? (
        <StartScreenMobile
          avatar={avatar}
          coinBalance={coinBalance}
          highscore={highscore}
          dailyStatus={dailyStatus}
          leaderboardEntries={leaderboardEntries}
          leaderboardLoading={leaderboardLoading}
          isAuthLoaded={isLoaded}
          isSignedIn={Boolean(isSignedIn)}
          onOpenCustomize={() => openAvatarModal('customize')}
          onOpenShop={() => openAvatarModal('shop')}
          onPartyMode={onPartyMode}
          onStart={onStart}
          onStartDaily={onStartDaily}
        />
      ) : (
        <StartScreenDesktop
          avatar={avatar}
          coinBalance={coinBalance}
          highscore={highscore}
          dailyStatus={dailyStatus}
          leaderboardEntries={leaderboardEntries}
          leaderboardLoading={leaderboardLoading}
          isAuthLoaded={isLoaded}
          isSignedIn={Boolean(isSignedIn)}
          onOpenCustomize={() => openAvatarModal('customize')}
          onOpenShop={() => openAvatarModal('shop')}
          onPartyMode={onPartyMode}
          onStart={onStart}
          onStartDaily={onStartDaily}
        />
      )}

      {isAvatarModalOpen && canManageAvatar && (
        <Suspense fallback={null}>
          <AvatarShopModal
            activeTab={avatarModalTab}
            avatar={resolvedAvatar}
            coinBalance={resolvedCoinBalance}
            errorMessage={avatarError}
            ownedCosmeticIds={resolvedOwnedCosmeticIds}
            pendingActionKey={pendingAvatarActionKey}
            onClose={() => setIsAvatarModalOpen(false)}
            onEquip={handleEquip}
            onPurchase={handlePurchase}
            onRedeemPromo={handleRedeemPromo}
            onTabChange={setAvatarModalTab}
          />
        </Suspense>
      )}
    </div>
  );
};

export default StartScreen;
