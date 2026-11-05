import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  makeShift,
  calculateReport,
} from "../server/game";
import { STRATEGIES, UPGRADES } from "../shared/content";
const results = [];
for (const strategy of STRATEGIES) {
  for (const upgraded of [false, true]) {
    let revenue = 0,
      profit = 0,
      lost = 0,
      served = 0,
      demand = 0;
    const g = createGame("sim");
    applyAction(g, { type: "skipTutorial" });
    if (upgraded) g.upgrades = UPGRADES.map((u) => u.id);
    for (let i = 0; i < 1000; i++) {
      g.inventory = { beans: 120, milk: 180, flour: 120 };
      const s = makeShift(
        g,
        {
          type: "startShift",
          menu: ["espresso", "cappuccino", "latte", "croissant", "cookie"],
          strategy: strategy.id,
          prep: "welcome",
        },
        1000000,
        `${strategy.id}-${i}`,
      );
      const r = calculateReport(s);
      assert.ok(Number.isSafeInteger(r.profit));
      assert.equal(r.served + r.lost, r.demand);
      assert.ok(r.ingredients >= 0);
      assert.ok(r.served <= s.guests.length);
      revenue += r.revenue;
      profit += r.profit;
      lost += r.lost;
      served += r.served;
      demand += r.demand;
    }
    results.push({
      strategy: strategy.name,
      upgraded,
      shifts: 1000,
      avgRevenue: Math.round(revenue / 1000),
      avgProfit: Math.round(profit / 1000),
      avgLost: Number((lost / 1000).toFixed(2)),
      serviceRate: served / demand,
    });
  }
}
console.table(results);
for (const strategy of STRATEGIES) {
  const pair = results.filter((r) => r.strategy === strategy.name);
  assert.ok(pair[1].serviceRate >= pair[0].serviceRate);
  assert.ok(pair[1].avgProfit >= pair[0].avgProfit);
}
