/**
 * SpreadsheetPreview - XLSX/CSV file preview component
 */

import dynamic from 'next/dynamic';
import { useFileContent } from '@/features/files';
import { Project } from '@/types/project';

const SpreadsheetViewer = dynamic(
    () => import('@/components/thread/tool-views/spreadsheet/SpreadsheetViewer').then((mod) => mod.SpreadsheetViewer),
    { ssr: false, loading: () => <div className="p-4 text-muted-foreground">Loading spreadsheet...</div> }
);

export interface SpreadsheetPreviewProps {
    filepath: string;
    sandboxId?: string;
    project?: Project;
    className?: string;
}

export function SpreadsheetPreview({
    filepath,
    sandboxId,
    project,
    className,
}: SpreadsheetPreviewProps) {
    const filename = filepath.split('/').pop() || '';
    
    const { data: _fileContent, isLoading } = useFileContent(filepath);
    
    if (isLoading) {
        return (
            <div className={className || "h-full w-full flex items-center justify-center"}>
                <div className="text-muted-foreground">Loading spreadsheet...</div>
            </div>
        );
    }
    
    return (
        <SpreadsheetViewer
            filePath={filepath}
            fileName={filename}
            sandboxId={sandboxId}
            project={project}
            className={className || "h-full w-full"}
            compact={true}
            showToolbar={false}
            allowEditing={false}
        />
    );
}

