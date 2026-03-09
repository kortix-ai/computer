import { Folder, File } from "lucide-react";

interface FileItemProps {
  name: string;
  depth?: number;
  isFile?: boolean;
}

function FileItem({ name, depth = 0, isFile }: FileItemProps) {
  return (
    <div
      className="flex items-center gap-3 py-1.5 px-4 rounded-xl hover:bg-muted/20 transition-colors cursor-default"
      style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
    >
      <span className="text-muted-foreground/40 shrink-0">
        {isFile ? <File className="size-4" /> : <Folder className="size-4" />}
      </span>
      <span className="font-mono text-sm text-foreground/70 tracking-tight">
        {name}
      </span>
    </div>
  );
}

export function FileSystemView() {
  return (
    <div className="w-full border border-border/50 rounded-2xl bg-card/30 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border/30 bg-muted/10">
        <div className="flex gap-2">
          <div className="size-3 rounded-full bg-muted-foreground/15" />
          <div className="size-3 rounded-full bg-muted-foreground/15" />
          <div className="size-3 rounded-full bg-muted-foreground/15" />
        </div>
        <span className="text-xs font-mono text-muted-foreground/40 ml-1">~/workspace</span>
      </div>

      <div className="py-3 px-2 flex flex-col gap-0.5">
        <FileItem name=".local/share/opencode/" />
        <FileItem name="storage/session/" depth={1} />
        <FileItem name="storage/message/" depth={1} />
        <FileItem name="storage/memory.db" depth={1} isFile />

        <div className="h-3" />

        <FileItem name=".opencode/" />
        <FileItem name="agents/" depth={1} />
        <FileItem name="skills/" depth={1} />

        <div className="h-3" />

        <FileItem name=".secrets/" />
        <FileItem name=".browser-profile/" />
        <FileItem name="projects/" />
      </div>
    </div>
  );
}
