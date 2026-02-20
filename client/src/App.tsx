import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import Dashboard from "@/pages/dashboard";
import AllSignals from "@/pages/all-signals";
import StrategySignals from "@/pages/strategy-signals";
import Balance from "@/pages/balance";
import LogsPage from "@/pages/logs-page";
import OptionCharts from "@/pages/option-charts";
import SignalHistory from "@/pages/signal-history";
import NotFound from "@/pages/not-found";
import type { Signal } from "@shared/schema";

function StrategyRoute() {
  const [, params] = useRoute("/strategy/:key");
  if (!params?.key) return <NotFound />;
  return <StrategySignals strategyKey={params.key} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/signals" component={AllSignals} />
      <Route path="/strategy/:key" component={StrategyRoute} />
      <Route path="/charts" component={OptionCharts} />
      <Route path="/history" component={SignalHistory} />
      <Route path="/balance" component={Balance} />
      <Route path="/logs" component={LogsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 10000,
  });

  const signalCounts: Record<string, number> = {};
  const activeSignals = signals.filter((s) => s.status === "active");
  signalCounts["all"] = activeSignals.length;
  activeSignals.forEach((s) => {
    signalCounts[s.strategy] = (signalCounts[s.strategy] || 0) + 1;
  });

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar signalCounts={signalCounts} />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
                AngelOne SmartAPI
              </Badge>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
