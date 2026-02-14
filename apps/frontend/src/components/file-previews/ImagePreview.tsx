/**
 * ImagePreview - Image file preview component
 */

import React from 'react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { cn } from '@/lib/utils';
import { getFilename, getFileIcon } from '@/lib/utils/file-utils';
import { useFileContent } from '@/features/files';

export interface ImagePreviewProps {
    filepath: string;
    sandboxId?: string;
    localPreviewUrl?: string;
    onClick?: () => void;
    className?: string;
    customStyle?: React.CSSProperties;
    uploadStatus?: 'pending' | 'uploading' | 'ready' | 'error';
    isGridLayout?: boolean;
}

export function ImagePreview({
    filepath,
    sandboxId,
    localPreviewUrl,
    onClick,
    className,
    customStyle,
    uploadStatus,
    isGridLayout = false,
}: ImagePreviewProps) {
    const filename = getFilename(filepath);
    const IconComponent = getFileIcon('image');
    
    // Skip fetch if we have a local preview
    const needsFetch = !localPreviewUrl && !!filepath;
    
    const { data: fileContentData, isLoading, error } = useFileContent(
        needsFetch ? filepath : null,
        { enabled: needsFetch }
    );
    const retryCount = 0;
    // Convert base64 image content to blob URL
    const imageUrl = React.useMemo(() => {
        if (!fileContentData?.content) return null;
        if (fileContentData.encoding === 'base64') {
            const binary = atob(fileContentData.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: fileContentData.mimeType || 'image/png' });
            return URL.createObjectURL(blob);
        }
        return null;
    }, [fileContentData]);
    
    const [imageLoaded, setImageLoaded] = React.useState(false);
    
    // Reset image loaded state when URL changes
    React.useEffect(() => {
        setImageLoaded(false);
    }, [imageUrl, localPreviewUrl, filepath]);
    
    // If we have a local preview, show it immediately - no loading needed
    const hasLocalPreview = !!localPreviewUrl;
    
    const isSandboxFile = !filepath.startsWith('http://') && !filepath.startsWith('https://') && !hasLocalPreview;
    const waitingForSandboxId = false;
    const isStillRetrying = retryCount < 15;
    const hasError = error && !isStillRetrying;
    
    // Only show loading state if we DON'T have a local preview and we're waiting for sandbox
    if (!hasLocalPreview && (isLoading || waitingForSandboxId) && isStillRetrying) {
        return (
            <div
                className={cn(
                    "relative rounded-2xl",
                    "border border-border/50",
                    "bg-muted/20",
                    "flex flex-col items-center justify-center gap-2",
                    isGridLayout ? "w-full aspect-[4/3] min-h-[200px]" : "h-[54px] w-[54px]",
                    className
                )}
                style={customStyle}
                title="Loading file..."
            >
                <KortixLoader size="medium" />
                {retryCount > 0 && (
                    <div className="text-xs text-muted-foreground text-center px-2">
                        Loading... (attempt {retryCount + 1})
                    </div>
                )}
            </div>
        );
    }
    
    // Show error state
    if (hasError) {
        return (
            <button
                onClick={onClick}
                className={cn(
                    "group relative rounded-xl cursor-pointer",
                    "border border-red-500/20 dark:border-red-500/30",
                    "bg-red-500/5 dark:bg-red-500/10",
                    "p-0 overflow-hidden",
                    "flex flex-col items-center justify-center gap-2",
                    isGridLayout ? "w-full aspect-[4/3]" : "h-[54px] w-[54px]",
                    className
                )}
                style={{
                    ...customStyle,
                    minHeight: isGridLayout ? '200px' : undefined,
                    height: isGridLayout ? 'auto' : undefined
                }}
                title={filename}
            >
                <IconComponent className="h-6 w-6 text-red-500" />
                <div className="text-xs text-red-500 font-medium">Failed to load</div>
                <div className="text-[10px] text-red-500/70">Click to open</div>
            </button>
        );
    }
    
    const imageSrc = localPreviewUrl || imageUrl;
    
    // Don't render if no valid image source
    if (!imageSrc) {
        return (
            <div
                className={cn(
                    "relative rounded-2xl",
                    "border border-border/50",
                    "bg-muted/20",
                    "flex flex-col items-center justify-center gap-2",
                    isGridLayout ? "w-full aspect-[4/3] min-h-[200px]" : "h-[54px] w-[54px]",
                    className
                )}
                style={customStyle}
                title="Loading file..."
            >
                <KortixLoader size="medium" />
            </div>
        );
    }
    
    return (
        <button
            onClick={uploadStatus === 'uploading' ? undefined : onClick}
            className={cn(
                "group relative rounded-2xl",
                uploadStatus === 'uploading' ? "cursor-default" : "cursor-pointer",
                "border border-black/10 dark:border-white/10",
                "bg-black/5 dark:bg-black/20",
                "p-0 overflow-hidden",
                "flex items-center justify-center",
                isGridLayout ? "w-full" : "h-[54px] inline-block",
                className
            )}
            style={{
                ...customStyle,
                minHeight: isGridLayout && !imageLoaded ? '200px' : undefined,
                aspectRatio: isGridLayout && !imageLoaded ? '4/3' : undefined,
                height: isGridLayout ? 'auto' : customStyle?.height
            }}
            title={uploadStatus === 'uploading' ? 'Uploading...' : filename}
        >
            {/* Upload progress overlay */}
            {(uploadStatus === 'uploading' || (uploadStatus === 'pending' && sandboxId)) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                    <KortixLoader size="small" variant="white" />
                </div>
            )}
            
            {/* Upload error overlay */}
            {uploadStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 z-20">
                    <div className="text-xs text-red-500 font-medium bg-background/90 px-2 py-1 rounded">Failed</div>
                </div>
            )}
            
            {/* Loading spinner overlay - only show when no local preview and image not loaded */}
            {!imageLoaded && isGridLayout && !uploadStatus && !hasLocalPreview && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-black/5 to-black/10 dark:from-white/5 dark:to-white/10 z-10">
                    <KortixLoader size="small" />
                    {retryCount > 0 && (
                        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                            Retrying... (attempt {retryCount + 1})
                        </div>
                    )}
                </div>
            )}
            
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageSrc}
                alt={filename}
                className={cn(
                    isGridLayout ? "w-full h-auto" : "h-full w-auto",
                    "object-contain",
                    !imageLoaded && isGridLayout ? "opacity-0" : "opacity-100"
                )}
                style={{
                    objectPosition: "center",
                    maxHeight: isGridLayout ? customStyle?.maxHeight : undefined
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
            />
        </button>
    );
}

