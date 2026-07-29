import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Account,
  CashBalance,
  FeeComponent,
  Fill,
  Order,
  OrderEvent,
  OrderReservation,
  Position,
  PositionLot,
  SimulationState,
} from '../src/domain/contracts';
import type { Currency } from '../src/domain/primitives';

function integerMinor(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new TypeError(`Invalid minor-unit value: ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError('Minor-unit value exceeds SQLite adapter range.');
  return parsed;
}

function asMinor(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('Stored minor-unit value is not a safe integer.');
  }
  return value.toString();
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Stored text value is invalid.');
  return value;
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number') throw new TypeError('Stored numeric value is invalid.');
  return value;
}

type Row = Record<string, unknown>;

export class SqliteStateRepository {
  readonly filePath: string;
  readonly database: DatabaseSync;

  constructor(dataDir: string, fileName = 'beta-stock.sqlite') {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, fileName);
    this.database = new DatabaseSync(this.filePath);
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec('PRAGMA synchronous = FULL;');
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.database.exec('PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS state_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        account_id TEXT NOT NULL,
        account_name TEXT NOT NULL,
        base_currency TEXT NOT NULL,
        account_version INTEGER NOT NULL,
        state_sequence INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS cash_balances (
        currency TEXT PRIMARY KEY,
        balance_minor INTEGER NOT NULL,
        reserved_minor INTEGER NOT NULL,
        buying_power_minor INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS realized_pnl (
        currency TEXT PRIMARY KEY,
        amount_minor INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS positions (
        instrument_id TEXT PRIMARY KEY,
        currency TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        settled_quantity INTEGER NOT NULL,
        available_quantity INTEGER NOT NULL,
        average_price TEXT NOT NULL,
        cost_basis_minor INTEGER NOT NULL,
        realized_pnl_minor INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS position_lots (
        id TEXT PRIMARY KEY,
        instrument_id TEXT NOT NULL REFERENCES positions(instrument_id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        acquired_on TEXT NOT NULL,
        sellable_on TEXT NOT NULL,
        cost_basis_minor INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        client_order_id TEXT,
        account_id TEXT NOT NULL,
        instrument_id TEXT NOT NULL,
        side TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        time_in_force TEXT NOT NULL,
        limit_price TEXT,
        stop_price TEXT,
        status TEXT NOT NULL,
        filled_quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        average_fill_price TEXT,
        submitted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        triggered_at TEXT,
        rejection_code TEXT,
        status_reason TEXT,
        sequence INTEGER NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS orders_client_order_id
        ON orders(client_order_id) WHERE client_order_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS order_events (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        resulting_status TEXT NOT NULL,
        at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        message TEXT NOT NULL,
        fill_id TEXT,
        code TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fills (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        instrument_id TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price TEXT NOT NULL,
        gross_minor INTEGER NOT NULL,
        fee_currency TEXT NOT NULL,
        fees_total_minor INTEGER NOT NULL,
        net_cash_minor INTEGER NOT NULL,
        at TEXT NOT NULL,
        sequence INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fill_fees (
        fill_id TEXT NOT NULL REFERENCES fills(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        code TEXT NOT NULL,
        label TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        PRIMARY KEY (fill_id, ordinal)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS reservations (
        order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
        instrument_id TEXT NOT NULL,
        currency TEXT NOT NULL,
        cash_minor INTEGER NOT NULL,
        sell_quantity INTEGER NOT NULL,
        reference_price TEXT
      ) STRICT;
    `);
  }

  hasState(): boolean {
    return this.database.prepare('SELECT 1 AS present FROM state_meta WHERE id = 1').get() !== undefined;
  }

  save(state: SimulationState, updatedAt = new Date().toISOString()): void {
    const db = this.database;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(`
        DELETE FROM fill_fees;
        DELETE FROM order_events;
        DELETE FROM fills;
        DELETE FROM reservations;
        DELETE FROM orders;
        DELETE FROM position_lots;
        DELETE FROM positions;
        DELETE FROM cash_balances;
        DELETE FROM realized_pnl;
        DELETE FROM state_meta;
      `);
      db.prepare(`INSERT INTO state_meta
        (id, account_id, account_name, base_currency, account_version, state_sequence, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)`)
        .run(
          state.account.id,
          state.account.name,
          state.account.baseCurrency,
          state.account.version,
          state.sequence,
          updatedAt,
        );

      const insertCash = db.prepare(`INSERT INTO cash_balances
        (currency, balance_minor, reserved_minor, buying_power_minor) VALUES (?, ?, ?, ?)`);
      for (const [currency, balance] of Object.entries(state.account.cash)) {
        insertCash.run(
          currency,
          integerMinor(balance.balanceMinor),
          integerMinor(balance.reservedMinor),
          integerMinor(balance.buyingPowerMinor),
        );
      }
      const insertRealizedPnl = db.prepare(
        'INSERT INTO realized_pnl (currency, amount_minor) VALUES (?, ?)',
      );
      for (const [currency, amount] of Object.entries(state.account.realizedPnlMinorByCurrency)) {
        insertRealizedPnl.run(currency, integerMinor(amount));
      }

      const insertPosition = db.prepare(`INSERT INTO positions
        (instrument_id, currency, quantity, settled_quantity, available_quantity, average_price,
          cost_basis_minor, realized_pnl_minor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertLot = db.prepare(`INSERT INTO position_lots
        (id, instrument_id, quantity, acquired_on, sellable_on, cost_basis_minor)
        VALUES (?, ?, ?, ?, ?, ?)`);
      for (const position of Object.values(state.account.positions)) {
        insertPosition.run(
          position.instrumentId,
          position.currency,
          position.quantity,
          position.settledQuantity,
          position.availableQuantity,
          position.averagePrice,
          integerMinor(position.costBasisMinor),
          integerMinor(position.realizedPnlMinor),
        );
        for (const lot of position.lots) {
          insertLot.run(
            lot.id,
            position.instrumentId,
            lot.quantity,
            lot.acquiredOn,
            lot.sellableOn,
            integerMinor(lot.costBasisMinor),
          );
        }
      }

      const insertOrder = db.prepare(`INSERT INTO orders
        (id, client_order_id, account_id, instrument_id, side, type, quantity, time_in_force,
          limit_price, stop_price, status, filled_quantity, remaining_quantity, average_fill_price,
          submitted_at, updated_at, triggered_at, rejection_code, status_reason, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const order of Object.values(state.orders)) {
        insertOrder.run(
          order.id,
          order.clientOrderId ?? null,
          order.accountId,
          order.instrumentId,
          order.side,
          order.type,
          order.quantity,
          order.timeInForce,
          order.limitPrice ?? null,
          order.stopPrice ?? null,
          order.status,
          order.filledQuantity,
          order.remainingQuantity,
          order.averageFillPrice ?? null,
          order.submittedAt,
          order.updatedAt,
          order.triggeredAt ?? null,
          order.rejectionCode ?? null,
          order.statusReason ?? null,
          order.sequence,
        );
      }

      const insertEvent = db.prepare(`INSERT INTO order_events
        (id, order_id, account_id, type, resulting_status, at, sequence, message, fill_id, code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const event of state.events) {
        insertEvent.run(
          event.id,
          event.orderId,
          event.accountId,
          event.type,
          event.resultingStatus,
          event.at,
          event.sequence,
          event.message,
          event.fillId ?? null,
          event.code ?? null,
        );
      }

      const insertFill = db.prepare(`INSERT INTO fills
        (id, order_id, account_id, instrument_id, side, quantity, price, gross_minor,
          fee_currency, fees_total_minor, net_cash_minor, at, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertFee = db.prepare(`INSERT INTO fill_fees
        (fill_id, ordinal, code, label, amount_minor) VALUES (?, ?, ?, ?, ?)`);
      for (const fill of state.fills) {
        insertFill.run(
          fill.id,
          fill.orderId,
          fill.accountId,
          fill.instrumentId,
          fill.side,
          fill.quantity,
          fill.price,
          integerMinor(fill.grossMinor),
          fill.fees.currency,
          integerMinor(fill.fees.totalMinor),
          integerMinor(fill.netCashMinor),
          fill.at,
          fill.sequence,
        );
        fill.fees.components.forEach((fee, ordinal) => {
          insertFee.run(fill.id, ordinal, fee.code, fee.label, integerMinor(fee.amountMinor));
        });
      }

      const insertReservation = db.prepare(`INSERT INTO reservations
        (order_id, instrument_id, currency, cash_minor, sell_quantity, reference_price)
        VALUES (?, ?, ?, ?, ?, ?)`);
      for (const reservation of Object.values(state.reservations)) {
        insertReservation.run(
          reservation.orderId,
          reservation.instrumentId,
          reservation.currency,
          integerMinor(reservation.cashMinor),
          reservation.sellQuantity,
          reservation.referencePrice ?? null,
        );
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  load(): SimulationState | null {
    const meta = this.database.prepare('SELECT * FROM state_meta WHERE id = 1').get() as Row | undefined;
    if (!meta) return null;

    const cash = {} as Record<Currency, CashBalance>;
    for (const row of this.database.prepare('SELECT * FROM cash_balances ORDER BY currency').all() as Row[]) {
      const currency = text(row.currency) as Currency;
      cash[currency] = {
        currency,
        balanceMinor: asMinor(row.balance_minor),
        reservedMinor: asMinor(row.reserved_minor),
        buyingPowerMinor: asMinor(row.buying_power_minor),
      };
    }

    const lotsByInstrument = new Map<string, PositionLot[]>();
    for (const row of this.database.prepare('SELECT * FROM position_lots ORDER BY rowid').all() as Row[]) {
      const instrumentId = text(row.instrument_id);
      const lots = lotsByInstrument.get(instrumentId) ?? [];
      lots.push({
        id: text(row.id),
        quantity: numberValue(row.quantity),
        acquiredOn: text(row.acquired_on),
        sellableOn: text(row.sellable_on),
        costBasisMinor: asMinor(row.cost_basis_minor),
      });
      lotsByInstrument.set(instrumentId, lots);
    }
    const positions: Record<string, Position> = {};
    for (const row of this.database.prepare('SELECT * FROM positions ORDER BY instrument_id').all() as Row[]) {
      const instrumentId = text(row.instrument_id);
      positions[instrumentId] = {
        instrumentId,
        currency: text(row.currency) as Currency,
        quantity: numberValue(row.quantity),
        settledQuantity: numberValue(row.settled_quantity),
        availableQuantity: numberValue(row.available_quantity),
        averagePrice: text(row.average_price),
        costBasisMinor: asMinor(row.cost_basis_minor),
        realizedPnlMinor: asMinor(row.realized_pnl_minor),
        lots: lotsByInstrument.get(instrumentId) ?? [],
      };
    }

    const orders: Record<string, Order> = {};
    for (const row of this.database.prepare('SELECT * FROM orders ORDER BY sequence').all() as Row[]) {
      const id = text(row.id);
      orders[id] = {
        id,
        ...(row.client_order_id === null ? {} : { clientOrderId: text(row.client_order_id) }),
        accountId: text(row.account_id),
        instrumentId: text(row.instrument_id),
        side: text(row.side) as Order['side'],
        type: text(row.type) as Order['type'],
        quantity: numberValue(row.quantity),
        timeInForce: text(row.time_in_force) as Order['timeInForce'],
        ...(row.limit_price === null ? {} : { limitPrice: text(row.limit_price) }),
        ...(row.stop_price === null ? {} : { stopPrice: text(row.stop_price) }),
        status: text(row.status) as Order['status'],
        filledQuantity: numberValue(row.filled_quantity),
        remainingQuantity: numberValue(row.remaining_quantity),
        ...(row.average_fill_price === null ? {} : { averageFillPrice: text(row.average_fill_price) }),
        submittedAt: text(row.submitted_at),
        updatedAt: text(row.updated_at),
        ...(row.triggered_at === null ? {} : { triggeredAt: text(row.triggered_at) }),
        ...(row.rejection_code === null
          ? {}
          : { rejectionCode: text(row.rejection_code) as Order['rejectionCode'] }),
        ...(row.status_reason === null ? {} : { statusReason: text(row.status_reason) }),
        sequence: numberValue(row.sequence),
      };
    }

    const events = (this.database.prepare('SELECT * FROM order_events ORDER BY sequence').all() as Row[])
      .map<OrderEvent>((row) => ({
        id: text(row.id),
        orderId: text(row.order_id),
        accountId: text(row.account_id),
        type: text(row.type) as OrderEvent['type'],
        resultingStatus: text(row.resulting_status) as OrderEvent['resultingStatus'],
        at: text(row.at),
        sequence: numberValue(row.sequence),
        message: text(row.message),
        ...(row.fill_id === null ? {} : { fillId: text(row.fill_id) }),
        ...(row.code === null ? {} : { code: text(row.code) as OrderEvent['code'] }),
      }));

    const feeRows = this.database.prepare('SELECT * FROM fill_fees ORDER BY fill_id, ordinal').all() as Row[];
    const feesByFill = new Map<string, FeeComponent[]>();
    for (const row of feeRows) {
      const fillId = text(row.fill_id);
      const fees = feesByFill.get(fillId) ?? [];
      fees.push({
        code: text(row.code) as FeeComponent['code'],
        label: text(row.label),
        amountMinor: asMinor(row.amount_minor),
      });
      feesByFill.set(fillId, fees);
    }
    const fills = (this.database.prepare('SELECT * FROM fills ORDER BY sequence').all() as Row[])
      .map<Fill>((row) => ({
        id: text(row.id),
        orderId: text(row.order_id),
        accountId: text(row.account_id),
        instrumentId: text(row.instrument_id),
        side: text(row.side) as Fill['side'],
        quantity: numberValue(row.quantity),
        price: text(row.price),
        grossMinor: asMinor(row.gross_minor),
        fees: {
          currency: text(row.fee_currency) as Currency,
          components: feesByFill.get(text(row.id)) ?? [],
          totalMinor: asMinor(row.fees_total_minor),
        },
        netCashMinor: asMinor(row.net_cash_minor),
        at: text(row.at),
        sequence: numberValue(row.sequence),
      }));

    const reservations: Record<string, OrderReservation> = {};
    for (const row of this.database.prepare('SELECT * FROM reservations ORDER BY order_id').all() as Row[]) {
      const orderId = text(row.order_id);
      reservations[orderId] = {
        orderId,
        instrumentId: text(row.instrument_id),
        currency: text(row.currency) as Currency,
        cashMinor: asMinor(row.cash_minor),
        sellQuantity: numberValue(row.sell_quantity),
        ...(row.reference_price === null ? {} : { referencePrice: text(row.reference_price) }),
      };
    }

    const realizedRows = this.database.prepare('SELECT * FROM realized_pnl ORDER BY currency').all() as Row[];
    const realizedPnlMinorByCurrency = Object.fromEntries(
      (['USD', 'HKD', 'CNY'] as const).map((currency) => {
        const row = realizedRows.find((item) => item.currency === currency);
        return [currency, row ? asMinor(row.amount_minor) : '0'];
      }),
    ) as Record<Currency, string>;
    const account: Account = {
      id: text(meta.account_id),
      name: text(meta.account_name),
      baseCurrency: text(meta.base_currency) as Currency,
      cash,
      positions,
      realizedPnlMinorByCurrency,
      version: numberValue(meta.account_version),
    };
    return {
      account,
      orders,
      events,
      fills,
      reservations,
      sequence: numberValue(meta.state_sequence),
    };
  }

  reset(): void {
    this.database.exec(`
      BEGIN IMMEDIATE;
      DELETE FROM fill_fees;
      DELETE FROM order_events;
      DELETE FROM fills;
      DELETE FROM reservations;
      DELETE FROM orders;
      DELETE FROM position_lots;
      DELETE FROM positions;
      DELETE FROM cash_balances;
      DELETE FROM realized_pnl;
      DELETE FROM state_meta;
      COMMIT;
    `);
  }

  close(): void {
    this.database.close();
  }
}
