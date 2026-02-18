import { create, type StateCreator } from 'zustand';

/**
 * Shared pricing/billing modal store factory.
 *
 * Captures the common state shape across frontend and mobile pricing modals.
 *
 * Platform-specific extensions (not included here):
 * - Frontend: adds `customTitle`, `isAlert`, `returnUrl` fields;
 *   calls `trackCtaUpgrade()` (GTM/GA4) inside `openPricingModal`.
 * - Mobile: adds `creditsExhausted` field; re-exports the store as
 *   `useBillingModalStore` alias.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options accepted by `openPricingModal`. */
export interface PricingModalOpenOptions {
  /** Title shown in the alert variant of the modal. */
  alertTitle?: string;
  /** Subtitle / description shown in the alert variant. */
  alertSubtitle?: string;
}

/** State shape for the shared pricing modal store. */
export interface PricingModalState {
  /** Whether the pricing modal is currently visible. */
  isOpen: boolean;
  /** Alert title displayed in the modal. */
  alertTitle?: string;
  /** Alert subtitle / description displayed in the modal. */
  alertSubtitle?: string;

  /** Open the pricing modal with optional configuration. */
  openPricingModal: (options?: PricingModalOpenOptions) => void;
  /** Close the pricing modal and reset transient state. */
  closePricingModal: () => void;
}

// ---------------------------------------------------------------------------
// Initial state (exported so platforms can spread into extended stores)
// ---------------------------------------------------------------------------

export const pricingModalInitialState: Pick<
  PricingModalState,
  'isOpen' | 'alertTitle' | 'alertSubtitle'
> = {
  isOpen: false,
  alertTitle: undefined,
  alertSubtitle: undefined,
};

// ---------------------------------------------------------------------------
// State creator (usable as a zustand slice or standalone)
// ---------------------------------------------------------------------------

/**
 * Zustand state creator for the pricing modal.
 *
 * Can be passed directly to `create()` or composed into a larger store via
 * zustand's slice pattern.
 */
export const pricingModalStateCreator: StateCreator<PricingModalState> = (set) => ({
  ...pricingModalInitialState,

  openPricingModal: (options) =>
    set({
      isOpen: true,
      alertTitle: options?.alertTitle,
      alertSubtitle: options?.alertSubtitle,
    }),

  closePricingModal: () =>
    set({ ...pricingModalInitialState }),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an independent pricing modal Zustand store instance.
 *
 * @example
 * ```ts
 * // Use directly when no platform-specific extensions are needed:
 * export const usePricingModalStore = createPricingModalStore();
 * ```
 *
 * For platform-specific extensions, either:
 * 1. Wrap the returned store with additional selectors / side-effects, or
 * 2. Create your own store using the exported `pricingModalInitialState`,
 *    `pricingModalStateCreator`, and `PricingModalState` type as building blocks.
 */
export function createPricingModalStore() {
  return create<PricingModalState>(pricingModalStateCreator);
}
