'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import JSZip from 'jszip';
import { readFileAsBlob } from '@/features/files/api/opencode-files';

// ---------------------------------------------------------------------------
// Optional: keep the public-URL path for document rendering
// ---------------------------------------------------------------------------
let DocViewer: React.ComponentType<any> | null = null;
let DocViewerRenderers: any[] | null = null;

try {
  // Dynamic import - only used when a public URL is available
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@cyntler/react-doc-viewer');
  DocViewer = mod.default;
  DocViewerRenderers = mod.DocViewerRenderers;
} catch {
  // @cyntler/react-doc-viewer not available — client-side only
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlideData {
  index: number;
  texts: string[];
  images: { url: string; alt: string }[];
}

interface PptxRendererProps {
  content?: string | null;
  binaryUrl?: string | null;
  blob?: Blob | null;
  filePath?: string;
  fileName: string;
  className?: string;
  sandboxId?: string;
  project?: {
    sandbox?: {
      id?: string;
      sandbox_url?: string;
    };
  };
  onDownload?: () => void;
  isDownloading?: boolean;
  onFullScreen?: () => void;
}

// ---------------------------------------------------------------------------
// JSZip-based PPTX parser
// ---------------------------------------------------------------------------

async function parsePptxBlob(blob: Blob): Promise<SlideData[]> {
  const zip = await JSZip.loadAsync(blob);

  // Find all slide files
  const slideFiles: string[] = [];
  zip.forEach((path) => {
    const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) slideFiles.push(path);
  });

  // Sort by slide number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0', 10);
    return numA - numB;
  });

  const slides: SlideData[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) continue;

    const parser = new DOMParser();
    const doc = parser.parseFromString(slideXml, 'application/xml');

    // Extract text from <a:t> elements
    const textNodes = doc.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main',
      't',
    );
    const texts: string[] = [];
    const seenTexts = new Set<string>();
    for (let t = 0; t < textNodes.length; t++) {
      const text = textNodes[t].textContent?.trim();
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        texts.push(text);
      }
    }

    // Extract image references from <a:blip r:embed="rIdX">
    const blipNodes = doc.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main',
      'blip',
    );
    const embedIds: string[] = [];
    for (let b = 0; b < blipNodes.length; b++) {
      const rEmbed =
        blipNodes[b].getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'embed',
        ) || blipNodes[b].getAttribute('r:embed');
      if (rEmbed) embedIds.push(rEmbed);
    }

    // Resolve image relationships
    const slideNum = slidePath.match(/slide(\d+)/)?.[1] || '1';
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relsXml = await zip.file(relsPath)?.async('text');

    const images: { url: string; alt: string }[] = [];

    if (relsXml && embedIds.length > 0) {
      const relsDoc = parser.parseFromString(relsXml, 'application/xml');
      const relNodes = relsDoc.getElementsByTagName('Relationship');

      const relMap = new Map<string, string>();
      for (let r = 0; r < relNodes.length; r++) {
        const id = relNodes[r].getAttribute('Id');
        const target = relNodes[r].getAttribute('Target');
        if (id && target) relMap.set(id, target);
      }

      for (const embedId of embedIds) {
        const target = relMap.get(embedId);
        if (!target) continue;

        // target is relative like "../media/image1.png"
        const mediaPath = target.startsWith('..')
          ? `ppt/${target.replace('../', '')}`
          : target.startsWith('ppt/')
            ? target
            : `ppt/slides/${target}`;

        const mediaFile = zip.file(mediaPath);
        if (mediaFile) {
          const imageBlob = await mediaFile.async('blob');
          // Determine MIME type from extension
          const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
          const mimeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg+xml',
            webp: 'image/webp',
            bmp: 'image/bmp',
            tiff: 'image/tiff',
            emf: 'image/emf',
            wmf: 'image/wmf',
          };
          const mime = mimeMap[ext] || 'image/png';
          const typedBlob = new Blob([imageBlob], { type: mime });
          const url = URL.createObjectURL(typedBlob);
          images.push({ url, alt: `Slide ${i + 1} image` });
        }
      }
    }

    slides.push({ index: i, texts, images });
  }

  return slides;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PptxRenderer({
  blob,
  binaryUrl,
  filePath,
  fileName,
  className,
  project,
  onDownload,
  isDownloading,
}: PptxRendererProps) {
  const [slides, setSlides] = useState<SlideData[] | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if we have a public URL for the doc-viewer path
  const hasPublicUrl = !!(project?.sandbox?.sandbox_url && filePath);

  // Parse PPTX from blob
  useEffect(() => {
    if (hasPublicUrl) {
      // Will use DocViewer instead
      setIsLoading(false);
      return;
    }

    if (!blob && !binaryUrl) {
      setIsLoading(false);
      setParseError('No file data available');
      return;
    }

    let cancelled = false;
    const imageUrls: string[] = [];

    async function parse() {
      setIsLoading(true);
      setParseError(null);
      try {
        let pptxBlob: Blob | null = null;

        // On retry, re-fetch from the file API to get fresh data
        if (retryCount > 0 && filePath) {
          pptxBlob = await readFileAsBlob(filePath);
        }

        // Fall back to the provided blob or binaryUrl
        if (!pptxBlob || pptxBlob.size < 4) {
          pptxBlob = blob ?? null;
        }
        if ((!pptxBlob || pptxBlob.size < 4) && binaryUrl) {
          const resp = await fetch(binaryUrl);
          pptxBlob = await resp.blob();
        }
        if (!pptxBlob) throw new Error('No blob data');

        // Validate blob has actual content (ZIP signature is at least 4 bytes)
        if (pptxBlob.size < 4) {
          throw new Error(
            'File appears to be empty or still being written. Try again in a moment.',
          );
        }

        const parsed = await parsePptxBlob(pptxBlob);
        if (cancelled) {
          // Clean up URLs if cancelled
          parsed.forEach((s) => s.images.forEach((img) => URL.revokeObjectURL(img.url)));
          return;
        }
        // Track URLs for cleanup
        parsed.forEach((s) => s.images.forEach((img) => imageUrls.push(img.url)));
        setSlides(parsed);
        setCurrentSlide(0);
      } catch (err) {
        if (!cancelled) {
          setParseError(err instanceof Error ? err.message : 'Failed to parse PPTX');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    parse();

    return () => {
      cancelled = true;
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, binaryUrl, hasPublicUrl, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  // Keyboard navigation
  const goNext = useCallback(() => {
    if (slides) setCurrentSlide((c) => Math.min(c + 1, slides.length - 1));
  }, [slides]);

  const goPrev = useCallback(() => {
    setCurrentSlide((c) => Math.max(c - 1, 0));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !slides || slides.length <= 1) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [slides, goNext, goPrev]);

  // --- Public URL path (DocViewer) ---
  if (hasPublicUrl && DocViewer && DocViewerRenderers) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { constructHtmlPreviewUrl } = require('@/lib/utils/url');
    const publicUrl = constructHtmlPreviewUrl(project!.sandbox!.sandbox_url!, filePath!);

    if (publicUrl) {
      return (
        <div className={cn('w-full h-full', className)} style={{ minHeight: '500px' }}>
          <DocViewer
            documents={[{
              uri: publicUrl,
              fileName,
              fileType: fileName.endsWith('.ppt') ? 'ppt' : 'pptx',
            }]}
            pluginRenderers={DocViewerRenderers}
            config={{ header: { disableHeader: true, disableFileName: true } }}
            style={{ width: '100%', height: '100%', minHeight: '500px' }}
          />
        </div>
      );
    }
  }

  // --- Loading ---
  if (isLoading) {
    return (
      <div className={cn('w-full h-full flex items-center justify-center', className)}>
        <KortixLoader size="medium" />
      </div>
    );
  }

  // --- Error / no slides ---
  if (parseError || !slides || slides.length === 0) {
    return (
      <div className={cn('w-full h-full flex items-center justify-center', className)}>
        <div className="text-center space-y-3 p-6">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {parseError || 'No slides found in presentation'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRetry}>
              Retry
            </Button>
            {onDownload && (
              <Button size="sm" onClick={onDownload} disabled={isDownloading}>
                {isDownloading ? (
                  <KortixLoader size="small" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Slide viewer ---
  const slide = slides[currentSlide];
  const totalSlides = slides.length;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn('w-full h-full flex flex-col outline-none', className)}
    >
      {/* Navigation bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Slide {currentSlide + 1} of {totalSlides}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goPrev}
            disabled={currentSlide === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {onDownload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDownload}
              disabled={isDownloading}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Slide content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Slide card */}
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm min-h-[300px]">
            {/* Text content */}
            {slide.texts.length > 0 && (
              <div className="space-y-3 mb-6">
                {slide.texts.map((text, idx) => (
                  <p
                    key={idx}
                    className={cn(
                      'text-foreground',
                      idx === 0 ? 'text-xl font-semibold' : 'text-sm',
                    )}
                  >
                    {text}
                  </p>
                ))}
              </div>
            )}

            {/* Images */}
            {slide.images.length > 0 && (
              <div className="space-y-4">
                {slide.images.map((img, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={img.url}
                    alt={img.alt}
                    className="max-w-full rounded-lg shadow-sm"
                  />
                ))}
              </div>
            )}

            {/* Empty slide */}
            {slide.texts.length === 0 && slide.images.length === 0 && (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Empty slide
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide thumbnails */}
      {totalSlides > 1 && (
        <div className="border-t shrink-0 bg-muted/20 px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            {slides.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={cn(
                  'shrink-0 w-20 h-14 rounded-md border text-xs flex items-center justify-center transition-colors',
                  idx === currentSlide
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                )}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
