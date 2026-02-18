'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreateSkill } from '../hooks/use-create-skill';
import { useUpdateSkill } from '../hooks/use-update-skill';
import { useSkillsStore } from '../store/skills-store';
import {
  validateSkillName,
  validateSkillDescription,
  parseSkillFileContent,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from '../types';

// ---------------------------------------------------------------------------
// Skill Editor Dialog
// ---------------------------------------------------------------------------

export function SkillEditor() {
  const isEditorOpen = useSkillsStore((s) => s.isEditorOpen);
  const editorMode = useSkillsStore((s) => s.editorMode);
  const editingSkill = useSkillsStore((s) => s.editingSkill);
  const closeEditor = useSkillsStore((s) => s.closeEditor);

  const createMutation = useCreateSkill();
  const updateMutation = useUpdateSkill();

  const isCreate = editorMode === 'create';
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Form state
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [body, setBody] = React.useState('');

  // Validation state
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form when dialog opens or skill changes
  React.useEffect(() => {
    if (!isEditorOpen) return;

    if (editingSkill && editorMode === 'edit') {
      const parsed = parseSkillFileContent(editingSkill.content);
      setName(editingSkill.name);
      setDescription(parsed?.description ?? editingSkill.description);
      setBody(parsed?.body ?? '');
    } else {
      setName('');
      setDescription('');
      setBody('');
    }
    setNameError(null);
    setDescriptionError(null);
    setSubmitError(null);
  }, [isEditorOpen, editingSkill, editorMode]);

  // No useCallback — plain handler reads state directly, no stale closure risk
  async function handleSubmit() {
    // Validate
    const nErr = isCreate ? validateSkillName(name) : null;
    const dErr = validateSkillDescription(description);
    setNameError(nErr);
    setDescriptionError(dErr);
    if (nErr || dErr) return;

    setSubmitError(null);

    try {
      if (isCreate) {
        await createMutation.mutateAsync({ name, description, body });
      } else if (editingSkill) {
        await updateMutation.mutateAsync({
          name: editingSkill.name,
          input: {
            location: editingSkill.location,
            description,
            body,
          },
        });
      }
      closeEditor();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setSubmitError(message);
    }
  }

  return (
    <Dialog open={isEditorOpen} onOpenChange={(open) => { if (!open) closeEditor(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Create Skill' : 'Edit Skill'}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Create a new skill. It will be saved to .opencode/skills/ in your project.'
              : `Editing skill "${editingSkill?.name}"`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Name field (only editable in create mode) */}
          <div className="space-y-2">
            <Label htmlFor="skill-name">Name</Label>
            {isCreate ? (
              <>
                <Input
                  id="skill-name"
                  placeholder="my-skill-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.toLowerCase());
                    setNameError(null);
                  }}
                  maxLength={SKILL_NAME_MAX_LENGTH}
                  className={nameError ? 'border-destructive' : ''}
                />
                <p className="text-[11px] text-muted-foreground">
                  Lowercase letters, numbers, and hyphens. This becomes the directory name.
                </p>
                {nameError && (
                  <p className="text-[11px] text-destructive">{nameError}</p>
                )}
              </>
            ) : (
              <Input
                id="skill-name"
                value={name}
                disabled
                className="opacity-60"
              />
            )}
          </div>

          {/* Description field */}
          <div className="space-y-2">
            <Label htmlFor="skill-description">Description</Label>
            <Textarea
              id="skill-description"
              placeholder="Describe what this skill does and when it should be loaded..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionError(null);
              }}
              maxLength={SKILL_DESCRIPTION_MAX_LENGTH}
              rows={3}
              className={descriptionError ? 'border-destructive' : ''}
            />
            <p className="text-[11px] text-muted-foreground">
              This description is always visible to agents. Be specific about trigger conditions.
              {description.length > 0 && (
                <span className="ml-1 tabular-nums">
                  ({description.length}/{SKILL_DESCRIPTION_MAX_LENGTH})
                </span>
              )}
            </p>
            {descriptionError && (
              <p className="text-[11px] text-destructive">{descriptionError}</p>
            )}
          </div>

          {/* Body field */}
          <div className="space-y-2">
            <Label htmlFor="skill-body">Content (Markdown)</Label>
            <Textarea
              id="skill-body"
              placeholder={"# My Skill\n\nFull instructions, workflows, and reference material..."}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Markdown content that gets loaded into the agent&apos;s context when the skill is activated.
            </p>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">{submitError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={closeEditor}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isCreate ? 'Create Skill' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
