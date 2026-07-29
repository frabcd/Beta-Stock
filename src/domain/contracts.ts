import type { Currency, DecimalString, ISODate, ISOInstant, Market, MinorUnitString } from './primitives';

export type Exchange = 'NASDAQ' | 'NYSE' | 'HKEX' | 'SSE' | 'SZSE';
export type ChinaBoard = 'MAIN' | 'STAR' | 'CHINEXT' | 'ST';
export type AssetClass = 'EQUITY' | 'ETF';

export interface Instrument {
  readonly id: string;
  readonly symbol: string;
  readonly displaySymbol: string;
  readonly name: string;
  readonly shortName: string;
  readonly market: Market;
  readonly exchange: Exchange;
  readonly currency: Currency;
  readonly assetClass: AssetClass;
  readonly timeZone: string;
  readonly boardLot: number;
  readonly minOrderQuantity?: number;
  readonly maxOrderQuantity?: number;
  readonly chinaBoard?: ChinaBoard;
  readonly tickOverride?: DecimalString;
  readonly priceLimitBps?: number | null;
  readonly active: boolean;
  readonly previousClose: DecimalString;
  readonly sector: string;
  readonly logoText: string;
}

export interface Quote {
  readonly instrumentId: string;
  readonly at: ISOInstant;
  readonly tradingDate: ISODate;
  readonly bid: DecimalString;
  readonly ask: DecimalString;
  readonly last: DecimalString;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly previousClose: DecimalString;
  readonly bidSize: number;
  readonly askSize: number;
  readonly cumulativeVolume: number;
  readonly sequence: number;
}

export interface Bar {
  readonly instrumentId: string;
  readonly start: ISOInstant;
  readonly end: ISOInstant;
  readonly intervalMinutes: number;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  readonly volume: number;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type TimeInForce = 'DAY' | 'GTC';
export type OrderStatus =
  | 'PENDING_VALIDATION'
  | 'ACCEPTED'
  | 'TRIGGERED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface OrderRequest {
  readonly clientOrderId?: string;
  readonly instrumentId: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: number;
  readonly timeInForce: TimeInForce;
  readonly limitPrice?: DecimalString;
  readonly stopPrice?: DecimalString;
}

export interface Order extends OrderRequest {
  readonly id: string;
  readonly accountId: string;
  readonly status: OrderStatus;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice?: DecimalString;
  readonly submittedAt: ISOInstant;
  readonly updatedAt: ISOInstant;
  readonly triggeredAt?: ISOInstant;
  readonly rejectionCode?: ValidationCode;
  readonly statusReason?: string;
  readonly sequence: number;
}

export type OrderEventType =
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'TRIGGERED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface OrderEvent {
  readonly id: string;
  readonly orderId: string;
  readonly accountId: string;
  readonly type: OrderEventType;
  readonly resultingStatus: OrderStatus;
  readonly at: ISOInstant;
  readonly sequence: number;
  readonly message: string;
  readonly fillId?: string;
  readonly code?: ValidationCode;
}

export interface FeeComponent {
  readonly code:
    | 'BROKER_COMMISSION'
    | 'SEC_SECTION_31'
    | 'FINRA_TAF'
    | 'HK_STAMP_DUTY'
    | 'SFC_LEVY'
    | 'AFRC_LEVY'
    | 'HKEX_TRADING_FEE'
    | 'CN_STAMP_DUTY'
    | 'CN_TRANSFER_FEE';
  readonly label: string;
  readonly amountMinor: MinorUnitString;
}

export interface FeeBreakdown {
  readonly currency: Currency;
  readonly components: readonly FeeComponent[];
  readonly totalMinor: MinorUnitString;
}

export interface Fill {
  readonly id: string;
  readonly orderId: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: DecimalString;
  readonly grossMinor: MinorUnitString;
  readonly fees: FeeBreakdown;
  readonly netCashMinor: MinorUnitString;
  readonly at: ISOInstant;
  readonly sequence: number;
}

export interface PositionLot {
  readonly id: string;
  readonly quantity: number;
  readonly acquiredOn: ISODate;
  readonly sellableOn: ISODate;
  readonly costBasisMinor: MinorUnitString;
}

export interface Position {
  readonly instrumentId: string;
  readonly currency: Currency;
  readonly quantity: number;
  readonly settledQuantity: number;
  readonly availableQuantity: number;
  readonly averagePrice: DecimalString;
  readonly costBasisMinor: MinorUnitString;
  readonly realizedPnlMinor: MinorUnitString;
  readonly lots: readonly PositionLot[];
}

export interface CashBalance {
  readonly currency: Currency;
  readonly balanceMinor: MinorUnitString;
  readonly reservedMinor: MinorUnitString;
  readonly buyingPowerMinor: MinorUnitString;
}

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: Currency;
  readonly cash: Readonly<Record<Currency, CashBalance>>;
  readonly positions: Readonly<Record<string, Position>>;
  readonly realizedPnlMinorByCurrency: Readonly<Record<Currency, MinorUnitString>>;
  readonly version: number;
}

export interface OrderReservation {
  readonly orderId: string;
  readonly instrumentId: string;
  readonly currency: Currency;
  readonly cashMinor: MinorUnitString;
  readonly sellQuantity: number;
  readonly referencePrice?: DecimalString;
}

export interface SimulationState {
  readonly account: Account;
  readonly orders: Readonly<Record<string, Order>>;
  readonly events: readonly OrderEvent[];
  readonly fills: readonly Fill[];
  readonly reservations: Readonly<Record<string, OrderReservation>>;
  readonly sequence: number;
}

export type ValidationCode =
  | 'UNKNOWN_INSTRUMENT'
  | 'INSTRUMENT_INACTIVE'
  | 'INVALID_QUANTITY'
  | 'LOT_SIZE'
  | 'ORDER_SIZE_LIMIT'
  | 'MISSING_PRICE'
  | 'UNEXPECTED_PRICE'
  | 'INVALID_PRICE'
  | 'TICK_SIZE'
  | 'PRICE_LIMIT'
  | 'MARKET_CLOSED'
  | 'ORDER_TYPE_NOT_ALLOWED'
  | 'TIME_IN_FORCE_NOT_ALLOWED'
  | 'MISSING_QUOTE'
  | 'STALE_QUOTE'
  | 'INSUFFICIENT_BUYING_POWER'
  | 'INSUFFICIENT_POSITION'
  | 'T_PLUS_ONE'
  | 'DUPLICATE_CLIENT_ORDER_ID';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly message: string;
  readonly field?: keyof OrderRequest;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}
