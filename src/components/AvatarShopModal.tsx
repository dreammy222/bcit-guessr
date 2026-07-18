import React, { useEffect, useState } from 'react';
import AvatarPreview from './AvatarPreview';
import {
  getCosmeticsBySlot,
  getEquippedCosmeticId,
  type AvatarState,
  type CosmeticDefinition,
  type CosmeticSlot,
} from '../data/cosmetics';
import type { AvatarModalTab } from './StartScreen.types';

interface AvatarShopModalProps {
  activeTab: AvatarModalTab;
  avatar: AvatarState;
  coinBalance: number;
  errorMessage: string | null;
  ownedCosmeticIds: string[];
  pendingActionKey: string | null;
  onClose: () => void;
  onEquip: (slot: CosmeticSlot, cosmeticId: string | null) => void;
  onPurchase: (cosmeticId: string) => void;
  onRedeemPromo: (promoCode: string) => Promise<PromoRedeemResult>;
  onTabChange: (tab: AvatarModalTab) => void;
}

interface PromoRedeemResult {
  success: boolean;
  message: string;
}

interface CosmeticItemPreviewProps {
  cosmetic: CosmeticDefinition | null;
  slot: CosmeticSlot;
}

interface CosmeticSectionProps {
  slot: CosmeticSlot;
  countLabel: string;
  children: React.ReactNode;
  emptyMessage?: string;
}

interface CustomizeCategoryCardProps {
  slot: CosmeticSlot;
  ownedCount: number;
  equippedName: string | null;
  onSelect: (slot: CosmeticSlot) => void;
}

const SLOT_COPY: Record<CosmeticSlot, { singular: string; plural: string; categoryAssetPath: string }> = {
  shirt: {
    singular: 'Shirt',
    plural: 'Shirts',
    categoryAssetPath: '/cosmetics/shirt_category.png',
  },
  hat: {
    singular: 'Hat',
    plural: 'Hats',
    categoryAssetPath: '/cosmetics/hat_category.png',
  },
  glasses: {
    singular: 'Glasses',
    plural: 'Glasses',
    categoryAssetPath: '/cosmetics/glasses_category.png',
  },
  moustache: {
    singular: 'Moustache',
    plural: 'Moustaches',
    categoryAssetPath: '/cosmetics/moustache_category.png',
  },
};

const CosmeticItemPreview: React.FC<CosmeticItemPreviewProps> = ({ cosmetic, slot }) => {
  if (!cosmetic) {
    const slotCopy = SLOT_COPY[slot];

    return (
      <div aria-hidden="true" className="avatar-item-card__preview-empty">
        <span>{`No ${slotCopy.singular.toLowerCase()}`}</span>
      </div>
    );
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`avatar-item-card__preview-image avatar-item-card__preview-image--${slot}`}
      src={cosmetic.previewAssetPath ?? cosmetic.assetPath}
    />
  );
};

const CosmeticSection: React.FC<CosmeticSectionProps> = ({
  slot,
  countLabel,
  children,
  emptyMessage,
}) => {
  const slotCopy = SLOT_COPY[slot];

  return (
    <section className="avatar-slot-section">
      <div className="avatar-slot-section__header">
        <div className="avatar-slot-section__header-copy">
          <h3>{slotCopy.plural}</h3>
        </div>
        <span>{countLabel}</span>
      </div>

      <div className="avatar-slot-section__grid">{children}</div>

      {emptyMessage && <p className="avatar-slot-section__empty">{emptyMessage}</p>}
    </section>
  );
};

