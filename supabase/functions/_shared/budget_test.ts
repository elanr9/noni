import { assertEquals } from 'jsr:@std/assert@1';
import { budgetTopUp, monthStart, nextMonthStart, nextPeriod } from './budget.ts';

Deno.test('first month bills the whole budget', () => {
  assertEquals(budgetTopUp(100000, 0, 0), 100000);
});
Deno.test('leftover rolls over into the next bill', () => {
  assertEquals(budgetTopUp(100000, 24000, 0), 76000);
});
Deno.test('a full balance bills nothing', () => {
  assertEquals(budgetTopUp(100000, 100000, 0), 0);
  assertEquals(budgetTopUp(100000, 150000, 0), 0);
});
Deno.test('an unpaid earlier bill is not billed twice', () => {
  assertEquals(budgetTopUp(100000, 0, 100000), 0);
  assertEquals(budgetTopUp(100000, 20000, 30000), 50000);
});
Deno.test('next month keeps the day', () => {
  assertEquals(nextPeriod('2026-11-24T20:15:00.000Z', 24), '2026-12-24T20:15:00.000Z');
  assertEquals(nextPeriod('2026-12-24T20:15:00.000Z', 24), '2027-01-24T20:15:00.000Z');
});
Deno.test('short months clamp, then come back to the anchor day', () => {
  assertEquals(nextPeriod('2027-01-31T10:00:00.000Z', 31), '2027-02-28T10:00:00.000Z');
  assertEquals(nextPeriod('2027-02-28T10:00:00.000Z', 31), '2027-03-31T10:00:00.000Z');
});
Deno.test('a month starts on its first day and rolls into the next year', () => {
  assertEquals(monthStart('2026-11-25T20:15:00.000Z'), '2026-11-01');
  assertEquals(nextMonthStart('2026-11-01'), '2026-12-01');
  assertEquals(nextMonthStart('2026-12-01'), '2027-01-01');
});
