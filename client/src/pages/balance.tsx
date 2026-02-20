import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingUp, TrendingDown, Banknote, PiggyBank, CreditCard, IndianRupee, BarChart3 } from "lucide-react";

export default function Balance() {
  const { data: balance, isLoading, error } = useQuery<any>({
    queryKey: ["/api/balance"],
    refetchInterval: 30000,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/profile"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 h-full">
        <h1 className="text-xl font-bold tracking-tight">Balance & Account</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4">
              <div className="h-16 bg-muted rounded-md animate-pulse" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const balanceItems = [
    { label: "Available Cash", value: balance?.availablecash, icon: Banknote, color: "text-chart-3" },
    { label: "Net Value", value: balance?.net, icon: TrendingUp, color: "text-primary" },
    { label: "Collateral", value: balance?.collateral, icon: PiggyBank, color: "text-chart-4" },
    { label: "Used Margin", value: balance?.utiliseddebits, icon: CreditCard, color: "text-chart-5" },
    { label: "M2M Realized", value: balance?.m2mrealized, icon: BarChart3, color: "text-chart-2" },
    { label: "M2M Unrealized", value: balance?.m2munrealized, icon: IndianRupee, color: "text-chart-1" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Balance & Account</h1>
      </div>

      {profile && (
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
              {profile.name?.charAt(0) || "A"}
            </div>
            <div>
              <p className="font-semibold text-sm" data-testid="text-profile-name">{profile.name || "Trader"}</p>
              <p className="text-xs text-muted-foreground" data-testid="text-client-id">Client ID: {profile.clientcode || "--"}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {profile.email && <Badge variant="outline" className="text-xs">{profile.email}</Badge>}
              {profile.broker && <Badge variant="secondary" className="text-xs">{profile.broker}</Badge>}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="balance-cards">
        {balanceItems.map((item) => (
          <Card key={item.label} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <item.icon className={`w-4 h-4 ${item.color}`} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <div className={`text-xl font-mono font-bold ${item.color}`} data-testid={`text-balance-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
              {item.value != null
                ? `₹${parseFloat(item.value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "--"}
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <Card className="p-4 border-destructive/50">
          <p className="text-sm text-destructive" data-testid="text-balance-error">
            Unable to fetch balance data. Please ensure the trading engine is connected to AngelOne.
          </p>
        </Card>
      )}
    </div>
  );
}
