import { cn } from "@/lib/utils";

interface ProcessRowProps {
  user: string;
  pid: string;
  cpu: string;
  mem: string;
  time: string;
  command: React.ReactNode;
  status: "running" | "sleeping";
}

function ProcessRow({ user, pid, cpu, mem, time, command, status }: ProcessRowProps) {
  return (
    <div className="grid grid-cols-12 gap-2 font-mono text-[11px] py-2 border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors items-center">
      <div className="col-span-2 text-muted-foreground/50">{user}</div>
      <div className="col-span-1 text-muted-foreground/40">{pid}</div>
      <div className="col-span-1 text-muted-foreground/40">{cpu}</div>
      <div className="col-span-1 text-muted-foreground/40">{mem}</div>
      <div className="col-span-2 text-muted-foreground/40">{time}</div>
      <div className={cn("col-span-5 truncate flex items-center gap-2", status === "running" ? "text-foreground/70" : "text-muted-foreground/40")}>
        {status === "running" && <div className="size-1.5 rounded-full bg-foreground/40 animate-pulse" />}
        {command}
      </div>
    </div>
  );
}

export function TerminalView() {
  return (
    <div className="w-full rounded-2xl bg-card/30 border border-border/50 overflow-hidden font-mono shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 bg-muted/10 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-full bg-muted-foreground/15" />
          <div className="size-3 rounded-full bg-muted-foreground/15" />
          <div className="size-3 rounded-full bg-muted-foreground/15" />
        </div>
        <div className="text-[10px] font-medium text-muted-foreground/40 tracking-widest uppercase">root@kortix:~</div>
        <div className="size-3 opacity-0" />
      </div>
      <div className="p-5 space-y-5">
        <div className="text-xs flex items-center gap-2">
          <span className="text-foreground/50 font-bold">root@kortix:~$</span>
          <span className="text-foreground/80 bg-muted/20 px-1.5 py-0.5 rounded">kortix status</span>
        </div>
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground/40 uppercase tracking-wider pb-3 border-b border-border/20 mb-2 font-semibold">
            <div className="col-span-2">User</div>
            <div className="col-span-1">PID</div>
            <div className="col-span-1">%CPU</div>
            <div className="col-span-1">%MEM</div>
            <div className="col-span-2">Time</div>
            <div className="col-span-5">Command</div>
          </div>
          <ProcessRow
            user="root" pid="1089" cpu="2.4" mem="4.1" time="14d 02:11"
            command={<span><span className="text-foreground/50">node</span> agent-support.js</span>}
            status="running"
          />
          <ProcessRow
            user="root" pid="1092" cpu="0.1" mem="2.8" time="14d 02:10"
            command={<span><span className="text-foreground/50">node</span> agent-bookkeeper.js</span>}
            status="running"
          />
          <ProcessRow
            user="root" pid="2104" cpu="0.5" mem="3.2" time="6d 14:45"
            command={<span><span className="text-foreground/50">node</span> agent-recruiter.js</span>}
            status="running"
          />
          <ProcessRow
            user="root" pid="3401" cpu="1.2" mem="5.4" time="3d 08:20"
            command={<span><span className="text-foreground/50">python</span> data-ops.py</span>}
            status="running"
          />
          <ProcessRow
            user="root" pid="4002" cpu="0.0" mem="0.5" time="0:00.04"
            command={<span><span className="text-foreground/50">bash</span> cron-job.sh</span>}
            status="sleeping"
          />
        </div>
        <div className="text-xs pt-2 flex items-center">
          <span className="text-foreground/50 font-bold mr-2">root@kortix:~$</span>
          <span className="w-2 h-4 bg-muted-foreground/30 animate-pulse block" />
        </div>
      </div>
    </div>
  );
}
