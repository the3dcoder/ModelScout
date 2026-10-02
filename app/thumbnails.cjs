const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { readRow } = require("./files.cjs");
const { convert } = require("./converter.cjs");

class Thumbnails {
  constructor(catalog, notify) {
    this.catalog = catalog;
    this.notify = notify;
    this.queue = [];
    this.stopped = false;
    ipcMain.handle("scout:thumb:ready", (event) => {
      if (
        this.worker &&
        event.sender === this.worker.webContents &&
        event.senderFrame === this.worker.webContents.mainFrame
      )
        this.ready?.();
    });
    for (const method of ["read", "convert", "result"]) {
      ipcMain.handle("scout:thumb:" + method, async (event, token, data) => {
        if (
          !this.worker ||
          event.sender !== this.worker.webContents ||
          event.senderFrame !== this.worker.webContents.mainFrame ||
          !this.current ||
          token !== this.current.token
        )
          throw new Error("Expired thumbnail request.");
        const job = this.current;
        if (method === "read")
          return { buffer: new Uint8Array(await readRow(job.row)) };
        if (method === "convert") {
          if (!["fbx", "step", "stp", "iges", "igs"].includes(job.row.ext))
            throw new Error("Unsupported conversion.");
          return convert(await readRow(job.row), job.row.name, job.row.ext);
        }
        this.complete(job, data);
      });
    }
  }
  request(ids, retry = false) {
    if (!Array.isArray(ids) || ids.length > 150)
      throw new Error("Request up to 150 thumbnails at a time.");
    this.stopped = false;
    // Replace waiting work when the visible page changes; finish the one already rendering.
    this.queue = [...new Set(ids)]
      .map((id) => this.catalog.get(id))
      .filter(
        (r) =>
          r?.preview &&
          !r.hasThumbnail &&
          (retry || !r.thumbError) &&
          r.id !== this.current?.row.id,
      );
    this.pump();
    return this.queue.length + (this.current ? 1 : 0);
  }
  async window() {
    if (this.worker && !this.worker.isDestroyed()) return this.worker;
    const worker = (this.worker = new BrowserWindow({
      show: false,
      width: 360,
      height: 300,
      webPreferences: {
        preload: path.join(__dirname, "thumbnail-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    }));
    worker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    worker.webContents.on("will-navigate", (e) => e.preventDefault());
    worker.webContents.on("render-process-gone", () => {
      if (this.current)
        this.fail(
          this.current,
          "Thumbnail renderer stopped. Try opening this file individually.",
        );
    });
    const ready = new Promise((resolve) => {
      this.ready = resolve;
    });
    await worker.loadURL("scout://app/thumbnail.html");
    await ready;
    return worker;
  }
  async pump() {
    if (this.current || this.stopped || !this.queue.length) return;
    const row = this.queue.shift();
    if (this.catalog.get(row.id)?.version !== row.version) return this.pump();
    const job = (this.current = { row, token: crypto.randomUUID() });
    job.timer = setTimeout(
      () =>
        this.fail(
          job,
          "Thumbnail took too long. Open the file individually or retry.",
        ),
      55000,
    );
    try {
      const worker = await this.window();
      if (this.current !== job) return;
      worker.webContents.send("scout:thumb:job", {
        token: job.token,
        file: row,
      });
    } catch (e) {
      this.fail(job, e.message);
    }
  }
  complete(job, data) {
    if (this.current !== job) return;
    if (data?.error)
      return this.fail(job, String(data.error).slice(0, 500), false);
    const image = data?.image;
    if (
      typeof image !== "string" ||
      !image.startsWith("data:image/png;base64,") ||
      image.length > 400000
    )
      return this.fail(job, "Invalid thumbnail image.", false);
    const buffer = Buffer.from(image.slice(22), "base64");
    if (
      buffer.length < 24 ||
      buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      buffer.readUInt32BE(16) > 720 ||
      buffer.readUInt32BE(20) > 600
    )
      return this.fail(job, "Invalid thumbnail dimensions.", false);
    if (this.catalog.saveThumbnail(job.row.id, job.row.version, buffer)) {
      if (data.facts && JSON.stringify(data.facts).length < 16000)
        this.catalog.analysis(job.row.id, data.facts, job.row.version);
      this.notify({ id: job.row.id, version: job.row.version, ready: true });
    }
    this.next(job);
  }
  fail(job, error, destroy = true) {
    if (this.current !== job) return;
    if (destroy) {
      this.ready?.();
      const worker = this.worker;
      this.worker = null;
      worker?.destroy();
    }
    if (this.catalog.saveThumbnail(job.row.id, job.row.version, null, error))
      this.notify({ id: job.row.id, version: job.row.version, error });
    this.next(job);
  }
  next(job) {
    clearTimeout(job.timer);
    this.current = null;
    if (this.worker && !this.worker.isDestroyed())
      this.worker.webContents.send("scout:thumb:job", null);
    setImmediate(() => this.pump());
  }
  stop() {
    this.stopped = true;
    this.queue = [];
    if (this.current) clearTimeout(this.current.timer);
    this.current = null;
    this.ready?.();
    const worker = this.worker;
    this.worker = null;
    worker?.destroy();
  }
}
module.exports = { Thumbnails };
