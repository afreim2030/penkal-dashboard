export const FULL_FIFO_BUCKET_KEYS = [
  "units_0_30",
  "units_31_60",
  "units_61_90",
  "units_91_120",
  "units_121_180",
  "units_181_plus",
  "units_unknown",
] as const;

export type FullFifoBucketKey = (typeof FULL_FIFO_BUCKET_KEYS)[number];

export interface FullFifoInbound {
  inboundId: string;
  receivedAt: string | null;
  unitsProcessed: number | null;
}

export interface FullFifoAllocation {
  inboundId: string;
  receivedAt: string;
  unitsProcessed: number;
  allocatedQuantity: number;
  ageDays: number;
}

export interface FullFifoResult {
  allocations: FullFifoAllocation[];
  knownAgeQuantity: number;
  unknownAgeQuantity: number;
  coveragePercentage: number | null;
  weightedAverageAgeDays: number | null;
  oldestKnownRemainingReceivedAt: string | null;
  newestKnownRemainingReceivedAt: string | null;
  buckets: Record<FullFifoBucketKey, number>;
  coverageProblemCount: number;
}

const DAY_IN_MILLISECONDS = 86_400_000;

function ageInCompleteDays(snapshotAt: string, receivedAt: string): number | null {
  const snapshotTime = Date.parse(snapshotAt);
  const receivedTime = Date.parse(receivedAt);
  if (!Number.isFinite(snapshotTime) || !Number.isFinite(receivedTime)) return null;
  return Math.max(0, Math.floor((snapshotTime - receivedTime) / DAY_IN_MILLISECONDS));
}

export function fullFifoBucketForAge(ageDays: number): Exclude<FullFifoBucketKey, "units_unknown"> {
  if (ageDays <= 30) return "units_0_30";
  if (ageDays <= 60) return "units_31_60";
  if (ageDays <= 90) return "units_61_90";
  if (ageDays <= 120) return "units_91_120";
  if (ageDays <= 180) return "units_121_180";
  return "units_181_plus";
}

export function estimateFullInventoryFifo(input: {
  currentQuantity: number;
  snapshotAt: string;
  inbounds: readonly FullFifoInbound[];
}): FullFifoResult {
  const currentQuantity = Math.max(0, Math.trunc(input.currentQuantity));
  const buckets: Record<FullFifoBucketKey, number> = {
    units_0_30: 0,
    units_31_60: 0,
    units_61_90: 0,
    units_91_120: 0,
    units_121_180: 0,
    units_181_plus: 0,
    units_unknown: 0,
  };
  let remainingQuantity = currentQuantity;
  let weightedAgeTotal = 0;
  let coverageProblemCount = 0;
  const allocations: FullFifoAllocation[] = [];
  const eligibleInbounds = input.inbounds
    .map((inbound) => ({ ...inbound }))
    .filter((inbound) => {
      if (inbound.unitsProcessed === null || inbound.receivedAt === null) {
        coverageProblemCount += 1;
        return false;
      }
      return inbound.unitsProcessed > 0;
    })
    .sort((left, right) => Date.parse(right.receivedAt as string) - Date.parse(left.receivedAt as string));

  for (const inbound of eligibleInbounds) {
    if (remainingQuantity === 0) break;
    const receivedAt = inbound.receivedAt as string;
    const ageDays = ageInCompleteDays(input.snapshotAt, receivedAt);
    if (ageDays === null) {
      coverageProblemCount += 1;
      continue;
    }
    const unitsProcessed = Math.max(0, Math.trunc(inbound.unitsProcessed as number));
    const allocatedQuantity = Math.min(remainingQuantity, unitsProcessed);
    if (allocatedQuantity === 0) continue;
    allocations.push({
      inboundId: inbound.inboundId,
      receivedAt,
      unitsProcessed,
      allocatedQuantity,
      ageDays,
    });
    buckets[fullFifoBucketForAge(ageDays)] += allocatedQuantity;
    weightedAgeTotal += allocatedQuantity * ageDays;
    remainingQuantity -= allocatedQuantity;
  }

  const knownAgeQuantity = currentQuantity - remainingQuantity;
  buckets.units_unknown = remainingQuantity;
  const receivedDates = allocations.map((allocation) => allocation.receivedAt);

  return {
    allocations,
    knownAgeQuantity,
    unknownAgeQuantity: remainingQuantity,
    coveragePercentage: currentQuantity === 0 ? null : (knownAgeQuantity / currentQuantity) * 100,
    weightedAverageAgeDays: knownAgeQuantity === 0 ? null : weightedAgeTotal / knownAgeQuantity,
    oldestKnownRemainingReceivedAt: receivedDates.at(-1) ?? null,
    newestKnownRemainingReceivedAt: receivedDates[0] ?? null,
    buckets,
    coverageProblemCount,
  };
}
