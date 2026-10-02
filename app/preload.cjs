const { contextBridge, ipcRenderer } = require("electron");
const names = [
  "info",
  "notices",
  "chooseFolders",
  "chooseDestination",
  "scan",
  "cancel",
  "query",
  "stats",
  "selectAll",
  "row",
  "read",
  "inspect",
  "convert",
  "annotate",
  "annotateMany",
  "saveAnalysis",
  "duplicates",
  "duplicateGroups",
  "transferPlan",
  "transferExecute",
  "reveal",
  "exportCsv",
  "ai",
  "setKey",
  "metadata",
  "saveCollection",
  "collectionMembers",
  "deleteCollection",
  "savedSearches",
  "view",
  "thumbnails",
  "stopThumbnails",
  "costProfiles",
  "saveCostProfile",
  "exportCostProfile",
  "importGcodeCost",
  "saveCostEstimate",
  "costEstimate",
  "meshAnalyze",
  "meshPrepare",
  "readEdit",
  "meshExport",
];
const api = Object.fromEntries(
  names.map((name) => [
    name,
    (...args) => ipcRenderer.invoke("scout:" + name, ...args),
  ]),
);
api.onProgress = (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on("scout:progress", listener);
  return () => ipcRenderer.removeListener("scout:progress", listener);
};
api.onThumbnail = (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on("scout:thumbnail", listener);
  return () => ipcRenderer.removeListener("scout:thumbnail", listener);
};
contextBridge.exposeInMainWorld("scout", api);
