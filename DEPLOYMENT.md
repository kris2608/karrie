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

Voor foto herkennen is er ook een kleine server in `server/` (zie [Foto herkennen](#foto-herkennen-openai)):

```bash
npm ci --prefix server
npm run test:server
npm run build --prefix server
```

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
   - gratis web service `karrie-api` (map `server/`) voor foto herkennen
4. Render vraagt om `OPENAI_API_KEY` voor `karrie-api`. Plak daar de sleutel. Hij staat alleen op Render, niet in GitHub en niet in de app.
5. Bevestig het blueprint. De app staat op `https://karrieapp.onrender.com`, de server op `https://karrie-api.onrender.com`.
6. Elke push naar de gekoppelde branch publiceert opnieuw naar datzelfde adres.

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
- Bij het scannen gaat er niets naar Render. Alleen **Herken product** gebruikt de server, zie hieronder.

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

## Foto herkennen (OpenAI)

Een ouder kan een product fotograferen. Karrie stuurt de uitsnede naar OpenAI, krijgt naam, merk, afdeling en soort terug en laat de ouder alles bevestigen of aanpassen. Zonder bevestiging komt er niets op de lijst.

**Opbouw**

- `server/` is een kleine Node-server (`karrie-api`) met één route: `POST /api/products/recognize-photo`. `GET /api/health` geeft status en tellers, zonder geheimen.
- De server roept de OpenAI Responses API aan met model `gpt-5.4-mini`, een strikt JSON-schema (`server/src/schema.ts`) en `store: false`. Geen web search, geen beeldgeneratie.
- De OpenAI-sleutel staat alleen in de omgeving van de server. De app kent hem niet; `VITE_API_ORIGIN` is alleen het openbare adres van de server.
- Lokaal: zet de sleutel in `server/.env` (kopie van `server/.env.example`, staat in `.gitignore`). Start `npm run build --prefix server` en `npm start --prefix server` (poort 8787). `npm run dev` en `npm run preview` sturen `/api` daarheen door.

**Instellingen op Render (`karrie-api`)**

| Variabele | Standaard | Betekenis |
|---|---|---|
| `OPENAI_API_KEY` | (geheim) | Alleen in het Render-dashboard invullen |
| `OPENAI_VISION_MODEL` | `gpt-5.4-mini` | Model voor herkennen |
| `OPENAI_IMAGE_DETAIL` | `auto` | `low`, `high` of `auto` |
| `OPENAI_REASONING_EFFORT` | `low` | `none`, `low`, `medium`, `high` |
| `ALLOWED_ORIGINS` | `https://karrieapp.onrender.com` | Komma-lijst van toegestane app-adressen |
| `LIMIT_PER_IP_HOUR` / `LIMIT_PER_IP_DAY` | 20 / 60 | Per IP-adres |
| `LIMIT_DAILY_REQUESTS` | 300 | Alle gebruikers samen, per UTC-dag |
| `DAILY_BUDGET_USD` | 1 | Server stopt met herkennen boven dit bedrag per dag |

Krijgt de server van Render een ander adres dan `https://karrie-api.onrender.com`? Zet dat adres dan in `VITE_API_ORIGIN` van `karrieapp` en bouw de site opnieuw.

**Gratis plan: slaapstand**

De gratis web service slaapt na ongeveer 15 minuten zonder verkeer. De eerste herkenning daarna duurt tot ongeveer een minuut. Karrie wekt de server al zodra iemand op de cameraknop tikt, dus terwijl de foto gemaakt en bijgesneden wordt. Na 5 seconden wachten toont hij **Karrie wordt even wakker** en hij wacht tot 75 seconden. Wie dat niet wil, zet `karrie-api` op een betaald plan.

**Privacy**

- Foto's worden niet automatisch verstuurd. Alleen na **Herken product** gaat er één uitsnede naar de server.
- De app verkleint de uitsnede eerst tot hoogstens 1024 pixels en maakt er een nieuwe JPEG van. Daardoor verdwijnen EXIF-gegevens zoals GPS-locatie en toestelnaam.
- Het bijsnijdkader vraagt vooraf om alleen het product in beeld te brengen, zonder mensen. Ziet het model toch een gezicht of lichaam, dan toont Karrie geen resultaat en vraagt hij om bij te snijden. Die ene uitsnede is dan wel al bij OpenAI geweest: herkennen op het toestel zelf bestaat niet in gewone mobiele browsers. Een hand die het product vasthoudt is goed.
- De server bewaart geen foto's en logt geen beelden, Base64 of IP-adressen. Het log bevat alleen tijd, grootte, status, model en tokengebruik.
- OpenAI verwerkt de foto. Met `store: false` bewaart OpenAI de aanvraag niet voor later ophalen; OpenAI kan aanvragen wel tijdelijk bewaren voor misbruikcontrole volgens de [API-gegevensregels](https://platform.openai.com/docs/guides/your-data). De app zegt bij de knop dat de foto naar OpenAI gaat.
- De bevestigde foto (512 pixels) blijft alleen op het toestel, in IndexedDB. Foto's die nergens meer gebruikt worden, worden bij het opstarten opgeruimd. Ze worden niet gedeeld met Open Food Facts of een andere catalogus.
- **Gebruik foto** in het productvenster zet een foto bij een product zonder hem te versturen.

**Wat Karrie wel en niet doet**

- Een barcode die op de foto leesbaar is, wordt nooit zomaar overgenomen. Karrie biedt aan om hem bij Open Food Facts op te zoeken; pas dan telt hij als gecontroleerd.
- Een product dat alleen via een foto is herkend, geeft in de winkel geen barcodebonus. De scanknop verschijnt alleen als er een gecontroleerde barcode is of het product bij een catalogusproduct hoort.
- Herkent Karrie een product dat al op de lijst staat (zelfde catalogussoort), dan vraagt hij **Wil je deze foto gebruiken voor …?** Bij weinig zekerheid vraagt hij dat niet.
- Merk of inhoud die het model alleen gokt, worden niet overgenomen. In het resultaat staat **gelezen op de verpakking** of **geschat**.

**Limieten en misbruik**

- De server accepteert alleen JPEG, PNG of WebP als data-URL, controleert de bestandskop en weigert aanvragen boven 2 MB (`413`).
- Alleen aanvragen vanaf `ALLOWED_ORIGINS` worden geaccepteerd. Per IP-adres loopt er hoogstens één herkenning tegelijk.
- De app staat per toestel 25 herkenningen per dag toe.
- De tellers op de server staan in het geheugen. Ze beginnen opnieuw na een herstart of slaapstand, en per-IP-limieten zijn te omzeilen door een ander IP-adres. **Stel daarom ook een maandlimiet in bij OpenAI** (platform.openai.com → Settings → Limits). Dat is de harde grens.

**Kosten (gemeten met `gpt-5.4-mini`, november 2026)**

Prijs: $0,75 per miljoen invoertokens, $4,50 per miljoen uitvoertokens.

| Foto | Invoer | Uitvoer | Kosten |
|---|---|---|---|
| Eén pot pindakaas, scherp | ~1.650 | 110–160 | ~$0,002 |
| Wazige foto | ~1.650 | ~300 | ~$0,0026 |
| Twee producten naast elkaar | ~1.960 | ~360 | ~$0,003 |

Reken op ongeveer $0,002 tot $0,003 per foto: 100 foto's per maand kosten zo'n $0,25. Het dagbudget van $1 is genoeg voor ruim 300 foto's; de daglimiet van 300 aanvragen grijpt eerder in. Een herkenning duurt 2 tot 4 seconden als de server wakker is.

**Checklist foto herkennen (op een echte telefoon)**

- **Toevoegen**: tik op de camera naast de barcodeknop. De telefoon biedt camera of fotobibliotheek aan. Maak een foto van één product.
- Schuif en zoom in het kader, kies **Vierkant** of **Staand** en tik op **Herken product**. Na 2 tot 4 seconden zie je **Herkend!** met naam, merk en afdeling.
- Pas de naam aan en tik op **Toevoegen aan lijst**. Het product staat met jouw foto op de lijst.
- Zet eerst **Pindakaas** uit de catalogus op de lijst en fotografeer een pot pindakaas. Karrie vraagt **Wil je deze foto gebruiken voor Pindakaas?** en maakt geen dubbele regel.
- Fotografeer twee producten tegelijk of maak een wazige foto. Karrie zegt **Klopt dit?** of **Niet zeker** en laat je alles zelf invullen.
- Fotografeer een product met iemands gezicht erbij. Karrie toont geen resultaat maar **Alleen het product graag**, met **Bijsnijden**.
- Zet vliegtuigmodus aan en tik op **Herken product**. Je krijgt **Geen internet** en kunt het product zelf invullen.
- **Controleren**: tik op een product → **Maak foto** → **Gebruik foto**. De foto staat erbij zonder dat er iets verstuurd is. **Naam, afdeling of tekening aanpassen** werkt ook voor fotoproducten.
- Start het avontuur, zet vliegtuigmodus aan en ververs `/winkel`. De eigen foto's staan er nog.
- Open de app na een kwartier niets doen. De eerste herkenning toont **Karrie wordt even wakker** en lukt daarna alsnog.
- Getest op iPhone en Android? Noteer toestel, versie en of de camera direct of via de bibliotheek opende.

**Bekende beperkingen**

- Foto herkennen is niet getest op een echte iPhone of Android-telefoon, alleen in een desktopbrowser met echte productfoto's en echte OpenAI-aanroepen.
- Het model leest kleine tekst soms net verkeerd (bijvoorbeeld "Choco Paste" voor "Choco Pasta"). Daarom bevestigt de ouder altijd.
- Bij meerdere producten op één foto kiest Karrie het meest zichtbare product.
- Hoe `X-Forwarded-For` er op Render precies uitziet, is niet gecontroleerd; de per-IP-limieten zijn daarom een extra rem, niet de hoofdbeveiliging.
