import React from 'react';
import './InstagramLink.css';
import { SCHOOL } from '../config/school';

interface InstagramLinkProps {
  isMobile?: boolean;
}

const InstagramLink: React.FC<InstagramLinkProps> = ({ isMobile }) => {
  if (!SCHOOL.instagramUrl) {
    return null;
  }

  return (
    <a 
      href={SCHOOL.instagramUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`instagram-link ${isMobile ? 'instagram-link--mobile' : 'instagram-link--desktop'}`}
      aria-label="Follow us on Instagram"
      id="instagram-follow-link"
    >
      <div className="instagram-link__icon-wrapper">
        <img src="/Instagram_icon.png" alt="" className="instagram-link__icon" />
      </div>
      {!isMobile && <span className="instagram-link__text">Follow us on Instagram</span>}
    </a>
  );
};

export default InstagramLink;
