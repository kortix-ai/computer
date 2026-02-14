'use client';

import React, { useState } from 'react';
import { Globe, Wrench, MessageSquare, ChevronLeft } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateNewAgent } from '@/hooks/agents/use-agents';
import { AgentCountLimitError } from '@/lib/api/errors';
import { toast } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface AgentCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (agentId: string) => void;
}

const creationOptions = [
  { 
    id: 'scratch' as const, 
    icon: Wrench, 
    label: 'Configure Manually',
    description: 'Full control over every setting'
  },
  { 
    id: 'chat' as const, 
    icon: MessageSquare, 
    label: 'Configure by Chat',
    description: 'Let AI set it up for you'
  },
  { 
    id: 'template' as const, 
    icon: Globe, 
    label: 'Explore Templates',
    description: 'Start from a pre-built worker'
  }
];

export function AgentCreationModal({ open, onOpenChange, onSuccess }: AgentCreationModalProps) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<'scratch' | 'chat' | 'template' | null>(null);
  const [showChatStep, setShowChatStep] = useState(false);
  const [chatDescription, setChatDescription] = useState('');

  const createNewAgentMutation = useCreateNewAgent();

  const handleExploreTemplates = () => {
    onOpenChange(false);
    router.push('/dashboard?tab=worker-templates');
  };

  const handleOptionClick = (option: 'scratch' | 'chat' | 'template') => {
    setSelectedOption(option);

    if (option === 'scratch') {
      createNewAgentMutation.mutate(undefined, {
        onSuccess: (newAgent) => {
          onOpenChange(false);
          router.push(`/agents`);
        },
        onError: (error) => {
          if (error instanceof AgentCountLimitError) {
            onOpenChange(false);
          } else {
            toast.error(error instanceof Error ? error.message : 'Failed to create Worker');
          }
        }
      });
    } else if (option === 'chat') {
      setShowChatStep(true);
    } else if (option === 'template') {
      handleExploreTemplates();
    }
  };

  const handleChatContinue = async () => {
    if (!chatDescription.trim()) {
      toast.error('Please describe what your Worker should be able to do');
      return;
    }

    try {
      const { setupAgentFromChat } = await import('@/lib/api/agents');

      toast.loading('Creating your worker with AI...', { id: 'agent-setup' });

      const result = await setupAgentFromChat({
        description: chatDescription
      });

      toast.success(`Created "${result.name}"!`, { id: 'agent-setup' });
      onOpenChange(false);
      router.push(`/agents`);

    } catch (error: any) {
      toast.error('Failed to create Worker', { id: 'agent-setup' });
      if (error?.detail?.error_code === 'AGENT_LIMIT_EXCEEDED') {
        onOpenChange(false);
      } else {
        console.error('Error creating agent from chat:', error);
      }
    }
  };

  const handleBack = () => {
    setShowChatStep(false);
    setSelectedOption(null);
    setChatDescription('');
  };

  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
      setShowChatStep(false);
      setSelectedOption(null);
      setChatDescription('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[90vh] sm:max-h-[85vh]" hideCloseButton>
        {!showChatStep ? (
          <div className="p-5 sm:p-8">
            {/* Logo & Header */}
            <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-muted/50">
                <KortixLogo size={28} variant="symbol" className="sm:hidden" />
                <KortixLogo size={36} variant="symbol" className="hidden sm:block" />
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-semibold text-foreground">
                Create a new Worker
              </DialogTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-sm">
                Choose how you&apos;d like to set up your new worker
              </p>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-2.5 sm:gap-3">
              {creationOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedOption === option.id;
                const isLoading = createNewAgentMutation.isPending && selectedOption === option.id;
                
                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option.id)}
                    disabled={createNewAgentMutation.isPending}
                    className={cn(
                      "w-full p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all text-left",
                      "flex items-center gap-3 sm:gap-4",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex-shrink-0",
                      isSelected ? "bg-primary/10" : "bg-muted/60"
                    )}>
                      <Icon className={cn(
                        "h-5 w-5 sm:h-6 sm:w-6",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm sm:text-base font-medium",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {option.label}
                        </span>
                        {isLoading && (
                          <KortixLoader customSize={16} />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Cancel button */}
            <div className="mt-5 sm:mt-6">
              <Button 
                variant="ghost" 
                onClick={() => handleModalClose(false)} 
                className="w-full h-9 sm:h-10 text-sm text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-8 overflow-y-auto max-h-[85vh] sm:max-h-none">
            {/* Logo & Header */}
            <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-muted/50">
                <KortixLogo size={28} variant="symbol" className="sm:hidden" />
                <KortixLogo size={36} variant="symbol" className="hidden sm:block" />
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-semibold text-foreground">
                Describe your Worker
              </DialogTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-sm">
                Tell us what your worker should be able to do
              </p>
            </div>

            {/* Textarea */}
            <div className="mb-4 sm:mb-6">
              <Textarea
                value={chatDescription}
                onChange={(e) => setChatDescription(e.target.value)}
                placeholder="e.g., A worker that monitors competitor prices and sends me daily reports..."
                className="min-h-[120px] sm:min-h-[160px] resize-none text-sm sm:text-base"
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:gap-3">
              <Button
                onClick={handleChatContinue}
                disabled={!chatDescription.trim() || createNewAgentMutation.isPending}
                className="w-full h-9 sm:h-10 text-sm"
              >
                {createNewAgentMutation.isPending ? 'Creating...' : 'Create Worker'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleBack} 
                disabled={createNewAgentMutation.isPending}
                className="w-full h-9 sm:h-10 text-sm text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
