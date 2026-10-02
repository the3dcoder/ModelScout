const { Worker } = require("node:worker_threads");
const path = require("node:path");
let active = 0;
function convert(buffer, name, ext) {
  if (active >= 2)
    return Promise.reject(
      new Error("Another model is being converted. Try again shortly."),
    );
  active++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "convert-worker.cjs"), {
      workerData: { buffer, name, ext },
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    });
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      active--;
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error("Conversion exceeded 45 seconds. Try a simplified export."),
        ),
      45000,
    );
    worker.once("message", (value) =>
      finish(value.error ? new Error(value.error) : null, value),
    );
    worker.once("error", (e) => finish(e));
    worker.once("exit", (code) => {
      if (!done) finish(new Error(`Model conversion stopped (${code}).`));
    });
  });
}
module.exports = { convert };
