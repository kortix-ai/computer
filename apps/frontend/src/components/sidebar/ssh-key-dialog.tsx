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

function highlightShellToken(token: string) {
  if (/^(ssh|mkdir|cat|chmod)$/.test(token)) return 'text-emerald-300';
  if (/^(-[A-Za-z]|--[A-Za-z-]+)/.test(token)) return 'text-amber-300';
  if (/^(~\/|\/)[^\s]*/.test(token)) return 'text-sky-300';
  if (/^\d+$/.test(token)) return 'text-violet-300';
  if (/^'.*'$/.test(token)) return 'text-orange-300';
  if (/^[A-Z0-9_]+=?$/.test(token)) return 'text-cyan-300';
  return 'text-zinc-200';
}

function renderShellHighlighted(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\s+)/);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (!part) return null;
          if (/^\s+$/.test(part)) {
            return <span key={`part-${lineIndex}-${partIndex}`}>{part}</span>;
          }
          return (
            <span key={`part-${lineIndex}-${partIndex}`} className={highlightShellToken(part)}>
              {part}
            </span>
          );
        })}
        {lineIndex < lines.length - 1 ? '\n' : null}
      </React.Fragment>
    );
  });
}

function renderSshConfigHighlighted(config: string) {
  const lines = config.split('\n');
  return lines.map((line, index) => {
    if (!line.trim()) {
      return <React.Fragment key={`cfg-${index}`}>{index < lines.length - 1 ? '\n' : null}</React.Fragment>;
    }
    const match = line.match(/^(\s*)(\S+)(\s+)(.+)$/);
    if (!match) {
      return (
        <React.Fragment key={`cfg-${index}`}>
          <span className="text-zinc-200">{line}</span>
          {index < lines.length - 1 ? '\n' : null}
        </React.Fragment>
      );
    }
    const [, indent, key, spacing, value] = match;
    return (
      <React.Fragment key={`cfg-${index}`}>
        <span>{indent}</span>
        <span className="text-cyan-300">{key}</span>
        <span>{spacing}</span>
        <span className="text-zinc-200 break-all">{value}</span>
        {index < lines.length - 1 ? '\n' : null}
      </React.Fragment>
    );
  });
}

const copyButtonBaseClass =
  'inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border border-border/70 bg-background/80 text-foreground/90 transition-all hover:bg-background hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer';
const copyIconButtonBaseClass =
  'inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/70 bg-background/80 text-muted-foreground shadow-sm transition-all hover:bg-background hover:text-foreground hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer';
const codeCopyButtonClass =
  'absolute top-2.5 right-2.5 z-10 inline-flex items-center justify-center h-5 w-5 p-0 rounded-md border border-white/30 bg-slate-950/55 text-white backdrop-blur-sm transition-all hover:bg-slate-950/80 hover:border-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 cursor-pointer';

