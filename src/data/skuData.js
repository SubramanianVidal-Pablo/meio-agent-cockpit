export const SKU_DATA = [
  // ── Class A — High-revenue biologics ──────────────────────────────────────
  {
    id: 'A-001', name: 'Lumexia mAb', tier: 1, category: 'Oncology',
    echelon: 'Fill-Finish',
    unitRevenue: 280000, unitCost: 56000, unitMargin: 0.80,
    holdingCostPct: 0.02, leadTimeWeeks: 14, demandCV: 0.28, serviceTarget: 0.995,
    onHand: 420, meioSafetyStock: 380, currentSafetyStock: 290,
    monthlyDemand: [110,115,108,122,118,145,152,148,125,120,118,112],
    plannedSupply:  [120,120,120,120,120,120,120,120,120,120,120,120],
    supplier: 'CMO Alpha', coldChain: true, regulatoryStatus: 'Approved',
  },
  {
    id: 'A-002', name: 'Velazan Gene Therapy', tier: 1, category: 'Haematology',
    echelon: 'Fill-Finish',
    unitRevenue: 450000, unitCost: 81000, unitMargin: 0.82,
    holdingCostPct: 0.02, leadTimeWeeks: 20, demandCV: 0.42, serviceTarget: 0.995,
    onHand: 85, meioSafetyStock: 72, currentSafetyStock: 48,
    monthlyDemand: [18,20,19,22,21,28,32,30,25,22,20,19],
    plannedSupply:  [22,22,22,22,22,22,22,22,22,22,22,22],
    supplier: 'CMO Beta', coldChain: true, regulatoryStatus: 'Approved',
  },
  {
    id: 'A-003', name: 'Nexovir CAR-T', tier: 1, category: 'Haematology',
    echelon: 'Distribution',
    unitRevenue: 380000, unitCost: 83600, unitMargin: 0.78,
    holdingCostPct: 0.02, leadTimeWeeks: 6, demandCV: 0.48, serviceTarget: 0.995,
    onHand: 142, meioSafetyStock: 130, currentSafetyStock: 95,
    monthlyDemand: [38,40,42,45,44,58,62,60,50,46,42,40],
    plannedSupply:  [48,48,48,48,48,48,48,48,48,48,48,48],
    supplier: 'CMO Alpha', coldChain: true, regulatoryStatus: 'Approved',
  },
  {
    id: 'A-004', name: 'Protazen mAb DP', tier: 1, category: 'Oncology',
    echelon: 'Fill-Finish',
    unitRevenue: 120000, unitCost: 28800, unitMargin: 0.76,
    holdingCostPct: 0.02, leadTimeWeeks: 10, demandCV: 0.22, serviceTarget: 0.995,
    onHand: 680, meioSafetyStock: 590, currentSafetyStock: 510,
    monthlyDemand: [180,185,178,195,190,225,238,230,205,195,188,182],
    plannedSupply:  [200,200,200,200,200,200,200,200,200,200,200,200],
    supplier: 'CMO Gamma', coldChain: true, regulatoryStatus: 'Approved',
  },
  {
    id: 'A-005', name: 'Carizumab DS', tier: 1, category: 'Oncology',
    echelon: 'DS Manufacturing',
    unitRevenue: 165000, unitCost: 34650, unitMargin: 0.79,
    holdingCostPct: 0.02, leadTimeWeeks: 12, demandCV: 0.31, serviceTarget: 0.995,
    onHand: 520, meioSafetyStock: 460, currentSafetyStock: 380,
    monthlyDemand: [145,150,142,158,155,188,198,192,168,158,150,145],
    plannedSupply:  [160,160,160,160,160,160,160,160,160,160,160,160],
    supplier: 'CMO Alpha', coldChain: true, regulatoryStatus: 'Approved',
  },
  // ── Class B — Mid-revenue ─────────────────────────────────────────────────
  {
    id: 'B-001', name: 'Adalix Biosimilar DP', tier: 2, category: 'Immunology',
    echelon: 'Fill-Finish',
    unitRevenue: 22000, unitCost: 9240, unitMargin: 0.58,
    holdingCostPct: 0.02, leadTimeWeeks: 8, demandCV: 0.18, serviceTarget: 0.98,
    onHand: 2800, meioSafetyStock: 2200, currentSafetyStock: 1900,
    monthlyDemand: [720,730,715,740,738,820,850,840,775,740,730,720],
    plannedSupply:  [750,750,750,750,750,750,750,750,750,750,750,750],
    supplier: 'CMO Epsilon', coldChain: false, regulatoryStatus: 'Approved',
  },
  {
    id: 'B-002', name: 'Ritumax mAb DS', tier: 2, category: 'Oncology',
    echelon: 'DS Manufacturing',
    unitRevenue: 18000, unitCost: 8100, unitMargin: 0.55,
    holdingCostPct: 0.02, leadTimeWeeks: 10, demandCV: 0.24, serviceTarget: 0.98,
    onHand: 1950, meioSafetyStock: 1600, currentSafetyStock: 1350,
    monthlyDemand: [520,528,515,535,530,610,638,628,568,538,525,520],
    plannedSupply:  [540,540,540,540,540,540,540,540,540,540,540,540],
    supplier: 'CMO Beta', coldChain: false, regulatoryStatus: 'Approved',
  },
  {
    id: 'B-003', name: 'Helivex Plasma DS', tier: 2, category: 'Haematology',
    echelon: 'DS Manufacturing',
    unitRevenue: 95000, unitCost: 23750, unitMargin: 0.75,
    holdingCostPct: 0.02, leadTimeWeeks: 16, demandCV: 0.35, serviceTarget: 0.995,
    onHand: 310, meioSafetyStock: 280, currentSafetyStock: 210,
    monthlyDemand: [82,85,80,90,88,105,112,108,92,88,84,80],
    plannedSupply:  [90,90,90,90,90,90,90,90,90,90,90,90],
    supplier: 'CMO Delta', coldChain: true, regulatoryStatus: 'Approved',
  },
  // ── Class C — Lower-revenue ───────────────────────────────────────────────
  {
    id: 'C-001', name: 'Factor VII DP', tier: 3, category: 'Haematology',
    echelon: 'Distribution',
    unitRevenue: 5800, unitCost: 3364, unitMargin: 0.42,
    holdingCostPct: 0.015, leadTimeWeeks: 10, demandCV: 0.30, serviceTarget: 0.97,
    onHand: 2100, meioSafetyStock: 1750, currentSafetyStock: 1450,
    monthlyDemand: [568,575,562,582,578,658,685,675,610,582,570,565],
    plannedSupply:  [580,580,580,580,580,580,580,580,580,580,580,580],
    supplier: 'CMO Mu', coldChain: true, regulatoryStatus: 'Approved',
  },
  {
    id: 'C-002', name: 'Somatropin DS', tier: 3, category: 'Immunology',
    echelon: 'DS Manufacturing',
    unitRevenue: 3200, unitCost: 1792, unitMargin: 0.44,
    holdingCostPct: 0.015, leadTimeWeeks: 8, demandCV: 0.25, serviceTarget: 0.97,
    onHand: 3800, meioSafetyStock: 3100, currentSafetyStock: 2600,
    monthlyDemand: [980,988,972,1005,998,1138,1182,1165,1048,1005,982,975],
    plannedSupply:  [1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000],
    supplier: 'CMO Kappa', coldChain: true, regulatoryStatus: 'Approved',
  },
];

