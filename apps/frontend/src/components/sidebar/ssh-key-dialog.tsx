'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Key,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  Download,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { setupSSH, type SSHSetupResult } from '@/lib/platform-client';
import { toast } from '@/lib/toast';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SSHKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SSH_META_STORAGE_KEY = 'kortix:ssh-access-meta:v1';

type SSHAccessMeta = {
  ssh_command: string;
  host: string;
  port: number;
  username: string;
  updatedAt: number;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function CopyButton({ text, label, field, copiedField, onCopy, variant = 'inline' }: {
  text: string;
  label?: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  variant?: 'inline' | 'overlay';
}) {
  const isCopied = copiedField === field;
  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={() => onCopy(text, field)}
        className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-6 w-6 p-0 rounded-md border border-white/20 bg-black/40 text-white/70 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white hover:border-white/40 cursor-pointer"
        aria-label={label || 'Copy'}
      >
        {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onCopy(text, field)}
      className="inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border border-border/60 bg-background/80 text-foreground/80 transition-all hover:bg-background hover:border-border cursor-pointer"
    >
      {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {label && <span>{isCopied ? 'Copied' : label}</span>}
    </button>
  );
}

function CodeBlock({ children, copyText, copyField, copiedField, onCopy, maxH }: {
  children: React.ReactNode;
  copyText: string;
  copyField: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  maxH?: string;
}) {
  return (
    <div className="relative group">
      <pre className={cn(
        "text-[10.5px] leading-relaxed font-mono bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 pr-10 overflow-x-hidden whitespace-pre-wrap break-all select-all text-zinc-300",
        maxH && `max-h-[${maxH}] overflow-y-auto`
      )}>
        {children}
      </pre>
      <CopyButton text={copyText} field={copyField} copiedField={copiedField} onCopy={onCopy} variant="overlay" />
    </div>
  );
}

/* ─── Shared SSH result view (used by both dialog and server-selector) ─── */

export function SSHResultView({ sshResult, copiedField, onCopy, onRegenerate, isGenerating, onDownloadKey }: {
  sshResult: SSHSetupResult;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  onDownloadKey: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const pk = sshResult.private_key.trim();

  // The one-liner that does everything: saves key + connects
  const setupAndConnect = `mkdir -p ~/.ssh && cat > ~/.ssh/kortix_sandbox << 'KORTIX_KEY'\n${pk}\nKORTIX_KEY\nchmod 600 ~/.ssh/kortix_sandbox && ssh -i ~/.ssh/kortix_sandbox -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -p ${sshResult.port} ${sshResult.username}@${sshResult.host}`;

  const connectOnly = sshResult.ssh_command;

  const sshConfigBlock = `Host kortix-sandbox
  HostName ${sshResult.host}
  Port ${sshResult.port}
  User ${sshResult.username}
  IdentityFile ~/.ssh/kortix_sandbox
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  ServerAliveInterval 15
  ServerAliveCountMax 4`;

  const addConfigCmd = `mkdir -p ~/.ssh && touch ~/.ssh/config && chmod 600 ~/.ssh/config && cat >> ~/.ssh/config << 'KORTIX_SSH_CONFIG'\n${sshConfigBlock}\nKORTIX_SSH_CONFIG`;

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3.5 overflow-y-auto overflow-x-hidden">

      {/* Primary action: one-liner */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground/80">Quick setup &amp; connect</p>
          <CopyButton text={setupAndConnect} label="Copy" field="one-liner" copiedField={copiedField} onCopy={onCopy} />
        </div>
        <CodeBlock copyText={setupAndConnect} copyField="one-liner-block" copiedField={copiedField} onCopy={onCopy}>
          {setupAndConnect}
        </CodeBlock>
        <p className="text-[10px] text-muted-foreground/50">
          Paste in your terminal. Saves the key and connects in one step.
        </p>
      </div>

      {/* Connection info chips */}
      <div className="flex items-center gap-2 text-[10.5px]">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/30 border border-border/30 font-mono text-foreground/70">
          <Terminal className="h-3 w-3 text-muted-foreground/50" />
          {sshResult.host}:{sshResult.port}
        </span>
        <span className="text-muted-foreground/40">user:</span>
        <span className="font-mono text-foreground/70">{sshResult.username}</span>
      </div>

      {/* Reconnect shortcut */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground/60">Reconnect later:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-[10.5px] font-mono bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-300 truncate">
            {connectOnly}
          </code>
          <CopyButton text={connectOnly} field="reconnect" copiedField={copiedField} onCopy={onCopy} />
        </div>
      </div>

      {/* VS Code / Cursor shortcut */}
      <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2.5 space-y-2">
        <p className="text-[11px] font-medium text-foreground/70">VS Code / Cursor</p>
        <p className="text-[10px] text-muted-foreground/50">
          Add to <span className="font-mono">~/.ssh/config</span>, then connect with <span className="font-mono text-foreground/60">ssh kortix-sandbox</span>:
        </p>
        <CodeBlock copyText={addConfigCmd} copyField="config-cmd" copiedField={copiedField} onCopy={onCopy}>
          {addConfigCmd}
        </CodeBlock>
      </div>

      {/* Collapsible details */}
      <div className="border-t border-border/20 pt-2">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", showDetails && "rotate-180")} />
          Raw keys
        </button>

        {showDetails && (
          <div className="mt-2.5 space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Private Key</label>
                <div className="flex gap-1">
                  <CopyButton text={pk} field="pk" copiedField={copiedField} onCopy={onCopy} />
                  <button type="button" onClick={onDownloadKey} className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/60 bg-background/80 text-muted-foreground transition-all hover:bg-background hover:text-foreground cursor-pointer" title="Download key file">
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <pre className="text-[10px] font-mono bg-muted/20 border border-border/30 rounded-md px-2.5 py-2 whitespace-pre-wrap break-all select-all text-foreground/50 max-h-[120px] overflow-y-auto">
                {pk}
              </pre>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Public Key</label>
                <CopyButton text={sshResult.public_key} field="pub" copiedField={copiedField} onCopy={onCopy} />
              </div>
              <code className="block text-[10px] font-mono bg-muted/20 border border-border/30 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-all select-all text-foreground/60">
                {sshResult.public_key}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-1 border-t border-border/20">
        <button
          type="button"
          className="h-7 px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 border border-border/30 rounded-lg transition-all cursor-pointer disabled:opacity-50"
          onClick={onRegenerate}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}

/* ─── Main dialog ────────────────────────────────────────────────────────── */

export function SSHKeyDialog({ open, onOpenChange }: SSHKeyDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sshResult, setSSHResult] = useState<SSHSetupResult | null>(null);
  const [sshMeta, setSSHMeta] = useState<SSHAccessMeta | null>(null);
  const [sshError, setSSHError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(SSH_META_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SSHAccessMeta;
      if (parsed?.ssh_command && parsed?.host && parsed?.username && parsed?.port) {
        setSSHMeta(parsed);
      }
    } catch {}
  }, [open]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setSSHError(null);
    setSSHResult(null);
    try {
      const result = await setupSSH();
      setSSHResult(result);
      const meta: SSHAccessMeta = {
        ssh_command: result.ssh_command,
        host: result.host,
        port: result.port,
        username: result.username,
        updatedAt: Date.now(),
      };
      setSSHMeta(meta);
      try {
        localStorage.setItem(SSH_META_STORAGE_KEY, JSON.stringify(meta));
      } catch {}
      toast.success('SSH key generated');
    } catch (err: any) {
      setSSHError(err?.message || 'Failed to generate SSH keys');
      toast.error(err?.message || 'Failed to generate SSH keys');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copied');
    setTimeout(() => setCopiedField(null), 2000);
  }

  function savePrivateKey() {
    if (!sshResult) return;
    const blob = new Blob([sshResult.private_key], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kortix_sandbox';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Key downloaded — run: chmod 600 ~/Downloads/kortix_sandbox');
  }

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setSSHResult(null);
      setSSHError(null);
      setCopiedField(null);
    }
    onOpenChange(next);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(92vw,560px)] sm:max-w-lg max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            SSH Access
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            Connect to your sandbox via terminal or VS Code Remote SSH.
          </DialogDescription>
        </DialogHeader>

        {/* ── Generate view ── */}
        {!sshResult && (
          <div className="flex flex-col gap-3 px-5 pb-5">
            {sshError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {sshError}
              </p>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 w-full h-10 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
              ) : (
                <><Key className="h-3.5 w-3.5" /> Generate SSH Key</>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Generates an ed25519 keypair and configures access to the sandbox.
            </p>

            {sshMeta && (
              <div className="rounded-lg border border-border/30 bg-muted/15 p-3 space-y-2">
                <p className="text-[11px] font-medium text-foreground/70">Reconnect command</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 text-[10px] font-mono bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-300 truncate select-all">
                    {sshMeta.ssh_command}
                  </code>
                  <CopyButton text={sshMeta.ssh_command} field="quick-connect" copiedField={copiedField} onCopy={copyToClipboard} />
                </div>
                <p className="text-[9px] text-muted-foreground/40">
                  From {new Date(sshMeta.updatedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Result view ── */}
        {sshResult && (
          <div className="px-5 pb-5">
            <SSHResultView
              sshResult={sshResult}
              copiedField={copiedField}
              onCopy={copyToClipboard}
              onRegenerate={handleGenerate}
              isGenerating={isGenerating}
              onDownloadKey={savePrivateKey}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
