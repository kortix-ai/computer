'use client';

import { useEffect, useState } from 'react';

const OPEN_MODAL_SELECTOR = [
  '[data-slot="dialog-overlay"][data-state="open"]',
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="alert-dialog-overlay"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
].join(', ');

function hasOpenModal() {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.querySelector(OPEN_MODAL_SELECTOR) !== null;
}

export function useModalOpen() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsModalOpen(hasOpenModal());
    };

    update();

    const observer = new MutationObserver(update);

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-state'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return isModalOpen;
}
