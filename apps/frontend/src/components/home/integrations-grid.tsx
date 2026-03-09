import { Check, Loader2 } from "lucide-react";
import { SiGmail, SiSlack, SiNotion, SiGithub, SiStripe, SiLinear } from "react-icons/si";

interface IntegrationItemProps {
  name: string;
  method: string;
  status: "connected" | "pending";
  icon: React.ReactNode;
}

function IntegrationItem({ name, method, status, icon }: IntegrationItemProps) {
  return (
    <div className="group flex items-center justify-between p-4 bg-card/30 border border-border/50 rounded-2xl hover:bg-muted/20 hover:border-border/80 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 rounded-xl bg-muted/20 border border-border/50 text-muted-foreground/70 group-hover:text-foreground/80 transition-colors">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground tracking-tight">{name}</span>
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-mono">{method}</span>
        </div>
      </div>
      <div className="relative flex items-center justify-center">
         {status === "connected" ? (
           <div className="flex items-center justify-center size-6 rounded-full bg-muted/30 text-muted-foreground/60">
             <Check className="size-3.5" />
           </div>
         ) : (
            <Loader2 className="size-3.5 text-muted-foreground/50 animate-spin" />
         )}
      </div>
    </div>
  );
}

export function IntegrationsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      <IntegrationItem name="Gmail" method="OAuth" status="connected" icon={<SiGmail className="size-4" />} />
      <IntegrationItem name="Slack" method="OAuth" status="connected" icon={<SiSlack className="size-4" />} />
      <IntegrationItem name="Notion" method="MCP" status="connected" icon={<SiNotion className="size-4" />} />
      <IntegrationItem name="GitHub" method="CLI + API" status="connected" icon={<SiGithub className="size-4" />} />
      <IntegrationItem name="Stripe" method="API" status="connected" icon={<SiStripe className="size-4" />} />
      <IntegrationItem name="Linear" method="MCP" status="connected" icon={<SiLinear className="size-4" />} />

      <div className="sm:col-span-2 mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground/40 border border-dashed border-border/30 rounded-2xl py-4 hover:text-muted-foreground/60 transition-colors cursor-default">
        <span>+ passwords</span>
        <span className="opacity-30">&middot;</span>
        <span>env vars</span>
        <span className="opacity-30">&middot;</span>
        <span>SSH keys</span>
        <span className="opacity-30">&middot;</span>
        <span>private APIs</span>
        <span className="opacity-30">&middot;</span>
        <span>Postgres</span>
      </div>
    </div>
  );
}
