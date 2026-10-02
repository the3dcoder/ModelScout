const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
async function fixture(name) {
  const root = path.resolve(".test-data", name + "-" + crypto.randomUUID());
  await fs.mkdir(root, { recursive: true });
  return root;
}
function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name),
      data = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(filename.length, 26);
    local.push(h, filename, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += h.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22),
    cd = Buffer.concat(central);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const STL = `solid tetrahedron
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 20 0
vertex 20 0 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 20 0 0
vertex 0 0 20
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 0 20
vertex 0 20 0
endloop
endfacet
facet normal 1 1 1
outer loop
vertex 20 0 0
vertex 0 20 0
vertex 0 0 20
endloop
endfacet
endsolid tetrahedron`;
module.exports = { fixture, zip, STL };
