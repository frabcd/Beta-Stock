/** JSON-safe exact scalar types used at every domain boundary. */
export type DecimalString = string;
export type MinorUnitString = string;
export type ISODate = string;
export type ISOInstant = string;

export const MARKETS = ['US', 'HK', 'CN'] as const;
export type Market = (typeof MARKETS)[number];

export const CURRENCIES = ['USD', 'HKD', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_DECIMALS: Readonly<Record<Currency, number>> = {
  USD: 2,
  HKD: 2,
  CNY: 2,
};
