// Power unit suppliers. `power` is the works figure; customers run one point
// lower. `price` is £m per season. `minReputation` gates the deal.
export const SUPPLIERS = {
  rbf: { id: 'rbf', name: 'Red Bull Ford', power: 93, reliability: 82, price: 18, minReputation: 35, worksTeam: 'redbull' },
  mercedes: { id: 'mercedes', name: 'Mercedes', power: 91, reliability: 90, price: 17, minReputation: 30, worksTeam: 'mercedes' },
  ferrari: { id: 'ferrari', name: 'Ferrari', power: 85, reliability: 86, price: 13, minReputation: 0, worksTeam: 'ferrari' },
  audi: { id: 'audi', name: 'Audi', power: 83, reliability: 78, price: 10, minReputation: 0, worksTeam: 'audi' },
  honda: { id: 'honda', name: 'Honda', power: 81, reliability: 72, price: 9, minReputation: 0, worksTeam: 'aston' },
}

export const PARTS_PACKAGE_PRICE = 4
