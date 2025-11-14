// const { contextBridge, ipcRenderer } = require('electron');

// contextBridge.exposeInMainWorld('electron', {
//   send: (channel, ...args) => ipcRenderer.send(channel, ...args),
//   invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
//   on: (channel, listener) => ipcRenderer.on(channel, (event, ...args) => listener(...args))
// });

// Empty for now; add IPC or contextBridge if needed later.