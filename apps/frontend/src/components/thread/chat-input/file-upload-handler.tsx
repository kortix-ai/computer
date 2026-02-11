'use client';

import React, { forwardRef, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { fileListKeys, fileContentKeys, uploadFile } from '@/features/files';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UploadedFile } from './chat-input';
import { normalizeFilenameToNFC, normalizeMimeType } from '@agentpress/shared';
import JSZip from 'jszip';
import {
  UPLOAD_LIMITS,
  ALLOWED_EXTENSIONS,
  isAllowedFile,
  isExtractableArchive,
  formatFileSize,
} from '@/lib/constants/upload-limits';

const ALLOWED_EXTENSIONS_STRING = ALLOWED_EXTENSIONS.join(',');


const handleLocalFilesOptimistic = async (
  files: File[],
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
) => {
  const processedFiles: File[] = [];
  
  for (const file of files) {
    if (isExtractableArchive(file)) {
      const extracted = await extractZipFiles(file);
      processedFiles.push(...extracted);
    } else {
      const validation = isAllowedFile(file);
      if (!validation.allowed) {
        toast.error(`${file.name}: ${validation.reason}`);
        continue;
      }
      processedFiles.push(file);
    }
  }
  
  if (processedFiles.length === 0) return;

  const newUploadedFiles: UploadedFile[] = processedFiles.map((file) => {
    const normalizedName = normalizeFilenameToNFC(file.name);
    const fileId = crypto.randomUUID();

    return {
      name: normalizedName,
      path: `/workspace/uploads/${normalizedName}`,
      size: file.size,
      type: file.type || 'application/octet-stream',
      localUrl: URL.createObjectURL(file),
      fileId,
      status: 'pending' as const,
    };
  });

  setPendingFiles((prevFiles) => [...prevFiles, ...processedFiles]);
  setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);
};

const extractZipFiles = async (zipFile: File): Promise<File[]> => {
  try {
    const zip = await JSZip.loadAsync(zipFile);
    const extractedFiles: File[] = [];
    let totalSize = 0;
    let fileCount = 0;
    
    const entries = Object.entries(zip.files).filter(([_, file]) => !file.dir);
    
    if (entries.length > UPLOAD_LIMITS.MAX_ZIP_FILES) {
      toast.error(`Zip contains too many files (${entries.length}). Max: ${UPLOAD_LIMITS.MAX_ZIP_FILES}`);
      return [];
    }
    
    for (const [path, file] of entries) {
      const filename = path.split('/').pop() || path;
      const content = await file.async('blob');
      
      totalSize += content.size;
      if (totalSize > UPLOAD_LIMITS.MAX_ZIP_TOTAL_SIZE_BYTES) {
        toast.error(`Zip total size exceeds ${formatFileSize(UPLOAD_LIMITS.MAX_ZIP_TOTAL_SIZE_BYTES)} limit`);
        return [];
      }
      
      if (content.size > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
        toast.warning(`Skipping ${filename}: exceeds ${UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB limit`);
        continue;
      }
      
      const ext = '.' + filename.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
        toast.warning(`Skipping ${filename}: unsupported file type`);
        continue;
      }
      
      const rawMimeType = content.type || 'application/octet-stream';
      const normalizedMimeType = normalizeMimeType(rawMimeType);
      const extractedFile = new File([content], filename, { type: normalizedMimeType });
      extractedFiles.push(extractedFile);
      fileCount++;
    }
    
    if (fileCount > 0) {
      toast.success(`Extracted ${fileCount} files from ${zipFile.name}`);
    }
    
    return extractedFiles;
  } catch (error) {
    console.error('Failed to extract zip:', error);
    toast.error(`Failed to extract ${zipFile.name}`);
    return [];
  }
};

