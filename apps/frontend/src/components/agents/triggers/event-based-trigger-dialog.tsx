"use client";

import React from 'react';

interface EventBasedTriggerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    onTriggerCreated?: (triggerId: string) => void;
    isEditMode?: boolean;
    existingTrigger?: any;
    onTriggerUpdated?: (triggerId: string) => void;
}

export const EventBasedTriggerDialog: React.FC<EventBasedTriggerDialogProps> = ({ 
    open, 
    onOpenChange, 
}) => {
    // Event-based triggers (Composio) are not available in local mode
    return null;
};
