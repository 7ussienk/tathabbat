/**
 * عدّاد تكلفة يومي تقديري (قرار 4 أكتوبر، حماية الميزانية). يجمع `usage.cost_usd` لكل رد خلال اليوم (UTC) ويُصفَّر بتغيّر اليوم.
 * **تقريبي لكل نسخة serverless** مثل محدد المعدل (كل نسخة لها عدّادها ويُصفَّر عند cold start)؛ والضمان المشترك الفعلي هو سقف Google
 * وقاعدة Vercel Firewall. لا يُسجَّل فيه إلا رقم التكلفة، لا نص ولا هوية.
 */
export class DailyCostMeter {
  private day = "";
  private sum = 0;
  constructor(private readonly now: () => number = Date.now) {}

  private roll() {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.sum = 0;
    }
  }

  total(): number {
    this.roll();
    return this.sum;
  }

  add(usd: number): void {
    this.roll();
    if (Number.isFinite(usd) && usd > 0) this.sum += usd;
  }
}

const g = globalThis as unknown as { __tathabbatCost?: DailyCostMeter };
export const sharedCostMeter = (): DailyCostMeter => (g.__tathabbatCost ??= new DailyCostMeter());
