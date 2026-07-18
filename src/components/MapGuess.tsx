import React, { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapGuess.css';
import { SCHOOL } from '../config/school';

const MAP = SCHOOL.map;

const guessIcon = L.divIcon({
  className: '',
  html: `<div class="guess-marker">
    <div class="guess-marker__pin"></div>
    <div class="guess-marker__shadow"></div>
  </div>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

interface ClickHandlerProps {
  onGuess: (coords: [number, number]) => void;
  isLocked?: boolean;
}

function ClickHandler({ onGuess, isLocked = false }: ClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      if (isLocked) {
        return;
      }

      onGuess([e.latlng.lat, e.latlng.lng]);
    },
  });

  return null;
}

function MapResizer({ isExpanded }: { isExpanded: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (isExpanded) {
      map.invalidateSize();

      const frame = window.requestAnimationFrame(() => {
        map.invalidateSize();
      });
      const timer = window.setTimeout(() => {
        map.invalidateSize();
      }, 380);

      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
  }, [map, isExpanded]);

  return null;
}

interface MapGuessProps {
  pendingGuess: [number, number] | null;
  onGuess: (coords: [number, number]) => void;
  onSubmit: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  canGuess?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
  showToggleLabel?: boolean;
  onReady?: () => void;
  readyToken?: string | number;
}

const MapGuess: React.FC<MapGuessProps> = ({
  pendingGuess,
  onGuess,
  onSubmit,
  isExpanded,
  onToggleExpand,
  canGuess = true,
  canSubmit = true,
  submitLabel = 'Submit Guess',
  showToggleLabel = true,
  onReady,
  readyToken,
}) => {
  const readyReportedRef = useRef(false);

  useEffect(() => {
    readyReportedRef.current = false;
  }, [readyToken]);

  const reportReady = () => {
    if (readyReportedRef.current) {
      return;
    }

    readyReportedRef.current = true;
    onReady?.();
  };

  return (
    <div className="map-guess">
      <div
        className={`map-panel ${
          isExpanded
            ? 'map-panel--expanded'
            : 'map-panel--collapsed'
        }`}
      >
        <div
          className={`map-panel__header${showToggleLabel ? '' : ' map-panel__header--static'}`}
          onClick={showToggleLabel ? onToggleExpand : undefined}
        >
          <span className="map-panel__title">
            {isExpanded ? 'Click to place your guess' : 'Open Map'}
          </span>
          {showToggleLabel && (
            <div className="map-panel__controls">
              <span className="map-panel__toggle">{isExpanded ? 'Hide' : 'Show'}</span>
            </div>
          )}
        </div>

        <div className="map-panel__map">
          <MapContainer
            center={MAP.center}
            zoom={MAP.defaultZoom}
            maxBounds={MAP.bounds}
            maxBoundsViscosity={0.8}
            minZoom={MAP.minZoom}
            maxZoom={MAP.maxZoom}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
            scrollWheelZoom={true}
            whenReady={() => {
              window.setTimeout(reportReady, 300);
            }}
          >
            <TileLayer
              url={MAP.tileUrl}
              attribution={MAP.tileAttribution}
              eventHandlers={{
                load: reportReady,
              }}
            />
            <MapResizer isExpanded={isExpanded} />
            <ClickHandler onGuess={onGuess} isLocked={!canGuess} />
            {pendingGuess && <Marker position={pendingGuess} icon={guessIcon} />}
          </MapContainer>
        </div>
      </div>

      <div className="map-guess__submit">
        <button
          className="btn-submit-guess ui-button ui-button--primary ui-button--md"
          onClick={onSubmit}
          type="button"
          disabled={!pendingGuess || !canSubmit}
        >
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  );
};

export default MapGuess;
