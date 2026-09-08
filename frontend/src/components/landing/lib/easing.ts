// Solveur cubic-bezier (Newton-Raphson) pour piloter les compteurs
// JS (requestAnimationFrame) avec exactement la même courbe d'accélération
// que les transitions CSS de la landing (--landing-ease).
function makeCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const C = (a1: number) => 3 * a1;
  const calc = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t: number, a1: number, a2: number) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);

  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = calc(t, p1x, p2x) - x;
      const d = slope(t, p1x, p2x);
      if (Math.abs(x2) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= x2 / d;
    }
    return calc(t, p1y, p2y);
  };
}

export const landingEase = makeCubicBezier(0.22, 0.68, 0, 1);
