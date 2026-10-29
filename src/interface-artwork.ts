export const PREVIEW_GRAIN = 3;

// Compose directly in screen coordinates so every grain and slope keeps its shape.
export function createPreviewArtwork(width: number, height: number): Uint8Array {
  const columns = Math.ceil(width / PREVIEW_GRAIN);
  const rows = Math.ceil(height / PREVIEW_GRAIN);
  const cells = new Uint8Array(columns * rows);
  const unit = Math.min(width, height);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + .5) * PREVIEW_GRAIN;
      const y = (row + .5) * PREVIEW_GRAIN;
      let color = 4;
      if ((x - width * .7) ** 2 + (y - height * .22) ** 2 < (unit * .13) ** 2) color = 3;
      const ridge = Math.min(
        height * .78 - unit * .42 + .92 * Math.abs(x - width * .32),
        height * .78 - unit * .25 + .7 * Math.abs(x - width * .83),
      );
      if (y > ridge) color = 2;
      if (y >= height * .8 + Math.sin(x / 35) * unit * .015) color = 1;
      cells[row * columns + column] = color;
    }
  }
  return cells;
}
