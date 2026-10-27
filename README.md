# Magazzino Elettrico

Gestione del magazzino per installatori elettrici. Versione beta 0.1.0.

- `windows/`: app Windows completa (Electron). `npm install`, poi `npm start` per provarla e `npm run dist` per creare gli .exe.
- `windows-leggera/`: app Windows leggera (Neutralino, circa 1 MB). Si crea con `npx @neutralinojs/neu build`.
- `ios/`: progetto Xcode per iPhone e iPad.
- `.github/workflows/testflight.yml`: compila l'app iPhone su un Mac di GitHub e la carica su TestFlight.

## Pubblicare la beta su TestFlight senza Mac

1. Iscriversi all'Apple Developer Program.
2. In App Store Connect > App > "+" > Nuova app: piattaforma iOS, nome "Magazzino Elettrico",
   Bundle ID `it.magazzino.elettrico` (se non compare, va prima registrato in developer.apple.com > Identifiers;
   se è già preso, cambiarlo anche in `ios/MagazzinoElettrico.xcodeproj`).
3. In App Store Connect > Utenti e accessi > Integrazioni > Chiavi API dell'App Store Connect:
   generare una chiave con ruolo **Admin**, scaricare il file `.p8` (si scarica una volta sola) e annotare Key ID e Issuer ID.
4. Il Team ID si trova in developer.apple.com > Account > Membership details.
5. In questo repository: Settings > Secrets and variables > Actions > New repository secret:
   nome `ASC_KEY_P8`, valore il testo completo del file .p8. Team ID, Key ID e Issuer ID sono già nel workflow.
6. Actions > TestFlight > Run workflow. Dopo circa 15 minuti la build compare in App Store Connect > TestFlight.
7. Aggiungere i tester (gruppo interno subito, gruppo esterno o link pubblico dopo la revisione Apple).

Account dell'app: Magazziniere e Sviluppatore. Le password iniziali sono nelle istruzioni consegnate ai tester e vanno cambiate al primo accesso.
