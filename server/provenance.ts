// This matches the deterministic environment's scenario clock in server/app.ts.
export const SYNTHETIC_AS_OF = '2026-07-27T02:00:00.000Z';

export interface SyntheticProvenance {
  readonly classification: 'SYNTHETIC';
  readonly synthetic: true;
  readonly source: 'Beta-Stock deterministic demo engine';
  readonly asOf: string;
  readonly ageSeconds: number;
  readonly delayed: true;
  readonly disclaimer: string;
}

export function syntheticProvenance(now = new Date()): SyntheticProvenance {
  return {
    classification: 'SYNTHETIC',
    synthetic: true,
    source: 'Beta-Stock deterministic demo engine',
    asOf: SYNTHETIC_AS_OF,
    ageSeconds: Math.max(0, Math.floor((now.getTime() - Date.parse(SYNTHETIC_AS_OF)) / 1_000)),
    delayed: true,
    disclaimer: 'Synthetic educational data. Not live market data and not investment advice.',
  };
}
