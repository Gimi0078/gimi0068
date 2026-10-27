import Foundation
import CommonCrypto

// Dati e account salvati sul telefono, nella cartella dell'app. Stesso formato della versione Windows,
// così un backup esportato dal PC si può riusare.
final class Archivio {
    static let passwordIniziali = ["sviluppatore": "Sviluppo2026", "magazziniere": "Magazzino2026"]
    static let nomi = ["sviluppatore": "Sviluppatore", "magazziniere": "Magazziniere"]

    struct Account: Codable {
        var user: String
        var ruolo: String
        var salt: String
        var hash: String
        var cambiaPassword: Bool
    }
    struct Elenco: Codable { var utenti: [Account] }
    struct Utente: Codable {
        let user: String
        let ruolo: String
        let nome: String
    }

    private let cartella: URL
    private var fileDati: URL { cartella.appendingPathComponent("magazzino.json") }
    private var fileBackup: URL { cartella.appendingPathComponent("magazzino.json.bak") }
    private var fileAccount: URL { cartella.appendingPathComponent("account.json") }
    private(set) var utente: Utente?

    init() {
        cartella = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: cartella, withIntermediateDirectories: true)
        _ = leggiAccount()
    }

    // MARK: Dati del magazzino

    func datiJSON() -> String {
        guard utente != nil, let d = try? Data(contentsOf: fileDati), let s = String(data: d, encoding: .utf8) else { return "null" }
        return s
    }

    func salva(_ json: String) -> Bool {
        guard utente != nil, let d = json.data(using: .utf8) else { return false }
        let fm = FileManager.default
        if fm.fileExists(atPath: fileDati.path) {
            try? fm.removeItem(at: fileBackup)
            try? fm.copyItem(at: fileDati, to: fileBackup)
        }
        do {
            try d.write(to: fileDati, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    // MARK: Account

    func utenteJSON() -> String {
        guard let utente, let d = try? JSONEncoder().encode(utente), let s = String(data: d, encoding: .utf8) else { return "null" }
        return s
    }

    func login(_ user: String, _ pw: String) -> [String: Any] {
        guard let u = trova(leggiAccount(), user), Self.hash(pw, salt: u.salt) == u.hash else { return ["ok": false] }
        if u.cambiaPassword { return ["ok": false, "cambiaPassword": true] }
        utente = Utente(user: u.user, ruolo: u.ruolo, nome: Self.nomi[u.ruolo] ?? u.ruolo)
        return ["ok": true]
    }

    func cambiaPassword(_ user: String, _ vecchia: String, _ nuova: String) -> [String: Any] {
        var elenco = leggiAccount()
        guard let i = elenco.utenti.firstIndex(where: { $0.user == normalizza(user) }),
              Self.hash(vecchia, salt: elenco.utenti[i].salt) == elenco.utenti[i].hash else {
            return ["ok": false, "errore": "Nome utente o password attuale errati."]
        }
        if nuova.count < 8 { return ["ok": false, "errore": "La nuova password deve avere almeno 8 caratteri."] }
        if nuova == vecchia { return ["ok": false, "errore": "La nuova password deve essere diversa da quella attuale."] }
        let salt = Self.nuovoSalt()
        elenco.utenti[i].salt = salt
        elenco.utenti[i].hash = Self.hash(nuova, salt: salt)
        elenco.utenti[i].cambiaPassword = false
        scrivi(elenco)
        return ["ok": true]
    }

    func esci() { utente = nil }

    private func normalizza(_ user: String) -> String { user.trimmingCharacters(in: .whitespaces).lowercased() }
    private func trova(_ elenco: Elenco, _ user: String) -> Account? { elenco.utenti.first { $0.user == normalizza(user) } }

    private func leggiAccount() -> Elenco {
        if let d = try? Data(contentsOf: fileAccount), let elenco = try? JSONDecoder().decode(Elenco.self, from: d) { return elenco }
        let elenco = Elenco(utenti: Self.passwordIniziali.keys.sorted().map { user in
            let salt = Self.nuovoSalt()
            return Account(user: user, ruolo: user, salt: salt, hash: Self.hash(Self.passwordIniziali[user]!, salt: salt), cambiaPassword: true)
        })
        scrivi(elenco)
        return elenco
    }

    private func scrivi(_ elenco: Elenco) {
        if let d = try? JSONEncoder().encode(elenco) { try? d.write(to: fileAccount, options: [.atomic, .completeFileProtection]) }
    }

    private static func nuovoSalt() -> String {
        (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }

    // PBKDF2-SHA256: la password non viene mai salvata in chiaro
    private static func hash(_ pw: String, salt: String) -> String {
        var out = [UInt8](repeating: 0, count: 32)
        let pwLen = pw.utf8.count
        let saltBytes = Array(salt.utf8)
        _ = CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), pw, pwLen, saltBytes, saltBytes.count,
                                 CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 100_000, &out, out.count)
        return out.map { String(format: "%02x", $0) }.joined()
    }
}
