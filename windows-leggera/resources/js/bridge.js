// Ponte verso il PC per la versione leggera (Neutralino): stesse funzioni di window.magazzino della versione Electron.
// Dati e account in %APPDATA%\MagazzinoElettrico, password salvate solo come hash PBKDF2.
window.magazzino = (() => {
  const PASSWORD_INIZIALI = { magazziniere: "Magazzino2026", sviluppatore: "Sviluppo2026" };
  const NOMI = { sviluppatore: "Sviluppatore", magazziniere: "Magazziniere" };
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  const nuovoSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
  async function hash(pw, salt) {
    const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256));
  }

  let cartella, dati = null, utente = null, ultimo = null, coda = Promise.resolve();
  const file = nome => `${cartella}/${nome}`;
  const leggi = async nome => { try { return await Neutralino.filesystem.readFile(file(nome)); } catch { return null; } };
  const scrivi = (nome, testo) => Neutralino.filesystem.writeFile(file(nome), testo);

  async function account() {
    const t = await leggi("account.json");
    if (t) return JSON.parse(t);
    const acc = { utenti: [] };
    for (const user of Object.keys(PASSWORD_INIZIALI)) {
      const salt = nuovoSalt();
      acc.utenti.push({ user, ruolo: user, salt, hash: await hash(PASSWORD_INIZIALI[user], salt), cambiaPassword: true });
    }
    await scrivi("account.json", JSON.stringify(acc, null, 2));
    return acc;
  }

  // Modulo di accesso: al primo accesso chiede di cambiare la password, poi sblocca l'app
  function accesso() {
    return new Promise(fatto => {
      const $ = id => document.getElementById(id);
      let cambio = false;
      const mostraNuova = si => { cambio = si; $("nuova").hidden = !si; $("nuova").style.display = si ? "grid" : "none"; $("n1").required = $("n2").required = si; $("go").textContent = si ? "Salva password ed entra" : "Entra"; };
      mostraNuova(false);
      $("p").focus();
      $("u").addEventListener("change", () => { mostraNuova(false); $("err").textContent = ""; });
      $("f").addEventListener("submit", async e => {
        e.preventDefault();
        $("err").textContent = "";
        const acc = await account(), u = acc.utenti.find(x => x.user === $("u").value), pw = $("p").value;
        if (!u || await hash(pw, u.salt) !== u.hash) { $("err").textContent = "Password errata."; $("p").select(); return; }
        if (u.cambiaPassword && !cambio) { mostraNuova(true); $("n1").focus(); return; }
        if (cambio) {
          const n = $("n1").value;
          if (n !== $("n2").value) { $("err").textContent = "Le due password nuove non coincidono."; return; }
          if (n.length < 8) { $("err").textContent = "La nuova password deve avere almeno 8 caratteri."; return; }
          if (n === pw) { $("err").textContent = "La nuova password deve essere diversa da quella attuale."; return; }
          u.salt = nuovoSalt(); u.hash = await hash(n, u.salt); u.cambiaPassword = false;
          await scrivi("account.json", JSON.stringify(acc, null, 2));
        }
        utente = { user: u.user, ruolo: u.ruolo, nome: NOMI[u.ruolo] };
        fatto();
      });
    });
  }

  const pronto = (async () => {
    Neutralino.init();
    await new Promise(r => Neutralino.events.on("ready", r));
    cartella = (await Neutralino.os.getPath("data")).replace(/\\/g, "/") + "/MagazzinoElettrico";
    try { await Neutralino.filesystem.createDirectory(cartella); } catch { /* esiste già */ }
    await account();
    await accesso();
    ultimo = await leggi("magazzino.json");
    dati = ultimo ? JSON.parse(ultimo) : null;
    document.getElementById("accesso").hidden = true;
    document.getElementById("accesso").style.display = "none";
    document.getElementById("app").hidden = false;
  })();

  return {
    pronto,
    load: () => dati,
    utente: () => utente,
    // La scrittura avviene in coda, una alla volta; il salvataggio precedente resta in magazzino.json.bak
    save: d => {
      const testo = JSON.stringify(d);
      coda = coda.then(async () => {
        if (ultimo) await scrivi("magazzino.json.bak", ultimo);
        await scrivi("magazzino.json", testo);
        ultimo = testo;
      }).catch(e => Neutralino.debug.log(String(e?.message || e), "ERROR"));
      return true;
    },
    esporta: async () => {
      await coda;
      const oggi = new Date().toISOString().slice(0, 10);
      const dove = await Neutralino.os.showSaveDialog("Esporta backup", { defaultPath: `backup-magazzino-${oggi}.json`, filters: [{ name: "Backup magazzino", extensions: ["json"] }] });
      if (!dove) return false;
      await Neutralino.filesystem.writeFile(dove, ultimo || "{}");
      return true;
    },
    logout: async () => { await coda; location.reload(); }
  };
})();
