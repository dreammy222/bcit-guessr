export type PartyStatusValue =
  | 'lobby'
  | 'round_loading'
  | 'round_countdown'
  | 'round_active'
  | 'round_result'
  | 'finished'
  | 'finalizing'
  | 'ended';
export type PartyViewerRole = 'host' | 'player';

import type { AvatarState } from '../data/cosmetics';

export interface PartyPlayerSummary {
  displayName: string;
  totalPoints: number;
  currentRank: number | null;
  isConnected: boolean;
  avatar?: AvatarState | null;
}

export interface PartyTopEntry {
  displayName: string;
  points: number;
  rank: number | null;
}

export interface PartyProgressPlayer {
  displayName: string;
  isConnected: boolean;
  isReadyForCurrentRound: boolean;
  hasSubmittedCurrentRound: boolean;
}

export interface PartySelfResult {
  roundPoints: number | null;
  roundRank: number | null;
  totalPoints: number;
  totalRank: number | null;
  guessCoords?: [number, number] | null;
  actualCoords?: [number, number] | null;
  distanceKm?: number | null;
  photoLabel?: string | null;
}

export interface PartySessionPayload {
  joinCode: string;
  status: PartyStatusValue;
  roundsCount: number;
  roundTimeSeconds: number;
  currentRoundIndex: number;
  secondsRemaining: number;
  serverNow: string;
  roundStartsAt?: string | null;
  loadingDeadlineAt?: string | null;
  readyCount?: number;
  readyTarget?: number;
  playerIsReadyForCurrentRound?: boolean;
  players: PartyPlayerSummary[];
  playerHasSubmittedCurrentRound?: boolean;
  hostRound?: {
    photoUrl: string;
    photoLabel: string;
    actualCoords?: [number, number];
  };
  roundTopFive?: PartyTopEntry[];
  finalStandings?: PartyTopEntry[];
  self?: PartySelfResult | null;
}

export interface PartyStatusResponse {
  role: PartyViewerRole;
  session: PartySessionPayload;
}

export interface PartyProgressPayload {
  joinCode: string;
  status: PartyStatusValue;
  roundsCount: number;
  roundTimeSeconds: number;
  currentRoundIndex: number;
  secondsRemaining: number;
  serverNow: string;
  roundStartsAt?: string | null;
  loadingDeadlineAt?: string | null;
  readyCount?: number;
  readyTarget?: number;
  playerIsReadyForCurrentRound?: boolean;
  submittedCount: number;
  totalPlayers: number;
  playerHasSubmittedCurrentRound?: boolean;
  players?: PartyProgressPlayer[];
}

export interface PartyProgressResponse {
  role: PartyViewerRole;
  session: PartyProgressPayload;
}
