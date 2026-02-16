'use client';

import { useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  ChevronRight,
  FolderOpen,
  Globe,
  Laptop,
  ExternalLink,
  FileText,
  Copy,
  Check,
  Pencil,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { UnifiedMarkdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSkills, useUpdateSkill } from '@/features/skills/hooks';
import { getSkillSource, SOURCE_META, parseSkillFileContent } from '@/features/skills/types';
import type { SkillSource } from '@/features/skills/types';
import { openTabAndNavigate } from '@/stores/tab-store';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Source icon mapping
// ---------------------------------------------------------------------------

const SOURCE_ICONS: Record<SkillSource, typeof Sparkles> = {
  project: Laptop,
  global: Globe,
  external: ExternalLink,
};

// ---------------------------------------------------------------------------
// Skill Detail Page
// ---------------------------------------------------------------------------

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const skillName = decodeURIComponent(params.skillName as string);

  const { data: skills, isLoading, error } = useSkills();
  const updateSkill = useUpdateSkill();
  const [copied, setCopied] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editBody, setEditBody] = useState('');

  const skill = useMemo(() => {
    if (!skills) return null;
    return skills.find((s) => s.name === skillName) ?? null;
  }, [skills, skillName]);

  const parsed = useMemo(() => {
    if (!skill?.content) return null;
    return parseSkillFileContent(skill.content);
  }, [skill?.content]);

  const source = skill ? getSkillSource(skill.location) : 'project';
  const isEditable = source === 'project';

  const handleCopyContent = async () => {
    if (!skill?.content) return;
    await navigator.clipboard.writeText(skill.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = useCallback(() => {
    if (!parsed) return;
    setEditDescription(parsed.description || '');
    setEditBody(parsed.body || '');
    setIsEditing(true);
  }, [parsed]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditDescription('');
    setEditBody('');
  }, []);

  const saveChanges = useCallback(async () => {
    if (!skill) return;
    try {
      await updateSkill.mutateAsync({
        name: skill.name,
        input: {
          location: skill.location,
          description: editDescription,
          body: editBody,
        },
      });
      setIsEditing(false);
      toast.success('Skill saved successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save skill');
    }
  }, [skill, editDescription, editBody, updateSkill]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <KortixLoader size="medium" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load skills</p>
          </div>
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-lg border border-dashed p-12 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Skill &ldquo;{skillName}&rdquo; not found
            </p>
            <Link
              href="/skills"
              className="text-xs text-muted-foreground/60 hover:text-foreground mt-2 inline-block underline underline-offset-2 transition-colors"
            >
              Back to skills
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const meta = SOURCE_META[source];
  const SourceIcon = SOURCE_ICONS[source];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
          <button
            onClick={() => {
              openTabAndNavigate({
                id: 'page:/workspace',
                title: 'Workspace',
                type: 'page',
                href: '/workspace',
              }, router);
            }}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Workspace
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium truncate max-w-[300px]">{skill.name}</span>
        </nav>

        {/* Two-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Main content */}
          <div className="flex-1 min-w-0">
            {/* Skill header card */}
            <div className="rounded-xl border border-border/50 bg-card p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Sparkles className="h-7 w-7" />
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight">{skill.name}</h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn('inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider', meta.color)}>
                      <SourceIcon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                </div>

                {/* Edit / Save / Cancel buttons */}
                {isEditable && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditing}
                          disabled={updateSkill.isPending}
                          className="gap-1.5"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveChanges}
                          disabled={updateSkill.isPending}
                          className="gap-1.5"
                        >
                          {updateSkill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          {updateSkill.isPending ? 'Saving...' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startEditing}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {isEditing ? (
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">
                    Description
                  </label>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                    placeholder="Skill description / trigger keywords..."
                  />
                </div>
              ) : skill.description ? (
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                  {skill.description}
                </p>
              ) : null}
            </div>

            {/* Skill Content */}
            {isEditing ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    Skill Instructions
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">Markdown supported</span>
                </div>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full min-h-[500px] border-0 rounded-none font-mono text-sm resize-y focus-visible:ring-0 focus-visible:ring-offset-0 p-5"
                  placeholder="# Skill Instructions&#10;&#10;Write the skill body here..."
                />
              </div>
            ) : parsed?.body ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    Skill Instructions
                  </span>
                  <button
                    onClick={handleCopyContent}
                    className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="p-5">
                  <UnifiedMarkdown content={parsed.body} />
                </div>
              </div>
            ) : skill.content ? (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">
                    Raw Content
                  </span>
                </div>
                <div className="p-5">
                  <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {skill.content}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <p className="text-sm text-muted-foreground">No content available</p>
                {isEditable && !isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditing}
                    className="mt-2 gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Add content
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
            {/* Metadata */}
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/50">
                <h2 className="text-sm font-semibold">Details</h2>
              </div>

              <div className="p-4 space-y-4">
                {/* Source */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <SourceIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Source</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm capitalize">{source}</p>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Location</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-[11px] font-mono text-muted-foreground break-all leading-relaxed">
                      {skill.location}
                    </p>
                  </div>
                </div>

                {/* Usage */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Usage</span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <code className="text-[11px] font-mono text-foreground/80">
                      skill({'{'}  name: &quot;{skill.name}&quot; {'}'})
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Description card */}
            {!isEditing && parsed?.description && (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/50">
                  <h2 className="text-sm font-semibold">Trigger Description</h2>
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {parsed.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
