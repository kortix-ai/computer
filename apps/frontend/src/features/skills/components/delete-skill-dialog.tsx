'use client';

import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDeleteSkill } from '../hooks/use-delete-skill';
import { useSkillsStore } from '../store/skills-store';

// ---------------------------------------------------------------------------
// Delete Skill Confirmation Dialog
// ---------------------------------------------------------------------------

export function DeleteSkillDialog() {
  const { isDeleteDialogOpen, deletingSkill, closeDeleteDialog } =
    useSkillsStore();

  const deleteSkill = useDeleteSkill();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deletingSkill) return;
    setError(null);

    try {
      await deleteSkill.mutateAsync({ location: deletingSkill.location });
      closeDeleteDialog();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete skill',
      );
    }
  }, [deletingSkill, deleteSkill, closeDeleteDialog]);

  return (
    <AlertDialog
      open={isDeleteDialogOpen}
      onOpenChange={(open) => !open && closeDeleteDialog()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Skill</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">
              {deletingSkill?.name}
            </span>
            ? This will permanently remove the skill directory and its SKILL.md
            file. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteSkill.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteSkill.isPending}
          >
            {deleteSkill.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            )}
            Delete Skill
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
