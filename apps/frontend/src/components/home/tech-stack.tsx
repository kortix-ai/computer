import { cn } from "@/lib/utils";
import { Layers, Box, Cpu, HardDrive } from "lucide-react";

interface StackItemProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  details: string;
  isLast?: boolean;
}

function StackRow({ icon, label, sublabel, details, isLast }: StackItemProps) {
  return (
    <div className="group relative">
      {!isLast && (
        <div className="absolute left-[42px] top-12 bottom-0 w-px bg-border/30 group-hover:bg-border/50 transition-colors z-0" />
      )}
      <div className="relative z-10 flex flex-col sm:flex-row gap-4 p-5 hover:bg-muted/20 transition-colors">
        <div className="flex items-start gap-4 min-w-[200px]">
          <div className="flex items-center justify-center size-10 rounded-xl bg-muted/20 border border-border/50 shrink-0 group-hover:border-border/80 transition-colors">
            {icon}
          </div>
          <div className="flex flex-col pt-0.5">
            <span className="font-medium text-foreground tracking-tight">{label}</span>
            <span className="text-xs text-muted-foreground/50 font-mono mt-1">{sublabel}</span>
          </div>
        </div>
        <div className="flex items-center text-sm text-muted-foreground pt-1 sm:pt-0 pl-14 sm:pl-0 border-l border-border/0 sm:border-border/30 sm:ml-4">
          <div className="sm:pl-6 text-xs sm:text-sm leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
            {details}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TechStack() {
  return (
    <div className="w-full border border-border/50 rounded-2xl bg-card/30 overflow-hidden shadow-sm">
      <StackRow
        icon={<Box className="size-5 text-primary" />}
        label="Agents"
        sublabel="The Workforce"
        details="Your agents, community agents, and 19+ pre-built skill modules. They operate tools and browser sessions."
      />

      <StackRow
        icon={<Layers className="size-5 text-primary" />}
        label="Kortix Orchestrator"
        sublabel="The Manager"
        details="Handles OAuth auth, MCP server connections, cron scheduling, and secure agent tunneling."
      />

      <StackRow
        icon={<Cpu className="size-5 text-primary" />}
        label="OpenCode Engine"
        sublabel="The Brain"
        details="Core agent framework. Manages session context, tool execution, error recovery, and memory persistence."
      />

      <StackRow
        icon={<HardDrive className="size-5 text-primary" />}
        label="Linux OS"
        sublabel="The Machine"
        details="Real filesystem, bash shell, Chromium, Git, SSH, Docker. All state persisted to a single /workspace volume."
        isLast
      />
    </div>
  );
}