// ── Echelon metadata ──────────────────────────────────────────────────────────
// DS Manufacturing = upstream bulk drug substance (fermentation, cell culture, plasma fractionation)
// Fill-Finish      = drug product formulation, fill-finish, QC batch release
// Distribution     = cold-chain 3PL / hospital dispensing / patient-specific (shortest lead times)
export const ECHELON_META = {
  'DS Manufacturing': {
    label: 'DS Manufacturing',
    sub: 'Upstream · Fermentation, cell culture & plasma fractionation',
    color: '#0F766E',
    bg: '#F0FDFA',
    border: '#5EEAD4',
    note: 'Longest lead times (8–16 wks) — safety stock driven by batch release and yield variability. Excess carries high write-off risk due to shelf life.',
  },
  'Fill-Finish': {
    label: 'Fill-Finish',
    sub: 'Drug Product · Formulation, vial filling & final QC release',
    color: '#4F46E5',
    bg: '#EEF2FF',
    border: '#A5B4FC',
    note: 'Medium lead times (8–20 wks) — targets shaped by fill-finish campaign sizing and GxP batch release windows. CAR-T & gene therapy require patient slot scheduling.',
  },
  'Distribution': {
    label: 'Distribution',
    sub: 'Cold Chain DC · 3PL, hospital dispensing & patient-specific fulfilment',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FCD34D',
    note: 'Shortest lead times (6–10 wks) — lower DoH targets but cold-chain compliance is non-negotiable. Stockouts here are directly patient-facing.',
  },
};

