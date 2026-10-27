const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "magazzino.json");
let win, utente = null;

// Account: due ruoli. Le password sono salvate solo come hash; al primo accesso vanno cambiate.
const accountFile = () => path.join(dataDir(), "account.json");
const PASSWORD_INIZIALI = { sviluppatore: "Sviluppo2026", magazziniere: "Magazzino2026" };
const RUOLI = { sviluppatore: "Sviluppatore", magazziniere: "Magazziniere" };
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
function nuovoAccount(user) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { user, ruolo: user, salt, hash: hash(PASSWORD_INIZIALI[user], salt), cambiaPassword: true };
}
function leggiAccount() {
  try { return JSON.parse(fs.readFileSync(accountFile(), "utf8")); }
  catch {
    const acc = { utenti: Object.keys(PASSWORD_INIZIALI).map(nuovoAccount) };
    scriviAccount(acc);
    return acc;
  }
}
function scriviAccount(acc) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(accountFile(), JSON.stringify(acc, null, 2));
}
const trova = (acc, user) => acc.utenti.find(u => u.user === String(user).trim().toLowerCase());
const passwordOk = (u, pw) => crypto.timingSafeEqual(Buffer.from(u.hash, "hex"), Buffer.from(hash(String(pw), u.salt), "hex"));

ipcMain.handle("login", (e, user, pw) => {
  const u = trova(leggiAccount(), user);
  if (!u || !passwordOk(u, pw)) return { ok: false };
  if (u.cambiaPassword) return { ok: false, cambiaPassword: true };
  utente = { user: u.user, ruolo: u.ruolo, nome: RUOLI[u.ruolo] };
  creaMenu();
  win.loadFile(path.join(__dirname, "src", "index.html"));
  return { ok: true };
});

ipcMain.handle("cambiaPassword", (e, user, vecchia, nuova) => {
  const acc = leggiAccount(), u = trova(acc, user);
  if (!u || !passwordOk(u, vecchia)) return { ok: false, errore: "Nome utente o password attuale errati." };
  if (String(nuova).length < 8) return { ok: false, errore: "La nuova password deve avere almeno 8 caratteri." };
  if (nuova === vecchia) return { ok: false, errore: "La nuova password deve essere diversa da quella attuale." };
  u.salt = crypto.randomBytes(16).toString("hex");
  u.hash = hash(String(nuova), u.salt);
  u.cambiaPassword = false;
  scriviAccount(acc);
  return { ok: true };
});

ipcMain.on("utente", e => { e.returnValue = utente; });
ipcMain.on("logout", () => esci());

function esci() {
  utente = null;
  creaMenu();
  win.loadFile(path.join(__dirname, "src", "login.html"));
}
const isDev = () => utente?.ruolo === "sviluppatore";

// Lettura sincrona: la pagina carica i dati prima del primo disegno
ipcMain.on("load", e => {
  if (!utente) { e.returnValue = null; return; }
  try { e.returnValue = JSON.parse(fs.readFileSync(dataFile(), "utf8")); }
  catch { e.returnValue = null; }
});

// Scrittura su file temporaneo e poi rinomina, così un'interruzione non rovina i dati; tiene una copia del salvataggio precedente
ipcMain.on("save", (e, data) => {
  if (!utente) { e.returnValue = false; return; }
  try {
    const f = dataFile(), tmp = f + ".tmp";
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data));
    if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak");
    fs.renameSync(tmp, f);
    e.returnValue = true;
  } catch (err) {
    console.error(err);
    e.returnValue = false;
  }
});

