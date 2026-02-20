import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Layers,
  Activity,
  TrendingUp,
  BarChart3,
  Target,
  Gauge,
  Wallet,
  ScrollText,
  Zap,
  LineChart,
  History,
  TrendingDown,
  Rocket,
  RotateCw,
  Flame,
  Grid3X3,
} from "lucide-react";
import { STRATEGIES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const strategyIcons: Record<string, any> = {
  ORB: Activity,
  SMTR: TrendingDown,
  EMA: TrendingUp,
  VWAP_PULLBACK: BarChart3,
  VWAP_RSI: Target,
  RSI: Gauge,
  EMA_VWAP_RSI: Layers,
  MARKET_TOP: TrendingUp,
  SCALP: Zap,
  PRO_ORB: Rocket,
  VWAP_REVERSION: RotateCw,
  BREAKOUT_STRENGTH: Flame,
  REGIME_BASED: Grid3X3,
};

interface AppSidebarProps {
  signalCounts?: Record<string, number>;
}

export function AppSidebar({ signalCounts = {} }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">AlgoTrader</h2>
              <p className="text-[10px] text-muted-foreground leading-tight">AngelOne Signals</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="flex flex-col">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest">Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"} data-testid="link-dashboard">
                  <Link href="/">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/signals"} data-testid="link-all-signals">
                  <Link href="/signals">
                    <Layers className="w-4 h-4" />
                    <span>All Signals</span>
                    {(signalCounts["all"] ?? 0) > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                        {signalCounts["all"]}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/charts"} data-testid="link-option-chain">
                  <Link href="/charts">
                    <LineChart className="w-4 h-4" />
                    <span>Option Chain</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/history"} data-testid="link-signal-history">
                  <Link href="/history">
                    <History className="w-4 h-4" />
                    <span>Signal History</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="flex flex-col flex-1 min-h-0">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest">Strategies</SidebarGroupLabel>
          <SidebarGroupContent className="flex-1 min-h-0">
            <ScrollArea className="h-full w-full">
              <SidebarMenu>
                {STRATEGIES.map((strategy) => {
                  const Icon = strategyIcons[strategy.key] || Activity;
                  const count = signalCounts[strategy.key] || 0;
                  return (
                    <SidebarMenuItem key={strategy.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === `/strategy/${strategy.key}`}
                        data-testid={`link-strategy-${strategy.key}`}
                      >
                        <Link href={`/strategy/${strategy.key}`}>
                          <Icon className="w-4 h-4" />
                          <span
                            className="text-xs leading-tight whitespace-normal"
                            title={`${strategy.name} (${strategy.shortName})`}
                          >
                            {strategy.name} ({strategy.shortName})
                          </span>
                          {count > 0 && (
                            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                              {count}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest">Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/balance"} data-testid="link-balance">
                  <Link href="/balance">
                    <Wallet className="w-4 h-4" />
                    <span>Balance</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/logs"} data-testid="link-logs">
                  <Link href="/logs">
                    <ScrollText className="w-4 h-4" />
                    <span>Logs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
          <span className="text-xs text-muted-foreground">Market Live</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
