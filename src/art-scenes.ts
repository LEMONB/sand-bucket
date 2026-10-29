export const SCENES = ['Маяк', 'Лиса', 'Воздушный шар'] as const;
export const SCENE_PALETTES = [
  ['#203e56', '#58aaa8', '#f4dfad', '#e77d62'],
  ['#243e47', '#7fa99a', '#f3ddae', '#d8754f'],
  ['#334866', '#87b9b2', '#f3dca5', '#dc7d72'],
];

// Original compositions drawn on a 64px grid, doubled without smoothing.
export function createScene(scene: number, variant = 0): Uint8Array {
  const pixels = new Uint8Array(64 * 64).fill(2);
  const rect = (x: number, y: number, w: number, h: number, color: number) => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < 64 && py >= 0 && py < 64) pixels[py * 64 + px] = color;
    }
  };
  const polygon = (points: number[][], color: number) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i], [bx, by] = points[j];
        if ((ay > y + .5) !== (by > y + .5) && x + .5 < (bx - ax) * (y + .5 - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside) pixels[y * 64 + x] = color;
    }
  };
  const disk = (cx: number, cy: number, r: number, color: number) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) pixels[y * 64 + x] = color;
    }
  };
  if (scene === 0) {
    disk(14 + variant * 3, 14, 7, 3);
    rect(4, 26, 15, 2, 3); rect(8, 24, 8, 2, 3);
    rect(45, 11, 15, 2, 3);
    polygon([[0, 44], [17, 39], [32, 44], [64, 41], [64, 64], [0, 64]], 1);
    polygon([[14, 57], [22, 47], [35, 42], [45, 45], [56, 57]], 2);
    polygon([[28, 46], [31, 20], [39, 20], [43, 46]], 3);
    polygon([[30, 29], [40, 29], [41, 35], [29, 35]], 4);
    rect(29, 17, 12, 4, 1); rect(31, 18, 8, 2, 3);
    polygon([[27, 17], [35, 10], [43, 17]], 4);
    rect(34, 39, 3, 7, 1); rect(34, 24, 2, 3, 1);
    for (let i = 0; i < 6; i++) rect((i * 17 + variant * 3) % 54, 49 + i % 3 * 5, 7, 1, 3);
  } else if (scene === 1) {
    rect(0, 52, 64, 12, 1);
    for (const x of [5, 54]) {
      rect(x, 14, 3, 39, 1);
      polygon([[x - 9, 33], [x + 1, 7], [x + 11, 33]], 1);
      polygon([[x - 8, 43], [x + 1, 22], [x + 12, 43]], 1);
    }
    polygon([[29, 43], [40, 38], [54, 43], [58, 53], [49, 58], [29, 57]], 4);
    polygon([[50, 42], [57, 47], [58, 53], [49, 58], [43, 57]], 3);
    polygon([[17, 33], [18, 13], [30, 23], [38, 14], [43, 35], [37, 48], [33, 57], [18, 57], [13, 46]], 4);
    polygon([[20, 19], [26, 25], [20, 28]], 1);
    polygon([[36, 20], [39, 29], [32, 25]], 1);
    polygon([[15, 34], [25, 38], [30, 47], [20, 43]], 3);
    polygon([[42, 34], [33, 38], [30, 47], [38, 43]], 3);
    rect(22, 33, 2, 2, 1); rect(34, 33, 2, 2, 1); rect(28, 42, 4, 3, 1);
    polygon([[22, 46], [30, 50], [34, 45], [32, 55], [23, 55]], 3);
    rect(17, 56, 8, 2, 1); rect(30, 56, 6, 2, 1);
    for (const x of [9, 43, 59]) rect(x, 49 - variant, 2, 2, 3);
  } else {
    rect(3, 18, 14, 3, 3); rect(7, 15, 7, 3, 3);
    rect(47, 31, 15, 3, 3); rect(51, 28, 7, 3, 3);
    polygon([[0, 55], [13, 41], [29, 57], [46, 43], [64, 53], [64, 64], [0, 64]], 1);
    polygon([[0, 60], [18, 51], [40, 58], [55, 52], [64, 57], [64, 64], [0, 64]], 4);
    const outline = [[20, 12], [25, 7], [39, 7], [45, 13], [46, 23], [41, 33], [36, 39], [28, 39], [22, 31], [18, 23], [18, 17]];
    polygon(outline, 4);
    polygon([[27, 8], [31, 7], [30, 24], [32, 39], [28, 39], [24, 25], [24, 16]], 3);
    polygon([[34, 7], [38, 8], [41, 16], [40, 25], [36, 39], [33, 39], [36, 24]], 3);
    rect(28, 39, 1, 5, 1); rect(35, 39, 1, 5, 1);
    rect(28, 44, 8, 5, 1); rect(29, 44, 6, 3, 3);
    rect(7 + variant * 3, 37, 5, 1, 1);
  }
  return Uint8Array.from({ length: 128 * 128 }, (_, i) => pixels[Math.floor(i / 128 / 2) * 64 + Math.floor(i % 128 / 2)]);
}