export function SSHKeyDialog({ open, onOpenChange }: SSHKeyDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sshResult, setSSHResult] = useState<SSHSetupResult | null>(null);
  const [sshMeta, setSSHMeta] = useState<SSHAccessMeta | null>(null);
  const [sshError, setSSHError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      toast.success('SSH keys generated successfully');
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
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function savePrivateKey() {
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
    toast.success('Private key downloaded. Run: chmod 600 ~/Downloads/kortix_sandbox');
  }

  // Reset state when dialog closes
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setSSHResult(null);
      setSSHError(null);
      setShowAdvanced(false);
      setCopiedField(null);
    }
    onOpenChange(next);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(92vw,620px)] sm:max-w-xl max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            Generate SSH Key
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            SSH into your sandbox via terminal or VS Code Remote SSH.
          </DialogDescription>
        </DialogHeader>

        {/* ---- Initial / Generate view ---- */}
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
              Generates an ed25519 keypair and configures SSH access to the sandbox.
            </p>

            {sshMeta && (
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                <p className="text-[11px] font-medium text-foreground/80">Last known reconnect command</p>
                <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-md px-2.5 py-2 overflow-x-hidden whitespace-pre-wrap break-all text-zinc-200">
                  {renderShellHighlighted(sshMeta.ssh_command)}
                </pre>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground/60">Saved {new Date(sshMeta.updatedAt).toLocaleString()}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(sshMeta.ssh_command, 'quick-connect')}
                    className={copyButtonBaseClass}
                  >
                    {copiedField === 'quick-connect' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                    {copiedField === 'quick-connect' ? 'Copied' : 'Copy command'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- SSH result view ---- */}
        {sshResult && (() => {
          const pk = sshResult.private_key.trim();
          const setupScript = `mkdir -p ~/.ssh && cat > ~/.ssh/kortix_sandbox << 'KORTIX_KEY'\n${pk}\nKORTIX_KEY\nchmod 600 ~/.ssh/kortix_sandbox`;
          const connectCommand = sshResult.ssh_command;
          const oneLiner = `${setupScript} && ${connectCommand}`;
          const sshConfigBlock = `Host kortix-sandbox\n  HostName ${sshResult.host}\n  Port ${sshResult.port}\n  User ${sshResult.username}\n  IdentityFile ~/.ssh/kortix_sandbox\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  ServerAliveInterval 15\n  ServerAliveCountMax 4`;
          const installConfigCommand = `mkdir -p ~/.ssh && touch ~/.ssh/config && chmod 600 ~/.ssh/config && cat >> ~/.ssh/config << 'KORTIX_SSH_CONFIG'\n${sshConfigBlock}\nKORTIX_SSH_CONFIG`;

          return (
            <div className="flex flex-col min-h-0 flex-1 px-5 pb-5 gap-4 overflow-y-auto overflow-x-hidden">

              {/* Step 1: setup key */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  1) Save the SSH key on your machine:
                </p>
                <div className="relative group">
                  <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-lg px-3 py-2.5 pr-16 max-h-[96px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all select-all text-zinc-200 shadow-inner">
                    {renderShellHighlighted(setupScript)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(setupScript, 'setup')}
                    className={codeCopyButtonClass}
                    aria-label="Copy setup command"
                  >
                    {copiedField === 'setup' ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  This only writes <span className="font-mono">~/.ssh/kortix_sandbox</span> and sets safe permissions.
                </p>
              </div>

              {/* Step 2: connect */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  2) Connect when you are ready:
                </p>
                <div className="relative group">
                  <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-lg px-3 py-2.5 pr-16 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all select-all text-zinc-200 shadow-inner">
                    {renderShellHighlighted(connectCommand)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(connectCommand, 'connect')}
                    className={codeCopyButtonClass}
                    aria-label="Copy connect command"
                  >
                    {copiedField === 'connect' ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  Use this command later any time to reconnect.
                </p>
              </div>

              {/* Connection details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-0.5">Host</p>
                  <p className="text-xs font-mono text-foreground/80">{sshResult.host}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-0.5">Port</p>
                  <p className="text-xs font-mono text-foreground/80">{sshResult.port}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-0.5">User</p>
                  <p className="text-xs font-mono text-foreground/80">{sshResult.username}</p>
                </div>
              </div>

              {/* VS Code hint */}
              <div className="rounded-lg border border-border/30 bg-muted/15 px-3 py-2.5">
                <p className="text-[11px] font-medium text-foreground/70 mb-1">VS Code / Cursor Remote SSH</p>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  After running the script above, add this to your <span className="font-mono text-foreground/60">~/.ssh/config</span> to
                  connect from VS Code or Cursor:
                </p>
                <div className="relative mt-2">
                  <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-md px-2.5 py-2 whitespace-pre-wrap break-all select-all text-zinc-200 overflow-x-hidden shadow-inner">
                    {renderSshConfigHighlighted(sshConfigBlock)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(sshConfigBlock, 'config')}
                    className={codeCopyButtonClass}
                    aria-label="Copy ssh config"
                  >
                    {copiedField === 'config' ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5 leading-relaxed">
                  In VS Code or Cursor: click the green remote indicator in the bottom-left corner (or press <span className="font-mono">Cmd/Ctrl+Shift+P</span>) -&gt; run <span className="font-mono">Remote-SSH: Connect to Host...</span> -&gt; select <span className="font-mono">kortix-sandbox</span>.
                </p>
              </div>

              <div className="rounded-lg border border-border/30 bg-muted/15 px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-medium text-foreground/70">Shortcut host (recommended)</p>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  Add the host config once, then connect anytime with <span className="font-mono text-foreground/70">ssh kortix-sandbox</span>.
                </p>
                <div className="relative">
                  <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-md px-2.5 py-2 pr-14 whitespace-pre-wrap break-all select-all text-zinc-200 overflow-x-hidden shadow-inner">
                    {renderShellHighlighted(installConfigCommand)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installConfigCommand, 'cfg-install')}
                    className={codeCopyButtonClass}
                    aria-label="Copy config install command"
                  >
                    {copiedField === 'cfg-install' ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <div className="relative">
                  <pre className="max-w-full text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-md px-2.5 py-2 pr-14 whitespace-pre-wrap break-all select-all text-zinc-200 overflow-x-hidden shadow-inner">
                    {renderShellHighlighted('ssh kortix-sandbox')}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('ssh kortix-sandbox', 'ssh-short')}
                    className={codeCopyButtonClass}
                    aria-label="Copy ssh shortcut command"
                  >
                    {copiedField === 'ssh-short' ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Advanced */}
              <div className="border-t border-border/30 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", showAdvanced && "rotate-180")} />
                  Manual setup
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    {/* Combined one-liner */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">One-liner (Setup + Connect)</label>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 min-w-0 text-[10px] font-mono bg-[#0b1020] border border-[#1f2a44] rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-all select-all text-zinc-200 shadow-inner">
                          {renderShellHighlighted(oneLiner)}
                        </code>
                        <button type="button" onClick={() => copyToClipboard(oneLiner, 'cmd')} className={copyIconButtonBaseClass}>
                          {copiedField === 'cmd' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground/30" />}
                        </button>
                      </div>
                    </div>

                    {/* Private Key */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Private Key</label>
                      <div className="relative">
                        <pre className="max-w-full text-[10px] font-mono bg-muted/20 border border-border/40 rounded-md px-2.5 py-2 whitespace-pre-wrap break-all select-all text-foreground/60 overflow-x-hidden max-h-[140px] overflow-y-auto">
                          {pk}
                        </pre>
                        <div className="absolute top-1.5 right-1.5 flex gap-1">
                          <button type="button" onClick={() => copyToClipboard(pk, 'pk')} className={copyIconButtonBaseClass} title="Copy key">
                            {copiedField === 'pk' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground/30" />}
                          </button>
                          <button type="button" onClick={savePrivateKey} className={copyIconButtonBaseClass} title="Download key file">
                            <Download className="h-3 w-3 text-muted-foreground/30" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Public Key */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Public Key</label>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 min-w-0 text-[10px] font-mono bg-muted/30 border border-border/40 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-all select-all text-foreground/70">
                          {sshResult.public_key}
                        </code>
                        <button type="button" onClick={() => copyToClipboard(sshResult.public_key, 'pub')} className={copyIconButtonBaseClass}>
                          {copiedField === 'pub' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground/30" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end pt-1 border-t border-border/30">
                <button
                  type="button"
                  className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Regenerate'}
                </button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
