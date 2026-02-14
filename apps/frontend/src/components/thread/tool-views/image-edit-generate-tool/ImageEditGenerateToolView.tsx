import React, { useMemo, useState, useRef } from 'react';
import { AlertTriangle, Play, Pause, Wand2, CheckCircle, Download, Video as VideoIcon, Image as ImageIcon } from 'lucide-react';
import { ToolViewProps } from '../types';
import { extractImageEditGenerateData } from './_utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFileContent } from '@/features/files';
import { VideoRenderer } from '@/components/file-renderers/video-renderer';

const BLOB_COLORS = [
  'from-zinc-300/60 to-zinc-400/60',
  'from-zinc-350/60 to-zinc-450/60',
  'from-neutral-300/60 to-neutral-400/60',
  'from-stone-300/60 to-stone-400/60',
  'from-gray-300/60 to-gray-400/60',
  'from-slate-300/60 to-slate-400/60',
];

function ShimmerBox({ aspectVideo = false }: { aspectVideo?: boolean }) {
  // Use ref to store color so it doesn't change on re-renders
  const colorRef = useRef(BLOB_COLORS[Math.floor(Math.random() * BLOB_COLORS.length)]);
  const [showColor, setShowColor] = useState(false);

  // Fade in color after a delay
  React.useEffect(() => {
    const timer = setTimeout(() => setShowColor(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`relative w-full ${aspectVideo ? 'aspect-video' : 'aspect-square'} rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700/50`}>
      {/* Gray base layer - contained with rounded corners */}
      <div className="absolute inset-[-50%] bg-gradient-to-br from-zinc-300/60 to-zinc-400/60 dark:from-zinc-600/60 dark:to-zinc-700/60 blur-2xl" />
      {/* Color layer that fades in - contained with rounded corners */}
      <div
        className={`absolute inset-[-50%] bg-gradient-to-br ${colorRef.current} blur-2xl transition-opacity duration-1000`}
        style={{ opacity: showColor ? 1 : 0 }}
      />
      <div className="absolute inset-0 bg-zinc-100/30 dark:bg-zinc-900/30 backdrop-blur-sm rounded-2xl" />
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          animation: 'media-shimmer 1.8s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes media-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function ImageDisplay({ filePath }: { filePath: string }) {
  const { data: fileContent, isLoading } = useFileContent(filePath, {
    enabled: !!filePath,
  });

  const imageUrl = React.useMemo(() => {
    if (!fileContent?.content) return null;
    if (fileContent.encoding === 'base64') {
      const binary = atob(fileContent.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: fileContent.mimeType || 'image/png' });
      return URL.createObjectURL(blob);
    }
    return null;
  }, [fileContent]);

  if (isLoading || !imageUrl) {
    return <ShimmerBox />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={filePath}
      className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-700/50 object-contain"
    />
  );
}

function VideoDisplay({ filePath }: { filePath: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Use OpenCode file content hook
  const { data: videoContent, isLoading: isBlobLoading } = useFileContent(filePath, {
    enabled: !!filePath,
  });

  // Create and manage blob URL from base64 content
  React.useEffect(() => {
    if (videoContent?.content && videoContent.encoding === 'base64') {
      const binary = atob(videoContent.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: videoContent.mimeType || 'video/mp4' });
      const newUrl = URL.createObjectURL(blob);
      setVideoUrl(newUrl);

      return () => {
        URL.revokeObjectURL(newUrl);
        setVideoUrl(null);
      };
    } else {
      setVideoUrl(null);
    }
  }, [videoContent]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Show shimmer while loading blob
  if (isBlobLoading || !videoUrl) {
    return <ShimmerBox aspectVideo />;
  }

  if (hasError) {
    return (
      <div className="aspect-video flex flex-col items-center justify-center p-4 text-center rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-muted/30">
        <AlertTriangle className="h-5 w-5 text-muted-foreground mb-2" />
        <p className="text-muted-foreground font-medium text-sm">Failed to load video</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700/50 bg-black">
      {isVideoLoading && (
        <div className="absolute inset-0 z-10">
          <ShimmerBox aspectVideo />
        </div>
      )}
      <div className="relative group">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full aspect-video object-contain"
          loop
          muted
          playsInline
          onLoadedData={() => setIsVideoLoading(false)}
          onError={() => {
            setHasError(true);
            setIsVideoLoading(false);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
        {/* Play/Pause overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
          onClick={togglePlay}
        >
          <div className="h-14 w-14 rounded-full bg-white/90 dark:bg-black/90 flex items-center justify-center shadow-lg">
            {isPlaying ? (
              <Pause className="h-7 w-7 text-foreground" />
            ) : (
              <Play className="h-7 w-7 text-foreground ml-0.5" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Full featured video renderer component for tool view (Computer)
// Uses the full VideoRenderer with all controls (slider, volume, etc.)
function VideoRendererFull({ filePath }: { filePath: string }) {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Fetch video content via OpenCode
  const { data: videoContent, isLoading, error: fetchError } = useFileContent(filePath, {
    enabled: !!filePath,
  });

  // Create and manage blob URL
  React.useEffect(() => {
    if (videoContent?.content && videoContent.encoding === 'base64') {
      console.log('[VideoRendererFull] Creating blob URL for video:', {
        filePath,
        contentSize: videoContent.content.length,
      });
      const binary = atob(videoContent.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: videoContent.mimeType || 'video/mp4' });
      const newUrl = URL.createObjectURL(blob);
      console.log('[VideoRendererFull] Created blob URL:', newUrl);
      setVideoUrl(newUrl);

      // Cleanup function to revoke URL when content changes or component unmounts
      return () => {
        console.log('[VideoRendererFull] Revoking blob URL:', newUrl);
        URL.revokeObjectURL(newUrl);
        setVideoUrl(null);
      };
    } else {
      console.log('[VideoRendererFull] No content available:', { videoContent, isLoading, fetchError });
      setVideoUrl(null);
    }
  }, [videoContent, filePath, isLoading, fetchError]);

  // Show shimmer while loading
  if (isLoading) {
    return <ShimmerBox aspectVideo />;
  }

  // Show error if fetch failed
  if (fetchError || (!videoContent && !isLoading)) {
    return (
      <div className="aspect-video flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-muted/30">
        <AlertTriangle className="h-10 w-10 text-zinc-500 dark:text-zinc-400 mb-3" />
        <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          Failed to load video
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {fetchError ? String(fetchError) : 'The video could not be loaded'}
        </p>
      </div>
    );
  }

  // Show error if no URL could be created
  if (!videoUrl) {
    return (
      <div className="aspect-video flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-muted/30">
        <AlertTriangle className="h-10 w-10 text-zinc-500 dark:text-zinc-400 mb-3" />
        <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          Failed to load video
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Could not create video URL
        </p>
      </div>
    );
  }

  // Video error handler
  if (hasVideoError) {
    return (
      <div className="aspect-video flex flex-col items-center justify-center p-6 text-center rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-muted/30">
        <AlertTriangle className="h-10 w-10 text-zinc-500 dark:text-zinc-400 mb-3" />
        <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          Failed to play video
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The video file may be corrupted or in an unsupported format
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl overflow-hidden">
      <VideoRenderer
        url={videoUrl}
        loop={true}
      />
    </div>
  );
}

interface ImageEditGenerateToolViewProps extends ToolViewProps {
  onFileClick?: (filePath: string) => void;
}

export function ImageEditGenerateToolView({
  toolCall,
  toolResult,
  isStreaming = false,
  project,
}: ImageEditGenerateToolViewProps) {
  const {
    generatedImagePaths,
    generatedVideoPaths,
    isVideoMode,
    error,
    batchResults,
  } = useMemo(() => {
    if (!toolCall) {
      return {
        generatedImagePaths: [] as string[],
        generatedVideoPaths: [] as string[],
        isVideoMode: false,
        error: null as string | null,
        batchResults: [] as Array<{ success: boolean; error?: string }>,
      };
    }
    return extractImageEditGenerateData(toolCall, toolResult, true);
  }, [toolCall, toolResult]);

  const imagePath = generatedImagePaths[0];
  const videoPath = generatedVideoPaths[0];
  const hasMedia = imagePath || videoPath;

  // ONLY show error if:
  // 1. Not streaming (still processing)
  // 2. We have a result (toolResult exists)
  // 3. The result explicitly failed (has error or failed batch)
  // 4. No media was produced
  const hasActualError = !isStreaming &&
    toolResult &&
    !hasMedia &&
    (!!error || (batchResults.length > 0 && !batchResults[0].success));

  const actualIsSuccess = !!(hasMedia && !hasActualError);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Get media content for download
  const { data: mediaContent } = useFileContent(videoPath || imagePath || null, {
    enabled: !!(videoPath || imagePath) && actualIsSuccess && !!toolCall,
  });

  // Create and manage download URL
  React.useEffect(() => {
    if (mediaContent?.content && mediaContent.encoding === 'base64') {
      const binary = atob(mediaContent.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mediaContent.mimeType || 'application/octet-stream' });
      const newUrl = URL.createObjectURL(blob);
      setDownloadUrl(newUrl);

      return () => {
        URL.revokeObjectURL(newUrl);
        setDownloadUrl(null);
      };
    } else {
      setDownloadUrl(null);
    }
  }, [mediaContent]);

  if (!toolCall) return null;

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = (videoPath || imagePath || 'media').split('/').pop() || 'media';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col h-full overflow-hidden bg-card">
      {/* Header */}
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-2 rounded-lg border shrink-0 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700">
              {videoPath ? (
                <VideoIcon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              ) : (
                <ImageIcon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Generate Media
              </CardTitle>
            </div>
          </div>

          {/* Download button */}
          {actualIsSuccess && downloadUrl && (
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Download</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {isStreaming || !toolResult ? (
          /* Streaming/Loading State - ALWAYS show shimmer when streaming or no result yet */
          <ShimmerBox aspectVideo={isVideoMode} />
        ) : hasActualError ? (
          /* Error State - Only after streaming complete AND actual failure */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-800/40 dark:to-zinc-900/60">
              <AlertTriangle className="h-8 w-8 text-zinc-500 dark:text-zinc-400" />
            </div>
            <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-2">
              Processing Failed
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md">
              {error || batchResults[0]?.error || 'An error occurred during processing.'}
            </p>
          </div>
        ) : videoPath ? (
          /* Success State - Show FULL video player */
          <VideoRendererFull filePath={videoPath} />
        ) : imagePath ? (
          /* Success State - Show image */
          <ImageDisplay filePath={imagePath} />
        ) : (
          /* Fallback shimmer if no media yet */
          <ShimmerBox aspectVideo={isVideoMode} />
        )}
      </CardContent>
    </Card>
  );
}
