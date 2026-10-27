import SwiftUI
import WebKit

// L'interfaccia è la stessa dell'app Windows (cartella Web); qui c'è solo il contenitore e il ponte verso i dati
struct WebView: UIViewRepresentable {
    func makeCoordinator() -> Ponte { Ponte() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "magazzino")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        if #available(iOS 16.4, *) { web.isInspectable = true }
        context.coordinator.web = web
        context.coordinator.apri("login")
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// Espone alla pagina window.magazzino con le stesse funzioni della versione Windows (preload.js)
final class Ponte: NSObject, WKScriptMessageHandlerWithReply {
    let archivio = Archivio()
    weak var web: WKWebView?

    func apri(_ pagina: String) {
        guard let web, let cartella = Bundle.main.url(forResource: "Web", withExtension: nil) else { return }
        let dati = pagina == "index" ? archivio.datiJSON() : "null"
        let shim = """
        window.magazzino = (() => {
          const dati = \(dati);
          const utente = \(archivio.utenteJSON());
          const invia = (azione, extra) => window.webkit.messageHandlers.magazzino.postMessage(Object.assign({azione}, extra));
          return {
            load: () => dati,
            save: d => { invia("salva", {dati: JSON.stringify(d)}); return true; },
            utente: () => utente,
            login: (user, pw) => invia("login", {user, pw}),
            cambiaPassword: (user, vecchia, nuova) => invia("cambiaPassword", {user, vecchia, nuova}),
            logout: () => invia("logout", {})
          };
        })();
        """
        let ucc = web.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.addUserScript(WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.loadFileURL(cartella.appendingPathComponent("\(pagina).html"), allowingReadAccessTo: cartella)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let corpo = message.body as? [String: Any], let azione = corpo["azione"] as? String else {
            replyHandler(nil, "Messaggio non valido")
            return
        }
        let testo = { (chiave: String) -> String in corpo[chiave] as? String ?? "" }
        switch azione {
        case "salva":
            replyHandler(archivio.salva(testo("dati")), nil)
        case "login":
            let esito = archivio.login(testo("user"), testo("pw"))
            replyHandler(esito, nil)
            if esito["ok"] as? Bool == true { apri("index") }
        case "cambiaPassword":
            replyHandler(archivio.cambiaPassword(testo("user"), testo("vecchia"), testo("nuova")), nil)
        case "logout":
            archivio.esci()
            replyHandler(nil, nil)
            apri("login")
        default:
            replyHandler(nil, "Azione sconosciuta")
        }
    }
}