const CustomizeCategoryCard: React.FC<CustomizeCategoryCardProps> = ({
  slot,
  ownedCount,
  equippedName,
  onSelect,
}) => {
  const slotCopy = SLOT_COPY[slot];

  return (
    <button
      className="avatar-category-card ui-glass-card"
      onClick={() => onSelect(slot)}
      type="button"
    >
      <div className="avatar-category-card__media">
        <img
          alt=""
          aria-hidden="true"
          className={`avatar-category-card__image avatar-category-card__image--${slot}`}
          src={slotCopy.categoryAssetPath}
        />
      </div>

      <div className="avatar-category-card__copy">
        <div>
          <p className="avatar-category-card__eyebrow">Customize</p>
          <h3>{slotCopy.plural}</h3>
        </div>
        <p className="avatar-category-card__meta">{ownedCount} owned</p>
        <p className="avatar-category-card__status">
          {equippedName ? `Equipped: ${equippedName}` : 'Nothing equipped'}
        </p>
      </div>

      <span className="avatar-category-card__cta">View items</span>
    </button>
  );
};

const AvatarShopModal: React.FC<AvatarShopModalProps> = ({
  activeTab,
  avatar,
  coinBalance,
  errorMessage,
  ownedCosmeticIds,
  pendingActionKey,
  onClose,
  onEquip,
  onPurchase,
  onRedeemPromo,
  onTabChange,
}) => {
  const [selectedCustomizeSlot, setSelectedCustomizeSlot] = useState<CosmeticSlot | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (activeTab !== 'customize') {
      setSelectedCustomizeSlot(null);
    }
  }, [activeTab]);

  const ownedSet = new Set(ownedCosmeticIds);
  const slotSections: CosmeticSlot[] = ['shirt', 'hat', 'glasses', 'moustache'];
  const slotSummaries = slotSections.map((slot) => {
    const cosmetics = getCosmeticsBySlot(slot);
    const ownedItems = cosmetics.filter((cosmetic) => ownedSet.has(cosmetic.id));
    const equippedId = getEquippedCosmeticId(avatar, slot);
    const equippedCosmetic = cosmetics.find((cosmetic) => cosmetic.id === equippedId) ?? null;

    return {
      slot,
      cosmetics,
      ownedItems,
      equippedId,
      equippedCosmetic,
    };
  });
  const selectedCustomizeSummary =
    slotSummaries.find((summary) => summary.slot === selectedCustomizeSlot) ?? null;
  const isPromoPending = pendingActionKey === 'promo:redeem';

  const handleModalTabChange = (tab: AvatarModalTab) => {
    setSelectedCustomizeSlot(null);
    onTabChange(tab);
  };

  const handlePromoSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!promoCode.trim() || isPromoPending) {
      return;
    }

    setPromoMessage(null);
    void onRedeemPromo(promoCode).then((result) => {
      setPromoMessage(result.message);

      if (result.success) {
        setPromoCode('');
      }
    });
  };

  return (
    <div
      aria-modal="true"
      className="avatar-modal-overlay"
      role="dialog"
      onClick={onClose}
    >
      <div className="avatar-modal" onClick={(event) => event.stopPropagation()}>
        <div className="avatar-modal__header">
          <div className="avatar-modal__hero">
            <div className="avatar-modal__preview-shell">
              <AvatarPreview avatar={avatar} size="sm" />
            </div>
            <div className="avatar-modal__hero-copy">
              <h2>Avatar Studio</h2>
              <div className="avatar-modal__coin-badge ui-badge">
                Coins: {coinBalance.toLocaleString()}
              </div>
            </div>
          </div>

          <form
            aria-label="Redeem promo code"
            className="avatar-modal__promo"
            onSubmit={handlePromoSubmit}
          >
            <label className="avatar-modal__promo-label" htmlFor="avatar-promo-code">
              Promo code
            </label>
            <div className="avatar-modal__promo-row">
              <input
                autoComplete="off"
                className="avatar-modal__promo-input"
                id="avatar-promo-code"
                maxLength={24}
                disabled={isPromoPending}
                onChange={(event) => {
                  setPromoCode(event.target.value.toUpperCase());
                  setPromoMessage(null);
                }}
                placeholder="Enter code"
                type="text"
                value={promoCode}
              />
              <button
                className="avatar-modal__promo-button"
                disabled={!promoCode.trim() || isPromoPending}
                type="submit"
              >
                {isPromoPending ? 'Redeeming...' : 'Redeem'}
              </button>
            </div>
            {promoMessage && (
              <p className="avatar-modal__promo-message" role="status">
                {promoMessage}
              </p>
            )}
          </form>

          <div className="avatar-modal__controls">
            <div className="avatar-modal__tabs" role="tablist" aria-label="Avatar navigation">
              <button
                aria-selected={activeTab === 'shop'}
                className={`avatar-modal__tab${activeTab === 'shop' ? ' avatar-modal__tab--active' : ''}`}
                onClick={() => handleModalTabChange('shop')}
                role="tab"
                type="button"
              >
                Shop
              </button>
              <button
                aria-selected={activeTab === 'customize'}
                className={`avatar-modal__tab${activeTab === 'customize' ? ' avatar-modal__tab--active' : ''}`}
                onClick={() => handleModalTabChange('customize')}
                role="tab"
                type="button"
              >
                Customize
              </button>
            </div>

            <button
              aria-label="Close avatar modal"
              className="avatar-modal__close"
              onClick={onClose}
              type="button"
            >
              X
            </button>
          </div>
        </div>

        <div className="avatar-modal__content">
          {errorMessage && <div className="avatar-modal__error">{errorMessage}</div>}

          {activeTab === 'shop' ? (
            <div className="avatar-modal__sections">
              {slotSummaries.map(({ slot, cosmetics }) => {
                const slotCopy = SLOT_COPY[slot];

                return (
                  <CosmeticSection
                    countLabel={`${cosmetics.length} available`}
                    key={slot}
                    slot={slot}
                  >
                    {cosmetics.map((cosmetic) => {
                      const isOwned = ownedSet.has(cosmetic.id);
                      const isEquipped = getEquippedCosmeticId(avatar, cosmetic.slot) === cosmetic.id;
                      const canAfford = coinBalance >= cosmetic.price;
                      const actionKey = `purchase:${cosmetic.id}`;
                      const isPending = pendingActionKey === actionKey;

                      let actionLabel = 'Buy';
                      let disabled = false;

                      if (isPending) {
                        actionLabel = 'Buying...';
                        disabled = true;
                      } else if (isEquipped) {
                        actionLabel = 'Equipped';
                        disabled = true;
                      } else if (isOwned) {
                        actionLabel = 'Owned';
                        disabled = true;
                      } else if (!canAfford) {
                        actionLabel = 'Not enough coins';
                        disabled = true;
                      }

                      return (
                        <article className="avatar-item-card ui-glass-card" key={cosmetic.id}>
                          <div className="avatar-item-card__preview">
                            <CosmeticItemPreview cosmetic={cosmetic} slot={cosmetic.slot} />
                          </div>
                          <div className="avatar-item-card__copy">
                            <div className="avatar-item-card__topline">
                              <h3>{cosmetic.name}</h3>
                              <span className="avatar-item-card__slot">{slotCopy.singular}</span>
                            </div>
                            <p className="avatar-item-card__price">{cosmetic.price.toLocaleString()} coins</p>
                          </div>
                          <button
                            className={`avatar-item-card__action ui-button ui-button--md${disabled ? ' ui-button--glass' : ' ui-button--primary'}`}
                            disabled={disabled}
                            onClick={() => onPurchase(cosmetic.id)}
                            type="button"
                          >
                            {actionLabel}
                          </button>
                        </article>
                      );
                    })}
                  </CosmeticSection>
                );
              })}
            </div>
          ) : (
            selectedCustomizeSummary ? (
              <div className="avatar-customize-detail">
                <div className="avatar-customize-detail__header">
                  <button
                    className="avatar-customize-detail__back ui-button ui-button--sm ui-button--glass"
                    onClick={() => setSelectedCustomizeSlot(null)}
                    type="button"
                  >
                    Back
                  </button>

                  <div className="avatar-customize-detail__copy">
                    <p className="avatar-customize-detail__eyebrow">Customize</p>
                    <h3>{SLOT_COPY[selectedCustomizeSummary.slot].plural}</h3>
                    <p className="avatar-customize-detail__summary">
                      {`${selectedCustomizeSummary.ownedItems.length} owned`}
                      {selectedCustomizeSummary.equippedCosmetic
                        ? ` - Equipped: ${selectedCustomizeSummary.equippedCosmetic.name}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="avatar-slot-section__grid">
                  <article className="avatar-item-card ui-glass-card">
                    <div className="avatar-item-card__preview">
                      <CosmeticItemPreview cosmetic={null} slot={selectedCustomizeSummary.slot} />
                    </div>
                    <div className="avatar-item-card__copy">
                      <div className="avatar-item-card__topline">
                        <h3>None</h3>
                        <span className="avatar-item-card__slot">
                          {SLOT_COPY[selectedCustomizeSummary.slot].singular}
                        </span>
                      </div>
                      <p className="avatar-item-card__price">Clear this slot</p>
                    </div>
                    <button
                      className={`avatar-item-card__action ui-button ui-button--md${selectedCustomizeSummary.equippedId === null ? ' ui-button--glass' : ' ui-button--primary'}`}
                      disabled={
                        selectedCustomizeSummary.equippedId === null
                        || pendingActionKey === `equip:${selectedCustomizeSummary.slot}:none`
                      }
                      onClick={() => onEquip(selectedCustomizeSummary.slot, null)}
                      type="button"
                    >
                      {pendingActionKey === `equip:${selectedCustomizeSummary.slot}:none`
                        ? 'Saving...'
                        : selectedCustomizeSummary.equippedId === null
                          ? 'Equipped'
                          : 'Equip'}
                    </button>
                  </article>

                  {selectedCustomizeSummary.ownedItems.map((cosmetic) => {
                    const isEquipped = selectedCustomizeSummary.equippedId === cosmetic.id;
                    const actionKey = `equip:${selectedCustomizeSummary.slot}:${cosmetic.id}`;
                    const isPending = pendingActionKey === actionKey;

                    return (
                      <article className="avatar-item-card ui-glass-card" key={cosmetic.id}>
                        <div className="avatar-item-card__preview">
                          <CosmeticItemPreview cosmetic={cosmetic} slot={selectedCustomizeSummary.slot} />
                        </div>
                        <div className="avatar-item-card__copy">
                          <div className="avatar-item-card__topline">
                            <h3>{cosmetic.name}</h3>
                            <span className="avatar-item-card__slot">
                              {SLOT_COPY[selectedCustomizeSummary.slot].singular}
                            </span>
                          </div>
                          <p className="avatar-item-card__price">Owned cosmetic</p>
                        </div>
                        <button
                          className={`avatar-item-card__action ui-button ui-button--md${isEquipped ? ' ui-button--glass' : ' ui-button--primary'}`}
                          disabled={isEquipped || isPending}
                          onClick={() => onEquip(selectedCustomizeSummary.slot, cosmetic.id)}
                          type="button"
                        >
                          {isPending ? 'Saving...' : isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      </article>
                    );
                  })}
                </div>

                {selectedCustomizeSummary.ownedItems.length === 0 && (
                  <p className="avatar-slot-section__empty">
                    {`No owned ${SLOT_COPY[selectedCustomizeSummary.slot].plural.toLowerCase()} yet. Visit the shop tab to buy one.`}
                  </p>
                )}
              </div>
            ) : (
              <div className="avatar-customize">
                <div className="avatar-customize__intro">
                </div>

                <div className="avatar-category-grid">
                  {slotSummaries.map(({ slot, ownedItems, equippedCosmetic }) => (
                    <CustomizeCategoryCard
                      equippedName={equippedCosmetic?.name ?? null}
                      key={slot}
                      onSelect={setSelectedCustomizeSlot}
                      ownedCount={ownedItems.length}
                      slot={slot}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarShopModal;
