'use client';
import React from 'react';
import { identity } from '@/lib/utils/identity';
/** @deprecated System info is not applicable with OpenCode server */
export const SystemInfoContent = identity(function SystemInfoContent(_props: Record<string, unknown>) {
  return null;
});
SystemInfoContent.displayName = 'SystemInfoContent';
