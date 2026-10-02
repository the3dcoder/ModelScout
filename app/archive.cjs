const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");
const yauzl = require("yauzl");
const path = require("node:path");
const SEVEN = [
  "C:\\Program Files\\7-Zip\\7z.exe",
  "C:\\Program Files (x86)\\7-Zip\\7z.exe",
].find((p) => fs.existsSync(p));
const LIMIT = 128 * 1024 * 1024;
function safeMember(name) {
  return (
    typeof name === "string" &&
    !/[\x00-\x1f<>:"|?*]/.test(name) &&
    !name
      .replaceAll("\\", "/")
      .split("/")
      .some(
        (x) =>
          x === ".." ||
          /[. ]$/.test(x) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x),
      ) &&
    !/^(\/|\\|[a-z]:)/i.test(name)
  );
}
function run7(args, limit = 32 * 1024 * 1024, signal) {
  if (!SEVEN)
    return Promise.reject(
      new Error(
        "Install 7-Zip to read 7z / RAR archives. ZIP scanning works without it.",
      ),
    );
  return new Promise((resolve, reject) => {
    const child = spawn(SEVEN, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    const chunks = [];
    let length = 0;
    let error = "";
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
      reject(new Error("Archive operation exceeded two minutes."));
    }, 120000);
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > limit) {
        failed = true;
        child.kill();
        reject(new Error("Archive output exceeds the safety limit."));
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (error.length < 3000) error += chunk.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!failed)
        code === 0
          ? resolve(Buffer.concat(chunks))
          : reject(
              new Error(
                `Archive unavailable, encrypted, or damaged (7-Zip ${code}). ${error.slice(0, 250)}`,
              ),
            );
    });
  });
}
function zipOpen(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (e, z) =>
      e ? reject(e) : resolve(z),
    ),
  );
}
async function listArchive(file, onEntry, signal) {
  if (path.extname(file).toLowerCase() !== ".zip") {
    const raw = (
      await run7(
        ["l", "-slt", "-ba", "-sccUTF-8", "-p", "--", file],
        32 * 1024 * 1024,
        signal,
      )
    ).toString("utf8");
    for (const block of raw.split(/\r?\n\r?\n/)) {
      if (signal?.aborted) break;
      const values = Object.fromEntries(
        block
          .split(/\r?\n/)
          .filter((s) => s.includes(" = "))
          .map((s) => [
            s.slice(0, s.indexOf(" = ")),
            s.slice(s.indexOf(" = ") + 3),
          ]),
      );
      if (
        values.Path &&
        values.Folder !== "+" &&
        !values.Attributes?.startsWith("D") &&
        safeMember(values.Path)
      )
        await onEntry({ name: values.Path, size: Number(values.Size) || 0 });
    }
    return;
  }
  const zip = await zipOpen(file);
  await new Promise((resolve, reject) => {
    const abort = () => {
      zip.close();
      resolve();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abort);
    zip.on("error", (e) => {
      cleanup();
      reject(e);
    });
    zip.on("end", () => {
      cleanup();
      resolve();
    });
    zip.on("entry", async (entry) => {
      try {
        if (!entry.fileName.endsWith("/") && safeMember(entry.fileName))
          await onEntry({ name: entry.fileName, size: entry.uncompressedSize });
        if (signal?.aborted) abort();
        else zip.readEntry();
      } catch (e) {
        cleanup();
        zip.close();
        reject(e);
      }
    });
    if (signal?.aborted) abort();
    else zip.readEntry();
  });
}
async function readMember(file, member, limit = LIMIT) {
  if (!safeMember(member)) throw new Error("Unsafe archive member path.");
  if (path.extname(file).toLowerCase() !== ".zip")
    return run7(["e", "-so", "-spd", "-p", "--", file, member], limit);
  const zip = await zipOpen(file);
  return new Promise((resolve, reject) => {
    let found = false;
    zip.on("error", reject);
    zip.on("end", () => {
      if (!found) reject(new Error("File no longer exists inside archive."));
    });
    zip.on("entry", (entry) => {
      if (entry.fileName !== member) return zip.readEntry();
      found = true;
      if (entry.uncompressedSize > limit || entry.generalPurposeBitFlag & 1) {
        zip.close();
        return reject(new Error("Archive member is too large or encrypted."));
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err) {
          zip.close();
          return reject(err);
        }
        const chunks = [];
        let n = 0;
        stream.on("data", (chunk) => {
          n += chunk.length;
          if (n > limit)
            stream.destroy(new Error("Decompression limit exceeded."));
          else chunks.push(chunk);
        });
        stream.on("error", (e) => {
          zip.close();
          reject(e);
        });
        stream.on("end", () => {
          zip.close();
          resolve(Buffer.concat(chunks));
        });
      });
    });
    zip.readEntry();
  });
}
module.exports = { SEVEN, LIMIT, safeMember, listArchive, readMember };
