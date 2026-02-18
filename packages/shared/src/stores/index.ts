/**
 * Shared Zustand store factories.
 *
 * Each export is a *factory function* that returns an independent store
 * instance. This lets each platform (frontend / mobile) create its own store
 * and extend it with platform-specific state and actions.
 *
 * @example
 * ```ts
 * import {
 *   createPricingModalStore,
 *   createKortixComputerBaseStore,
 * } from '@kortix/shared/stores';
 *
 * export const usePricingModalStore = createPricingModalStore();
 * export const useKortixComputerStore = createKortixComputerBaseStore();
 * ```
 */

export {
  // Pricing modal
  createPricingModalStore,
  pricingModalStateCreator,
  pricingModalInitialState,
  type PricingModalState,
  type PricingModalOpenOptions,
} from './create-pricing-modal-store';

export {
  // Kortix Computer
  createKortixComputerBaseStore,
  kortixComputerBaseStateCreator,
  kortixComputerBaseInitialState,
  type KortixComputerBaseState,
  type BaseViewType,
} from './create-kortix-computer-store';
