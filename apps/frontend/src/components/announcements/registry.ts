import { ComponentType } from 'react';

interface AnnouncementComponentProps {
  onClose: () => void;
  [key: string]: unknown;
}

export const announcementRegistry: Record<string, ComponentType<AnnouncementComponentProps>> = {};

function registerAnnouncement(
  name: string, 
  component: ComponentType<AnnouncementComponentProps>
) {
  announcementRegistry[name] = component;
}
