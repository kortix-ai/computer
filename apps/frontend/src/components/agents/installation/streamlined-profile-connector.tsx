import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Shield,
  Settings
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { toast } from '@/lib/toast';
import { useCreateCredentialProfile, type CreateCredentialProfileRequest } from '@/hooks/mcp/use-credential-profiles';
import { useMCPServerDetails } from '@/hooks/mcp/use-mcp-servers';
import type { SetupStep } from './types';

interface ProfileConnectorProps {
  step: SetupStep;
  selectedProfileId: string | undefined;
  onProfileSelect: (qualifiedName: string, profileId: string | null) => void;
  onComplete?: () => void;
}

export const ProfileConnector: React.FC<ProfileConnectorProps> = ({
  step,
  selectedProfileId,
  onProfileSelect,
  onComplete
}) => {
  const [profileStep, setProfileStep] = useState<'select' | 'create'>('select');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  const createProfileMutation = useCreateCredentialProfile();
  const { data: serverDetails } = useMCPServerDetails(
    step.qualified_name,
    true
  );
  
  // configProperties and requiredFields are computed inside CreateProfileStep useMemo

  useEffect(() => {
    setProfileStep('select');
    setIsCreatingProfile(false);
    setNewProfileName('');
    setConfig({});
  }, [step.qualified_name]);

  const handleCreateProfile = useCallback(async () => {
    if (!newProfileName.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    setIsCreatingProfile(true);
    try {
      const request: CreateCredentialProfileRequest = {
        mcp_qualified_name: step.qualified_name,
        profile_name: newProfileName.trim(),
        display_name: step.service_name,
        config: config,
        is_default: false
      };

      const response = await createProfileMutation.mutateAsync(request);
      
      if (response.profile_id) {
        toast.success('Profile created successfully');
        onProfileSelect(step.id, response.profile_id || 'new-profile');
        onComplete?.();
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile');
    } finally {
      setIsCreatingProfile(false);
    }
  }, [newProfileName, config, step.id, step.qualified_name, step.service_name, createProfileMutation, onProfileSelect, onComplete]);

  const handleConfigChange = useCallback((key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const handleProfileNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewProfileName(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && profileStep === 'create') {
      handleCreateProfile();
    }
  }, [handleCreateProfile, profileStep]);

  const SelectProfileStep = useMemo(() => (
    <div className="space-y-4">
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Select or create a credential profile for this service.
          </AlertDescription>
        </Alert>

        <Button 
          variant="outline" 
          onClick={() => {
            setNewProfileName(`${step.service_name} Profile`);
            setProfileStep('create');
          }}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          Create New Profile
        </Button>
      </div>
    </div>
  ), [step.service_name]);

  const CreateProfileStep = useMemo(() => {
    const configProperties = serverDetails?.connections?.[0]?.configSchema?.properties || {};
    const requiredFields = serverDetails?.connections?.[0]?.configSchema?.required || [];
    const isFieldRequired = (fieldName: string) => requiredFields.includes(fieldName);

    return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Button 
            variant="link" 
            size="sm"
            onClick={() => setProfileStep('select')}
            className="mb-4 p-0 h-auto font-normal text-muted-foreground hover:text-foreground"
          >
            ← Back to Selection
          </Button>
        </div>
        <h3 className="font-semibold">Create {step.service_name} Profile</h3>
        <p className="text-sm text-muted-foreground">
          Set up a new credential profile for {step.service_name}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Profile Name</Label>
          <Input
            id="profile-name"
            placeholder="e.g., Personal Account, Work Account"
            value={newProfileName}
            onChange={handleProfileNameChange}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            This helps you identify different configurations
          </p>
        </div>

        {Object.keys(configProperties).length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Connection Settings</span>
            </div>
            {Object.entries(configProperties).map(([key, schema]: [string, any]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
                  {schema.title || key}
                  {isFieldRequired(key) && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Input
                  id={key}
                  type={schema.format === 'password' ? 'password' : 'text'}
                  placeholder={schema.description || `Enter ${key}`}
                  value={config[key] || ''}
                  onChange={(e) => handleConfigChange(key, e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-11"
                />
                {schema.description && (
                  <p className="text-xs text-muted-foreground">{schema.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              This service doesn't require any credentials to connect.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="pt-4 border-t">
        <Button 
          onClick={handleCreateProfile}
          disabled={!newProfileName.trim() || isCreatingProfile}
          className="w-full"
        >
          {isCreatingProfile ? (
            <>
              <KortixLoader customSize={16} className="mr-1" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create & Continue
            </>
          )}
        </Button>
      </div>
    </div>
    );
  }, [
    step.service_name,
    newProfileName,
    config,
    serverDetails,
    isCreatingProfile,
    handleProfileNameChange,
    handleKeyDown,
    handleConfigChange,
    handleCreateProfile,
  ]);

  return (
    <div className="space-y-6">
      {profileStep === 'select' ? SelectProfileStep : CreateProfileStep}
    </div>
  );
};
