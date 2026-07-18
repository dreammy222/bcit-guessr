import type { DailyChallengeStatusPayload } from '../daily/types';
import type { AvatarState } from '../data/cosmetics';

export interface LeaderboardEntry {
  username: string;
  score: number;
}

export type AvatarModalTab = 'shop' | 'customize';

export interface StartScreenLayoutProps {
  avatar: AvatarState | null;
  coinBalance: number | null;
  highscore: number | null;
  isAuthLoaded: boolean;
  isSignedIn: boolean;
  dailyStatus: DailyChallengeStatusPayload | null;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardLoading: boolean;
  onOpenCustomize: () => void;
  onOpenShop: () => void;
  onStart: () => void;
  onStartDaily: () => void;
  onPartyMode: () => void;
}
