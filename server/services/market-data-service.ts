import { SmartAPI } from "smartapi-javascript";
import { CandleData, MarketData, OptionChainData, Instrument } from "../core/types";

export class MarketDataService {
  private smartApi: SmartAPI;
  private isAuthenticated: boolean = false;

  constructor(smartApi: SmartAPI) {
    this.smartApi = smartApi;
  }

  async authenticate(): Promise<boolean> {
    if (this.isAuthenticated) {
      return true;
    }

    try {
      const profile = await this.smartApi.getProfile();
      this.isAuthenticated = !!profile;
      return this.isAuthenticated;
    } catch (error) {
      console.error("Authentication failed:", error);
      return false;
    }
  }

  async getLTP(symbol: string, exchange: string = "NSE"): Promise<number | null> {
    try {
      const quote = await this.smartApi.getQuote({
        mode: "LTP",
        exchangeTokens: { [exchange]: [symbol] }
      });

      if (quote?.data?.fetched?.[0]?.ltp) {
        return parseFloat(quote.data.fetched[0].ltp);
      }

      return null;
    } catch (error) {
      console.error(`Error fetching LTP for ${symbol}:`, error);
      return null;
    }
  }

  async getMarketData(symbol: string, exchange: string = "NSE"): Promise<MarketData | null> {
    try {
      const quote = await this.smartApi.getQuote({
        mode: "FULL",
        exchangeTokens: { [exchange]: [symbol] }
      });

      const data = quote?.data?.fetched?.[0];
      if (!data) return null;

      return {
        symbol,
        ltp: parseFloat(data.ltp || "0"),
        open: parseFloat(data.open || "0"),
        high: parseFloat(data.high || "0"),
        low: parseFloat(data.low || "0"),
        close: parseFloat(data.close || "0"),
        volume: parseInt(data.volume || "0"),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`Error fetching market data for ${symbol}:`, error);
      return null;
    }
  }

  async getCandleData(
    symbolToken: string,
    interval: string = "FIVE_MINUTE",
    fromDate: string,
    toDate: string
  ): Promise<CandleData[]> {
    try {
      const response = await this.smartApi.getCandleData({
        exchange: "NSE",
        symboltoken: symbolToken,
        interval,
        fromdate: fromDate,
        todate: toDate,
      });

      if (!response?.data) return [];

      return response.data.map((candle: any) => ({
        timestamp: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseInt(candle[5]),
      }));
    } catch (error) {
      console.error("Error fetching candle data:", error);
      return [];
    }
  }

  async getOptionChain(
    instrument: Instrument,
    expiryDate: string
  ): Promise<OptionChainData[]> {
    try {
      const symbolMap: Record<Instrument, string> = {
        NIFTY: "NIFTY",
        BANKNIFTY: "BANKNIFTY",
        SENSEX: "SENSEX",
        CRUDEOIL: "CRUDEOIL",
        NATURALGAS: "NATURALGAS",
      };

      const symbol = symbolMap[instrument];
      if (!symbol) return [];

      const ltp = await this.getLTP(symbol, "NSE");
      if (!ltp) return [];

      const atmStrike = Math.round(ltp / 50) * 50;
      const strikes: OptionChainData[] = [];

      for (let i = -10; i <= 10; i++) {
        const strike = atmStrike + (i * 50);

        const ceSymbol = `${symbol}${expiryDate}${strike}CE`;
        const peSymbol = `${symbol}${expiryDate}${strike}PE`;

        try {
          const [ceData, peData] = await Promise.all([
            this.getMarketData(ceSymbol, "NFO"),
            this.getMarketData(peSymbol, "NFO"),
          ]);

          strikes.push({
            strikePrice: strike,
            callOI: 0,
            callOIChange: 0,
            callVolume: ceData?.volume || 0,
            callLTP: ceData?.ltp || 0,
            callIV: 0,
            putOI: 0,
            putOIChange: 0,
            putVolume: peData?.volume || 0,
            putLTP: peData?.ltp || 0,
            putIV: 0,
          });
        } catch (error) {
          console.error(`Error fetching option data for strike ${strike}:`, error);
        }
      }

      return strikes;
    } catch (error) {
      console.error("Error fetching option chain:", error);
      return [];
    }
  }

  async placeOrder(params: {
    symbol: string;
    exchange: string;
    transactionType: "BUY" | "SELL";
    quantity: number;
    price: number;
    productType: "INT" | "CF";
    orderType: "LIMIT" | "MARKET";
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const orderParams = {
        variety: "NORMAL",
        tradingsymbol: params.symbol,
        symboltoken: "",
        transactiontype: params.transactionType,
        exchange: params.exchange,
        ordertype: params.orderType,
        producttype: params.productType === "INT" ? "INTRADAY" : "CARRYFORWARD",
        duration: "DAY",
        price: params.price.toFixed(2),
        squareoff: "0",
        stoploss: "0",
        quantity: params.quantity.toString(),
      };

      const response = await this.smartApi.placeOrder(orderParams);

      if (response?.data?.orderid) {
        return {
          success: true,
          orderId: response.data.orderid,
        };
      }

      return {
        success: false,
        error: response?.message || "Order placement failed",
      };
    } catch (error: any) {
      console.error("Error placing order:", error);
      return {
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.smartApi.getOrderBook();
      const orders = response?.data || [];

      return orders.find((order: any) => order.orderid === orderId);
    } catch (error) {
      console.error("Error fetching order status:", error);
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await this.smartApi.cancelOrder({
        variety: "NORMAL",
        orderid: orderId,
      });

      return response?.status === true;
    } catch (error) {
      console.error("Error canceling order:", error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isAuthenticated;
  }
}
