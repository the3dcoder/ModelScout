const fs = require("node:fs/promises");
const { readRow, unchanged } = require("./files.cjs");
const WINDOW = 256 * 1024;
const same = (a, b) =>
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs &&
  a.ino === b.ino &&
  a.dev === b.dev;
async function readEstimatesText(row) {
  if (row.member) return (await readRow(row)).toString("utf8");
  const before = await unchanged(row);
  const handle = await fs.open(row.path, "r");
  try {
    const stat = await handle.stat();
    if (!same(before, stat))
      throw new Error("Source changed since scanning. Rescan before using it.");
    const headSize = Math.min(stat.size, WINDOW);
    const head = Buffer.alloc(headSize);
    await handle.read(head, 0, headSize, 0);
    const tailStart = Math.max(headSize, stat.size - WINDOW);
    const tail = Buffer.alloc(stat.size - tailStart);
    if (tail.length) await handle.read(tail, 0, tail.length, tailStart);
    const after = await handle.stat();
    if (!same(stat, after) || !same(after, await unchanged(row)))
      throw new Error("Source changed while reading estimates. Rescan.");
    if (tailStart > headSize) {
      // Discard cut lines so partial comments cannot masquerade as estimates.
      return (
        head.toString("utf8").replace(/[^\n]*$/, "") +
        "\n" +
        tail.toString("utf8").replace(/^[^\n]*\n?/, "")
      );
    }
    return Buffer.concat([head, tail]).toString("utf8");
  } finally {
    await handle.close();
  }
}
module.exports = { readEstimatesText };
