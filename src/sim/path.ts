export interface Point {
  x: number;
  y: number;
}

/** A polyline that monsters walk along, addressed by distance traveled. */
export class Path {
  readonly points: Point[];
  readonly length: number;
  private readonly cumulative: number[];

  constructor(points: Point[]) {
    this.points = points;
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  pointAt(distance: number): Point {
    const d = Math.max(0, Math.min(this.length, distance));
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i] < d) i++;
    const start = this.cumulative[i - 1];
    const segment = this.cumulative[i] - start || 1;
    const t = (d - start) / segment;
    const a = this.points[i - 1];
    const b = this.points[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}