export const TIERS = {
  1: { label: 'Tier 1 — High Margin', color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' },
  2: { label: 'Tier 2 — Mid-High Margin', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  3: { label: 'Tier 3 — Mid Margin', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  4: { label: 'Tier 4 — Low Margin', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
};

// ── ABC Classification ────────────────────────────────────────────────────────
// Computed from annual revenue contribution (avg monthly demand × 12 × unitRevenue).
// A = top SKUs contributing 80% of revenue
// B = next SKUs contributing up to 95% of revenue
// C = remaining SKUs
export function computeABCClass(skus) {
  const withRevenue = skus.map(sku => {
    const avgMonthly = sku.monthlyDemand.reduce((a, b) => a + b, 0) / sku.monthlyDemand.length;
    return { ...sku, _annualRevenue: avgMonthly * 12 * sku.unitRevenue };
  });
  const total = withRevenue.reduce((s, k) => s + k._annualRevenue, 0);
  const sorted = [...withRevenue].sort((a, b) => b._annualRevenue - a._annualRevenue);
  let cum = 0;
  const abcMap = {};
  for (const sku of sorted) {
    cum += sku._annualRevenue / total;
    abcMap[sku.id] = cum <= 0.80 ? 'A' : cum <= 0.95 ? 'B' : 'C';
  }
  return withRevenue.map(sku => ({ ...sku, abcClass: abcMap[sku.id] }));
}

export const ABC_META = {
  A: {
    label: 'Class A',
    color: '#0F766E',
    bg: '#F0FDFA',
    border: '#99F6E4',
    desc: 'Top 20% of SKUs · 80% of portfolio revenue. Highest service level — tightest safety stock management.',
  },
  B: {
    label: 'Class B',
    color: '#4F46E5',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    desc: 'Next 30% of SKUs · 15% of portfolio revenue. Standard MEIO safety stock policy applies.',
  },
  C: {
    label: 'Class C',
    color: '#94A3B8',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    desc: 'Remaining 50% of SKUs · 5% of portfolio revenue. Primary candidates for working capital release.',
  },
};

export const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const EVENTS = [
  { month: 3, type: 'capacity', label: 'Capacity shortfall begins', desc: 'Primary CMO capacity reduced to 70% due to facility maintenance', severity: 'high' },
  { month: 5, type: 'capacity', label: 'Capacity shortfall ends', desc: 'CMO returns to full capacity', severity: 'info' },
  { month: 6, type: 'demand', label: 'Demand spike detected', desc: 'Unexpected demand surge +40% on Class A driven by new treatment guidelines', severity: 'high' },
  { month: 9, type: 'demand', label: 'Demand normalises', desc: 'Demand returns to forecast baseline', severity: 'info' },
];
