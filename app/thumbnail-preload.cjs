const { contextBridge, ipcRenderer } = require("electron");
let token;
contextBridge.exposeInMainWorld("scout", {
  read: () => ipcRenderer.invoke("scout:thumb:read", token),
  convert: () => ipcRenderer.invoke("scout:thumb:convert", token),
});
contextBridge.exposeInMainWorld("thumbnailWorker", {
  onJob(callback) {
    const listener = (_event, job) => {
      token = job?.token;
      callback(job);
    };
    ipcRenderer.on("scout:thumb:job", listener);
    ipcRenderer.invoke("scout:thumb:ready");
    return () => ipcRenderer.removeListener("scout:thumb:job", listener);
  },
  result: (jobToken, data) =>
    ipcRenderer.invoke("scout:thumb:result", jobToken, data),
});
