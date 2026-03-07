'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Server, Loader2, MapPin, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getHetznerServerTypes, createInstance, type HetznerServerType } from '@/lib/api/billing';
import { toast } from '@/lib/toast';
import { useSubscriptionStore } from '@/stores/subscription-store';

// Hetzner locations
const LOCATIONS = [
  { id: 'ash', label: 'US East (Ashburn)', flag: '🇺🇸' },
  { id: 'nbg1', label: 'EU (Nuremberg)', flag: '🇩🇪' },
  { id: 'fsn1', label: 'EU (Falkenstein)', flag: '🇩🇪' },
  { id: 'hel1', label: 'EU (Helsinki)', flag: '🇫🇮' },
] as const;

type CpuCategory = 'shared' | 'dedicated';

function formatMemory(gb: number): string {
  return gb >= 1 ? `${gb} GB` : `${Math.round(gb * 1024)} MB`;
}

function formatDisk(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toFixed(0)} TB` : `${gb} GB`;
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function AddInstanceDialog() {
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('ash');
  const [serverTypes, setServerTypes] = useState<HetznerServerType[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useSubscriptionStore((s) => s.refetch);

  // Listen for custom event to open
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-add-instance-dialog', handler);
    return () => window.removeEventListener('open-add-instance-dialog', handler);
  }, []);

  // Fetch server types when location changes
  const fetchTypes = useCallback(async (loc: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getHetznerServerTypes(loc);
      setServerTypes(result.serverTypes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load server types');
      setServerTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTypes(location);
      setSelected(null);
      setStep('select');
    }
  }, [open, location, fetchTypes]);

  const handleCreate = async () => {
    if (!selected) return;
    setCreating(true);
    setError(null);
    try {
      await createInstance({
        provider: 'hetzner',
        hetznerServerType: selected,
        location,
        backgroundProvisioning: true,
      });
      toast.success('Instance provisioning started. It should be ready in 2-3 minutes.');
      refetch();
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to create instance');
      toast.error(err?.message || 'Failed to create instance');
    } finally {
      setCreating(false);
    }
  };

  // Group by CPU type
  const shared = serverTypes.filter((t) => t.cpuType === 'shared');
  const dedicated = serverTypes.filter((t) => t.cpuType === 'dedicated');
  const selectedType = serverTypes.find((t) => t.name === selected);
  const selectedLocation = LOCATIONS.find((loc) => loc.id === location);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 overflow-hidden flex flex-col max-h-[88vh] w-[min(92vw,560px)] sm:max-w-lg">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-muted-foreground" />
            Add Instance
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose a server type and location for your new Hetzner instance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          <div className="flex flex-col gap-4 pb-20">
            {step === 'select' ? (
              <>
                {/* Location selector */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Location
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {LOCATIONS.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setLocation(loc.id)}
                        className={cn(
                          'px-2.5 py-1.5 text-xs rounded-lg border transition-all cursor-pointer',
                          location === loc.id
                            ? 'border-primary/50 bg-primary/10 text-foreground font-medium'
                            : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:border-border',
                        )}
                      >
                        {loc.flag} {loc.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}

                {/* Loading */}
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Server types */}
                {!loading && serverTypes.length > 0 && (
                  <div className="space-y-3">
                    {shared.length > 0 && (
                      <ServerTypeGroup
                        label="Shared vCPU"
                        types={shared}
                        selected={selected}
                        onSelect={setSelected}
                      />
                    )}
                    {dedicated.length > 0 && (
                      <ServerTypeGroup
                        label="Dedicated vCPU"
                        types={dedicated}
                        selected={selected}
                        onSelect={setSelected}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Review your instance details before provisioning.
                </p>
                {selectedType ? (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Machine</span>
                      <span className="text-sm font-medium text-foreground">{selectedType.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Location</span>
                      <span className="text-sm text-foreground">{selectedLocation ? `${selectedLocation.flag} ${selectedLocation.label}` : location}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Resources</span>
                      <span className="text-sm text-foreground">{selectedType.cores} cores / {formatMemory(selectedType.memory)} / {formatDisk(selectedType.disk)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Architecture</span>
                      <span className="text-sm text-foreground uppercase">{selectedType.architecture}</span>
                    </div>
                    <div className="border-t border-border/40 pt-2 mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Hetzner base</span>
                        <span className="text-sm text-muted-foreground">{formatPrice(selectedType.priceMonthly)}/mo</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Kortix total (incl. markup)</span>
                        <span className="text-sm font-medium text-foreground">{formatPrice(selectedType.priceMonthlyMarkup)}/mo</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">No machine selected. Go back and choose a server type.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer actions */}
        <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex items-center justify-between px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <div className="text-sm">
              {selectedType ? (
                <span className="text-foreground font-medium">
                  {formatPrice(selectedType.priceMonthlyMarkup)}/mo
                </span>
              ) : (
                <span className="text-muted-foreground/60">Select a server type</span>
              )}
            </div>
            <div className="flex gap-2">
              {step === 'select' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('select')}
                  disabled={creating}
                >
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={step === 'select' ? () => setStep('review') : handleCreate}
                disabled={!selected || creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  step === 'select' ? 'Review' : 'Add Instance'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServerTypeGroup({
  label,
  types,
  selected,
  onSelect,
}: {
  label: string;
  types: HetznerServerType[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        {types.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => onSelect(t.name)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer',
              selected === t.name
                ? 'border-primary/50 bg-primary/[0.06] ring-1 ring-primary/20'
                : 'border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-border/60',
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{t.name}</span>
                {t.architecture === 'arm' && (
                  <span className="px-1 py-px text-[9px] font-medium text-amber-500/80 bg-amber-500/10 rounded">ARM</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Cpu className="h-2.5 w-2.5" />
                  {t.cores} cores
                </span>
                <span className="flex items-center gap-1">
                  <MemoryStick className="h-2.5 w-2.5" />
                  {formatMemory(t.memory)}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-2.5 w-2.5" />
                  {formatDisk(t.disk)}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-xs font-medium text-foreground">
                {formatPrice(t.priceMonthlyMarkup)}
                <span className="text-muted-foreground/60 font-normal">/mo</span>
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
