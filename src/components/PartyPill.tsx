import React from 'react';
import AvatarPreview from './AvatarPreview';
import { AvatarState } from '../data/cosmetics';
import './PartyPill.css';

interface PartyPillProps {
  displayName: string;
  avatar: AvatarState | null;
}

const PartyPill: React.FC<PartyPillProps> = ({ displayName, avatar }) => {
  return (
    <div className="party-pill">
      <div className="party-pill__avatar">
        <AvatarPreview avatar={avatar} size="xs" />
      </div>
      <span className="party-pill__name">{displayName}</span>
    </div>
  );
};

export default PartyPill;
