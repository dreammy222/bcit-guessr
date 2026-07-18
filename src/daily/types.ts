export type DailyChallengeState = 'available' | 'in_progress' | 'played' | 'unavailable';

export interface DailyChallengeResult {
  photoId: string;
  photoLabel: string;
  actualCoords: [number, number];
  guessCoords: [number, number] | null;
  distanceKm: number | null;
  points: number;
}

export interface DailyChallengeStatusPayload {
  dateKey: string;
  refreshAt: number;
  state: DailyChallengeState;
  canStart: boolean;
  deadlineAt: number | null;
  requiresAuth: boolean;
}

export type DailyChallengeStartPayload =
  | {
      dateKey: string;
      refreshAt: number;
      state: 'in_progress';
      startedAt: number | null;
      deadlineAt: number | null;
      awaitingPhotoReady: boolean;
      photoUrl: string;
    }
  | {
      dateKey: string;
      refreshAt: number;
      state: 'played';
      result: DailyChallengeResult;
    }
  | {
      dateKey: string;
      refreshAt: number;
      state: 'unavailable';
      message: string;
    };
