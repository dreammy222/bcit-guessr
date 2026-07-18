import React, { useCallback, useEffect, useState } from 'react';
import './Leaderboard.css';
import type { LeaderboardEntry } from './StartScreen.types';

interface LeaderboardProps {
  onClose?: () => void;
  embedded?: boolean;
  entries?: LeaderboardEntry[];
  loading?: boolean;
  disableAutoFetch?: boolean;
}

const podiumRanks = ['\u{1F947}', '\u{1F948}', '\u{1F949}'] as const;
const podiumRowClasses = ['leaderboard-row--first', 'leaderboard-row--second', 'leaderboard-row--third'] as const;

const Leaderboard: React.FC<LeaderboardProps> = ({
  onClose,
  embedded = false,
  entries: controlledEntries,
  loading: controlledLoading,
  disableAutoFetch = false,
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(controlledEntries || []);
  const [loading, setLoading] = useState(controlledLoading ?? !disableAutoFetch);

  const fetchLeaderboard = useCallback(() => {
    if (disableAutoFetch) {
      return;
    }

    setLoading(true);
    fetch('/api/leaderboard')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEntries(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load leaderboard', err);
        setLoading(false);
      });
  }, [disableAutoFetch]);

  useEffect(() => {
    if (controlledEntries) {
      setEntries(controlledEntries);
    }
  }, [controlledEntries]);

  useEffect(() => {
    if (typeof controlledLoading === 'boolean') {
      setLoading(controlledLoading);
    }
  }, [controlledLoading]);

  useEffect(() => {
    if (disableAutoFetch) {
      return;
    }

    fetchLeaderboard();
  }, [disableAutoFetch, fetchLeaderboard]);

  const content = (
    <div className={embedded ? 'leaderboard-embedded' : 'leaderboard-modal'}>
      <div className="leaderboard-header">
        <h2>Leaderboard</h2>
        {!embedded && onClose && (
          <button className="leaderboard-close" onClick={onClose} type="button" aria-label="Close leaderboard">
            x
          </button>
        )}
      </div>
      <div className="leaderboard-content">
        {loading ? (
          <div className="leaderboard-loading">Loading scores...</div>
        ) : entries.length === 0 ? (
          <div className="leaderboard-empty">No scores yet! Be the first!</div>
        ) : (
          <div className="leaderboard-list">
            {entries.map((entry, index) => {
              const rankDisplay = podiumRanks[index] ?? `${index + 1}`;
              const rowClassName = podiumRowClasses[index];

              return (
                <div
                  key={index}
                  className={['leaderboard-row', rowClassName].filter(Boolean).join(' ')}
                >
                  <div className="leaderboard-rank">{rankDisplay}</div>
                  <div className="leaderboard-user">{entry.username}</div>
                  <div className="leaderboard-score">{entry.score.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <div className="leaderboard-overlay">{content}</div>;
};

export default Leaderboard;