const handleLocalFiles = async (
  files: File[],
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setIsUploading?: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  const processedFiles: File[] = [];
  
  for (const file of files) {
    if (isExtractableArchive(file)) {
      const extracted = await extractZipFiles(file);
      processedFiles.push(...extracted);
    } else {
      const validation = isAllowedFile(file);
      if (!validation.allowed) {
        toast.error(`${file.name}: ${validation.reason}`);
        continue;
      }
      processedFiles.push(file);
    }
  }
  
  const filteredFiles = processedFiles;

  if (filteredFiles.length === 0) return;

  const newUploadedFiles: UploadedFile[] = filteredFiles.map((file) => {
    const normalizedName = normalizeFilenameToNFC(file.name);
    const fileId = crypto.randomUUID();

    return {
      name: normalizedName,
      path: `/workspace/uploads/${normalizedName}`,
      size: file.size,
      type: file.type || 'application/octet-stream',
      localUrl: URL.createObjectURL(file),
      fileId,
      status: 'pending' as const,
    };
  });

  setPendingFiles((prevFiles) => [...prevFiles, ...filteredFiles]);
  setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);
};

const uploadFiles = async (
  files: File[],
  _sandboxId: string,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>,
  messages: any[] = [],
  queryClient?: any,
  setPendingFiles?: React.Dispatch<React.SetStateAction<File[]>>,
) => {
  try {
    setIsUploading(true);

    const fileUploadResults: Array<{ originalName: string; uploadedFile: UploadedFile }> = [];

    for (const file of files) {
      if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
        toast.error(`File size exceeds ${UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB limit: ${file.name}`);
        continue;
      }

      const normalizedName = normalizeFilenameToNFC(file.name);
      const uploadPath = `/workspace/uploads/${normalizedName}`;

      // Upload via OpenCode server (no auth needed, no sandbox dependency)
      const uploadBlob = new window.File([file], normalizedName, { type: file.type });
      const results = await uploadFile(uploadBlob, '/workspace/uploads');

      const actualPath = results?.[0]?.path || uploadPath;
      const finalFilename = actualPath.split('/').pop() || normalizedName;

      // If file was already in chat and we have queryClient, invalidate its cache
      const isFileInChat = messages.some(message => {
        const content = typeof message.content === 'string' ? message.content : '';
        return content.includes(`[Uploaded File: ${actualPath}]`);
      });

      if (isFileInChat && queryClient) {
        queryClient.removeQueries({ queryKey: fileContentKeys.all });
        queryClient.invalidateQueries({ queryKey: fileListKeys.all });
      }

      fileUploadResults.push({
        originalName: normalizedName,
        uploadedFile: {
          name: finalFilename,
          path: actualPath,
          size: file.size,
          type: file.type || 'application/octet-stream',
        },
      });

      toast.success(`File uploaded: ${finalFilename}`);
    }

    setUploadedFiles((prev) => {
      const updated = [...prev];
      for (const { originalName, uploadedFile } of fileUploadResults) {
        const index = updated.findIndex(f => normalizeFilenameToNFC(f.name) === normalizeFilenameToNFC(originalName) && f.status === 'pending');
        if (index !== -1) {
          updated[index] = { ...updated[index], ...uploadedFile, status: 'ready' as const };
        } else {
          updated.push({ ...uploadedFile, status: 'ready' as const });
        }
      }
      return updated;
    });

    if (setPendingFiles) {
      setPendingFiles([]);
    }
  } catch (error) {
    console.error('File upload failed:', error);
    toast.error(
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : 'Failed to upload file',
    );
  } finally {
    setIsUploading(false);
  }
};

const uploadFilesToProject = async (
  files: File[],
  _projectId: string,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>,
  setPendingFiles?: React.Dispatch<React.SetStateAction<File[]>>,
) => {
  // Delegate to uploadFiles — both now go through OpenCode server
  await uploadFiles(files, '', setUploadedFiles, setIsUploading, [], undefined, setPendingFiles);
};

const handleFiles = async (
  files: File[],
  sandboxId: string | undefined,
  projectId: string | undefined,
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>,
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>,
  messages: any[] = [],
  queryClient?: any,
) => {
  // Process files (extract zips, validate)
  const processedFiles: File[] = [];
  
  for (const file of files) {
    if (isExtractableArchive(file)) {
      const extracted = await extractZipFiles(file);
      processedFiles.push(...extracted);
    } else {
      const validation = isAllowedFile(file);
      if (!validation.allowed) {
        toast.error(`${file.name}: ${validation.reason}`);
        continue;
      }
      processedFiles.push(file);
    }
  }
  
  if (processedFiles.length === 0) return;

  // Just store files locally - no upload yet (will upload after agent start returns sandbox_id)
  for (const file of processedFiles) {
    const normalizedName = normalizeFilenameToNFC(file.name);

    // Add to uploaded files with ready status and local preview
    setUploadedFiles((prev) => [...prev, {
      name: normalizedName,
      path: `/workspace/uploads/${normalizedName}`,
      size: file.size,
      type: file.type || 'application/octet-stream',
      localUrl: URL.createObjectURL(file),
      status: 'ready' as const,
    }]);
  }

  // Store files in pendingFiles for later upload
  setPendingFiles((prevFiles) => [...prevFiles, ...processedFiles]);
};

