const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magazzino", {
  load: () => ipcRenderer.sendSync("load"),
  save: data => ipcRenderer.sendSync("save", data),
  utente: () => ipcRenderer.sendSync("utente"),
  login: (user, pw) => ipcRenderer.invoke("login", user, pw),
  cambiaPassword: (user, vecchia, nuova) => ipcRenderer.invoke("cambiaPassword", user, vecchia, nuova),
  logout: () => ipcRenderer.send("logout")
});