async function esporta() {
  if (!fs.existsSync(dataFile())) return dialog.showMessageBox(win, { message: "Non ci sono ancora dati salvati da esportare." });
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Esporta backup",
    defaultPath: `backup-magazzino-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "Backup magazzino", extensions: ["json"] }]
  });
  if (!canceled) fs.copyFileSync(dataFile(), filePath);
}

async function importa() {
  if (!isDev()) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Importa backup",
    filters: [{ name: "Backup magazzino", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (canceled) return;
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], "utf8"));
    if (!Array.isArray(data.art) || !Array.isArray(data.cantieri)) throw new Error("formato");
    const ok = await dialog.showMessageBox(win, { type: "warning", buttons: ["Importa", "Annulla"], defaultId: 1, message: "I dati attuali verranno sostituiti con quelli del backup. Continuare?" });
    if (ok.response !== 0) return;
    fs.writeFileSync(dataFile(), JSON.stringify(data));
    win.reload();
  } catch {
    dialog.showErrorBox("Importazione non riuscita", "Il file scelto non è un backup del magazzino.");
  }
}

async function azzera() {
  if (!isDev()) return;
  const ok = await dialog.showMessageBox(win, { type: "warning", buttons: ["Ricomincia", "Annulla"], defaultId: 1, message: "Cancellare tutti i dati e ripartire dai dati di esempio?", detail: "Prima conviene esportare un backup." });
  if (ok.response !== 0) return;
  if (fs.existsSync(dataFile())) fs.renameSync(dataFile(), dataFile() + ".bak");
  win.reload();
}

async function reimpostaPassword(user) {
  if (!isDev()) return;
  const ok = await dialog.showMessageBox(win, { type: "warning", buttons: ["Reimposta", "Annulla"], defaultId: 1, message: `Reimpostare la password dell'account ${RUOLI[user]}?`, detail: `Tornerà a "${PASSWORD_INIZIALI[user]}" e andrà cambiata al prossimo accesso.` });
  if (ok.response !== 0) return;
  const acc = leggiAccount(), i = acc.utenti.findIndex(u => u.user === user);
  acc.utenti[i] = nuovoAccount(user);
  scriviAccount(acc);
  if (utente?.user === user) esci();
}

// Il menu cambia in base a chi è entrato: il magazziniere non può importare o cancellare i dati
function creaMenu() {
  const dev = isDev();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Esporta backup…", accelerator: "CmdOrCtrl+S", click: esporta, enabled: !!utente },
      ...(dev ? [
        { label: "Importa backup…", click: importa },
        { label: "Apri cartella dati", click: () => shell.openPath(dataDir()) },
        { type: "separator" },
        { label: "Ricomincia con dati di esempio…", click: azzera }
      ] : []),
      { type: "separator" },
      { label: "Cambia utente", click: esci, enabled: !!utente },
      { label: "Esci", role: "quit" }
    ]},
    ...(dev ? [{ label: "Account", submenu: [
      { label: "Reimposta password magazziniere…", click: () => reimpostaPassword("magazziniere") },
      { label: "Reimposta password sviluppatore…", click: () => reimpostaPassword("sviluppatore") }
    ]}, { label: "Sviluppo", submenu: [
      { label: "Strumenti per sviluppatori", role: "toggleDevTools" },
      { label: "Forza ricarica", role: "forceReload" }
    ]}] : []),
    { label: "Visualizza", submenu: [
      { label: "Ricarica", role: "reload" },
      { label: "Ingrandisci", role: "zoomIn" },
      { label: "Rimpicciolisci", role: "zoomOut" },
      { label: "Dimensione normale", role: "resetZoom" },
      { type: "separator" },
      { label: "Schermo intero", role: "togglefullscreen" }
    ]},
    { label: "Aiuto", submenu: [
      { label: "Informazioni", click: () => dialog.showMessageBox(win, { message: `Magazzino Elettrico ${app.getVersion()}`, detail: `Versione beta.${utente ? `\nAccesso come: ${utente.nome}` : ""}\nDati salvati in:\n${dataFile()}` }) }
    ]}
  ]));
}

app.whenReady().then(() => {
  creaMenu();
  win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 420, minHeight: 500,
    title: "Magazzino Elettrico",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true }
  });
  leggiAccount();
  win.loadFile(path.join(__dirname, "src", "login.html"));
  // I link esterni si aprono nel browser, non dentro l'app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
});

app.on("window-all-closed", () => app.quit());