interface FileUploadHandlerProps {
  loading: boolean;
  disabled: boolean;
  isAgentRunning: boolean;
  isUploading: boolean;
  sandboxId?: string;
  projectId?: string;
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
  messages?: any[]; // Add messages prop
  isLoggedIn?: boolean;
}

export const FileUploadHandler = memo(forwardRef<
  HTMLInputElement,
  FileUploadHandlerProps
>(
  (
    {
      loading,
      disabled,
      isAgentRunning,
      isUploading,
      sandboxId,
      projectId,
      setPendingFiles,
      setUploadedFiles,
      setIsUploading,
      messages = [],
      isLoggedIn = true,
    },
    ref,
  ) => {
    const queryClient = useQueryClient();
    // Clean up object URLs when component unmounts
    useEffect(() => {
      return () => {
        // Clean up any object URLs to avoid memory leaks
        setUploadedFiles(prev => {
          prev.forEach(file => {
            if (file.localUrl) {
              URL.revokeObjectURL(file.localUrl);
            }
          });
          return prev;
        });
      };
    }, []);

    const handleFileUpload = () => {
      if (ref && 'current' in ref && ref.current) {
        ref.current.click();
      }
    };

    const processFileUpload = async (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      if (!event.target.files || event.target.files.length === 0) return;

      const files = Array.from(event.target.files);
      // Use the helper function instead of the static method
      handleFiles(
        files,
        sandboxId,
        projectId,
        setPendingFiles,
        setUploadedFiles,
        setIsUploading,
        messages,
        queryClient,
      );

      event.target.value = '';
    };

    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                type="button"
                onClick={handleFileUpload}
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0 bg-transparent border-[1.5px] border-border rounded-2xl text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center justify-center cursor-pointer"
                disabled={
                  !isLoggedIn || loading || (disabled && !isAgentRunning) || isUploading
                }
              >
                {isUploading ? (
                  <KortixLoader size="small" />
                ) : (
                  <Paperclip className="h-4 w-4" strokeWidth={2} />
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{isLoggedIn ? 'Attach files' : 'Please login to attach files'}</p>
          </TooltipContent>
        </Tooltip>

        <input
          type="file"
          ref={ref}
          className="hidden"
          onChange={processFileUpload}
          multiple
          accept={ALLOWED_EXTENSIONS_STRING}
        />
      </>
    );
  },
));

FileUploadHandler.displayName = 'FileUploadHandler';

export const uploadPendingFilesToProject = async (
  files: File[],
  _projectId: string,
  onProgress?: (fileIndex: number, status: 'uploading' | 'ready' | 'error', error?: string) => void,
): Promise<{ success: boolean; uploadedPaths: string[] }> => {
  const uploadedPaths: string[] = [];
  let allSuccess = true;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, 'uploading');

    try {
      if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
        throw new Error(`File size exceeds ${UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB limit`);
      }

      const normalizedName = normalizeFilenameToNFC(file.name);
      const uploadBlob = new window.File([file], normalizedName, { type: file.type });
      const results = await uploadFile(uploadBlob, '/workspace/uploads');
      const actualPath = results?.[0]?.path || `/workspace/uploads/${normalizedName}`;
      uploadedPaths.push(actualPath);

      onProgress?.(i, 'ready');
    } catch (error) {
      console.error(`Failed to upload file ${file.name}:`, error);
      onProgress?.(i, 'error', error instanceof Error ? error.message : 'Upload failed');
      allSuccess = false;
    }
  }

  return { success: allSuccess, uploadedPaths };
};

export { handleFiles, handleLocalFiles, handleLocalFilesOptimistic, uploadFiles, uploadPendingFilesToProject as uploadFilesToProjectDirect };
