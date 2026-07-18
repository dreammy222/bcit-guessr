import React from 'react';
import './InstagramLink.css';

interface InstagramLinkProps {
  isMobile?: boolean;
}

const InstagramLink: React.FC<InstagramLinkProps> = ({ isMobile }) => {
  return (
    <a 
      href="https://www.instagram.com/ubcguessr" 
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
