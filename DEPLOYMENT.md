# Karrie op Render zetten

Karrie is een statische Progressive Web App. Na de eerste online opening blijven boodschappenlijstjes in de browser staan en werkt de winkelmodus zonder internet.

Render geeft het vaste HTTPS-adres. Dat adres is ook het veilige origin dat de barcodescanner nodig heeft: browsers geven alleen camera-toegang via HTTPS. `localhost` is tijdens ontwikkeling eveneens een secure context. Een los `file://`-bestand of een lokaal IP-adres zonder certificaat is dat niet. De camera wordt pas gevraagd als iemand op een scanknop tikt.

## 1. Lokaal controleren

Node 20 of nieuwer. In de projectmap:

```bash
npm ci
npm test
npm run build
```

`npm run build` moet zonder fouten eindigen. De site staat daarna in `dist/`.

## 2. GitHub

Commit ook `package-lock.json`. Zonder dat bestand faalt `npm ci` op Render.

1. Maak een GitHub-repository.
2. Push deze map naar de standaardbranch.

## 3. Render via de blueprint

1. Open [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Koppel de GitHub-repository.
3. Render leest [`render.yaml`](render.yaml):
   - static site `karrieapp`
   - build: `npm ci && npm run build`
   - publish-map: `dist`
   - rewrite van `/*` naar `/index.html`, zodat `/winkel` bij verversen de app blijft
4. Bevestig het blueprint. Render bouwt en geeft één adres, `https://karrieapp.onrender.com`.
5. Elke push naar de gekoppelde branch publiceert opnieuw naar datzelfde adres.

Bestaande bestanden (JavaScript, iconen, service worker) worden rechtstreeks geserveerd. Alleen paden zonder bestand vallen terug op `index.html`.

## Handmatig, zonder blueprint

Maak een **Static Site** met dezelfde waarden:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Rewrite: source `/*`, destination `/index.html`, action **Rewrite**

Zet `NODE_VERSION` op `22` als de build om een Node-versie vraagt.

## Op een telefoon zetten

Gebruik het HTTPS-adres, niet een lokaal IP-adres zonder certificaat.

**iPhone Safari**

1. Open het adres in Safari.
2. Deel → **Zet op beginscherm**.
3. Open Karrie vanaf het icoon. De app draait dan schermvullend.

**Android Chrome**

1. Open het adres in Chrome.
2. Menu → **App installeren** of **Toevoegen aan startscherm**.
3. Open Karrie vanaf het icoon.

## Checklist op iPhone en Android

- Het startscherm toont Karrie en **Speur, vind en vink af!**
- **Probeer het voorbeeld** opent de winkelmodus met één groot product, zonder toetsenbord.
- Karrie kijkt door een grote verrekijker zolang hij zoekt.
- **Gevonden!** laat het product naar het mandje vliegen en een ster naar de teller. Dubbel tikken telt maar één keer.
- **Terug** zet de laatste tik terug. **Later** bewaart het product voor straks. Het product naar links vegen doet hetzelfde als **Later**.
- Op Android trilt de telefoon kort bij **Gevonden!**. Safari op iPhone ondersteunt trillen niet.
- Vernieuw de pagina op `/winkel`. Hetzelfde lijstje staat er nog.
- Maak een nieuw lijstje en tik op **Bewaren**. Het beginscherm meldt **Lijstje bewaard** en toont **Verder met lijstje** en een kaart **Bewaard**.
- Plak een korte lijst, controleer hem en start het avontuur.
- Geluid staat standaard uit. Zet het aan via het tandwiel op het beginscherm en hoor een plopje bij **Gevonden!**.
- Zet het toestel daarna in vliegtuigmodus en open het beginscherm-icoon opnieuw. De winkelmodus werkt nog.
- De eerste keer openen heeft internet nodig, zodat de app en de service worker binnenkomen.
- Zie je na een nieuwe deploy nog de oude versie? Sluit de app helemaal en open hem opnieuw. De service worker werkt zichzelf bij.

### Barcodescanner (alleen op een echte telefoon te testen)

- **Toevoegen**: tik op de turquoise barcodeknop naast het zoekveld. De telefoon vraagt één keer om camera-toegang. Sta toe.
- Scan een bekend product (bijvoorbeeld Nutella, `3017620422003`). Je ziet de foto, naam, merk, inhoud en een categorie. **Toevoegen aan lijst** zet het product met foto op de lijst.
- Scan hetzelfde product nog eens. Je krijgt **Staat al op je lijst** met **+1 erbij**, geen dubbele regel.
- Zet eerst **Pindakaas** uit de catalogus op de lijst en scan dan een pot pindakaas. De app vraagt **Wil je deze productfoto gebruiken voor Pindakaas?** en vervangt niets vanzelf.
- Scan iets wat Open Food Facts niet kent. Je ziet **Dit product kennen we nog niet.** Geef het een naam en tik op **Toch toevoegen**.
- Tik bij **Controleren** op een productplaatje. Probeer **Gebruik Karrie-tekening**, **Scan andere verpakking** en **Verwijder van lijst**. Na verwijderen staat **Ongedaan maken** vijf seconden in beeld.
- **Winkel**: tik op **Scan de barcode** onder de productnaam.
  - Product met een gescande verpakking, goede barcode: groene flits, **Jaaa! Dat is precies de goede!** en 3 sterren in plaats van 1.
  - Verkeerde barcode: het kader schudt zacht, **Oeps! Dat is een andere. Probeer nog eens!** en de camera gaat na ruim een seconde weer aan. Er gaan geen sterren af.
  - Algemeen product (bijvoorbeeld Pindakaas zonder foto): na het scannen vraagt Karrie **Is dit de pindakaas die jullie zoeken?** Een ouder tikt **Ja, dat is hem**.
  - Geen internet of onbekend product: **Karrie kan deze nu niet checken. Tik op Gevonden!** Gevonden geeft dan 1 ster.
  - Losse groente en fruit zonder barcode tonen geen scanknop.
  - **Terug** zet ook de bonussterren terug.
- Weiger de camera een keer. De scanner legt uit hoe je toegang geeft en **Typ de cijfers** blijft werken.
- Zet de app op de achtergrond terwijl de scanner open is. Het cameralampje moet uitgaan.
- Start een avontuur met fotoproducten, zet daarna vliegtuigmodus aan en ververs `/winkel`. De foto's staan er nog, en scannen van een product met gescande verpakking geeft nog steeds bonussterren.
- Getest op iPhone (Safari en geïnstalleerde app) en Android (Chrome en geïnstalleerde app)? Noteer welk toestel en welke versie.

## Open Food Facts

Karrie zoekt gescande barcodes op in [Open Food Facts](https://world.openfoodfacts.org), een open database van voedingsproducten.

**Waarom geen eigen server**

- De API (`/api/v3/product/{ean}`) en de productfoto's (`images.openfoodfacts.org`) sturen `Access-Control-Allow-Origin: *`. De browser mag ze dus rechtstreeks ophalen. Dat is gecontroleerd vanaf een browserpagina.
- Er is geen API-sleutel nodig. Er staan dus ook geen geheimen in de frontend.
- Een browser mag geen eigen `User-Agent` zetten. Karrie identificeert zich daarom met `app_name=Karrie&app_version=…` in de URL, zoals Open Food Facts vraagt.
- De Render-site blijft een gratis static site.

**Limieten en cache**

- Open Food Facts staat ongeveer 100 productopvragingen per minuut per IP toe. Karrie wacht minstens 700 ms tussen twee verzoeken, voegt gelijktijdige scans van dezelfde code samen en probeert bij `429` of `503` hoogstens twee keer opnieuw (na 1 en 3 seconden, of na de `Retry-After` van de server).
- Gevonden producten blijven 30 dagen in IndexedDB (store `products`), onbekende codes 1 dag. Zonder internet gebruikt Karrie ook een oudere opgeslagen versie.
- Productfoto's komen in de service-worker-cache `off-images` (maximaal 300 stuks, 90 dagen). Bij **Start avontuur** haalt Karrie alle foto's van het lijstje alvast op.
- Een exacte barcodecheck in de winkel vergelijkt alleen de opgeslagen EAN met de gescande. Dat werkt zonder internet.

**Licenties**

- De database valt onder de [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). Wie de gegevens verder verspreidt, moet Open Food Facts noemen en een afgeleide database onder dezelfde licentie delen.
- Productfoto's vallen onder [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.nl). Naamsvermelding is verplicht.
- Karrie toont **Gegevens: Open Food Facts (ODbL), foto's CC BY-SA** bij elk gescand product en in het productvenster.
- **Commercieel gebruik** is toegestaan, maar de share-alike-regels blijven gelden. Wie later bijvoorbeeld een eigen productdatabase opbouwt uit deze gegevens, moet die onder ODbL delen. Laat dat juridisch nakijken voordat Karrie betaald wordt.
- Merknamen en verpakkingen op foto's blijven van de fabrikant.

**Privacy**

- De barcode wordt op het toestel zelf herkend (`@zxing/browser`). Camerabeelden worden niet opgeslagen en nergens heen gestuurd. Er wordt geen video bewaard.
- Alleen het barcodenummer gaat naar Open Food Facts, zonder cookies (`credentials: "omit"`) en zonder referrer.
- De camera stopt zodra er een geldige barcode is gelezen, als de scanner sluit en als de app naar de achtergrond gaat.
- Er gaat niets naar Render. Render levert alleen de statische bestanden.

**Camera-toegang per platform**

- **iPhone Safari**: bij de eerste scan vraagt Safari om toestemming. Geweigerd? Tik op **aA** in de adresbalk → **Website-instellingen** → **Camera** → **Sta toe**. Of Instellingen → Apps → Safari → Camera.
- **iPhone, geïnstalleerde app**: werkt sinds iOS 16.4 in de beginschermapp. De toestemming geldt voor de app los van Safari en kan na een update opnieuw gevraagd worden.
- **Android Chrome**: tik op het slotje of het instellingen-icoon naast het adres → **Rechten** → **Camera**. Voor de geïnstalleerde app: lang drukken op het icoon → **App-info** → **Rechten**.
- Geen camera of geen toegang? **Typ de cijfers** onder de barcode werkt altijd.

**Bekende beperkingen**

- Niet elk product staat in Open Food Facts, en sommige hebben geen Nederlandse naam of geen foto. Karrie verzint dan niets: de ouder vult de naam in.
- De koppeling tussen een algemeen product (Pindakaas) en een gescande verpakking gebruikt alleen exacte Open Food Facts-categorieën. Als die ontbreken, krijgt het kind geen bonus maar kan het altijd **Gevonden!** tikken.
- Losse groente en fruit en schapkaartjes worden niet gecontroleerd.
- Bij weinig licht, glimmende verpakkingen of gebogen barcodes kan het lezen langer duren. Dichterbij of verder weg houden helpt meestal.
- Scannen is in deze browserversie niet op echte iPhones en Android-telefoons getest. Gebruik de checklist hierboven.
