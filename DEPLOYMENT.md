# Karrie op Render zetten

Karrie is een statische Progressive Web App. Na de eerste online opening blijven boodschappenlijstjes in de browser staan en werkt de winkelmodus zonder internet.

Render geeft het vaste HTTPS-adres. Dat adres is ook het veilige origin dat de camera nodig heeft: browsers geven alleen camera-toegang via HTTPS. `localhost` is tijdens ontwikkeling eveneens een secure context. Een los `file://`-bestand of een lokaal IP-adres zonder certificaat is dat niet. De camera wordt pas gevraagd als iemand op de cameraknop tikt.

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
5. Bevestig het blueprint. De app staat op `https://karrie.eu` (en nog steeds op `https://karrieapp.onrender.com`), de server op `https://karrie-api.onrender.com`.
6. Elke push naar de gekoppelde branch publiceert beide services opnieuw. Deploy na een wijziging aan `server/src/schema.ts` altijd ook de server: de app verwacht de velden van het nieuwe schema.

Bestaande bestanden (JavaScript, iconen, service worker) worden rechtstreeks geserveerd. Alleen paden zonder bestand vallen terug op `index.html`.

## Eigen domein: karrie.eu

- **DNS** bij de registrar: `A`-record `karrie.eu` → `216.24.57.1` en `CNAME` `www.karrie.eu` → `karrieapp.onrender.com`.
- **Render**: `karrieapp` → Settings → Custom Domains bevat `karrie.eu` en `www.karrie.eu`. Beide moeten **Verified** zijn met een uitgegeven certificaat; tot dan geeft HTTPS op dat adres een fout. Render stuurt `karrie.eu` nu door naar `www.karrie.eu` (301), dus de app en zijn gegevens wonen op `www`. Andersom kan in hetzelfde scherm; de server staat beide toe.
- **Server**: `ALLOWED_ORIGINS` van `karrie-api` bevat `https://karrie.eu,https://www.karrie.eu,https://karrieapp.onrender.com`. Zonder het nieuwe adres weigert de server foto, streepjescode, aanbiedingen en zelf toegevoegde producten (403). Staat de variabele in het dashboard op een andere waarde, pas hem daar aan.
- **Oude adres**: `karrieapp.onrender.com` blijft werken. Lijstjes, stickers en eigen producten staan per adres op het toestel; wie Karrie vanaf het oude adres op het beginscherm zette, ziet op `karrie.eu` een lege app. Zet Karrie vanaf `karrie.eu` opnieuw op het beginscherm.
- **Umami** telt bezoeken op alle drie adressen (`data-domains` in `vite.config.ts`).

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

Het tabblad-icoon (`favicon.svg`) en de app-iconen zijn dezelfde Karrie als op het beginscherm en in de WhatsApp-voorvertoning. Pas je de tekening in `src/components/mascot/Karrie.tsx` aan, maak de iconen dan opnieuw met `npm run icons` (dat gebruikt Chrome of Edge; zet anders `CHROME_PATH`). Een icoon dat al op het beginscherm staat, verandert pas als je Karrie daar verwijdert en opnieuw toevoegt.

## Checklist op iPhone en Android

- Het startscherm toont Karrie en **Speur, vind en vink af!**
- Tik bij **Toevoegen** op een product: een groen vinkje stijgt in ongeveer een seconde uit de tegel op. **Lijstje** onderaan opent het lijstje.
- Scroll bij **Toevoegen** naar beneden: na **Groente en fruit** volgen vanzelf **Bakkerij**, **Houdbaar** en de rest, en de tab bovenin loopt mee. Tikken op een tab scrolt naar die afdeling; tijdens het zoeken zie je alleen de zoekresultaten.
- Start een avontuur. De knop met de drie streepjes linksboven opent het overzicht voor ouders, met onderaan **Naar het beginscherm**. Het beginscherm toont dan **Verder speuren**.
- Karrie kijkt door een grote verrekijker zolang hij zoekt.
- **Gevonden!** laat het product naar het mandje vliegen en een ster naar de teller. Dubbel tikken telt maar één keer.
- **Terug** zet de laatste tik terug. **Later** bewaart het product voor straks. Het product naar links vegen doet hetzelfde als **Later**.
- Op Android trilt de telefoon kort bij **Gevonden!** en bij lang drukken. Safari op iPhone ondersteunt trillen niet.
- Vernieuw de pagina op `/winkel`. Hetzelfde lijstje staat er nog.
- Draai de telefoon in de winkel op zijn kant: het product staat links, naam en **Gevonden!** rechts, en **Terug**, **Later**, de voortgang en de sterren blijven in beeld (ook met een bonusmissie). Terugdraaien geeft meteen de gewone indeling; sterren en het huidige product blijven hetzelfde. De geïnstalleerde app vraagt Android om staand te blijven; in een gewoon browsertabblad draait het scherm gewoon mee.
- Maak een nieuw lijstje en tik op **Bewaren**. Geef het eventueel een naam. Het beginscherm meldt **Lijstje bewaard** en toont **Verder met lijstje** en een kaart met de naam (zonder naam: **Bewaard**). Open je de kaart, dan staat de naam bovenaan het lijstje. (Een veld voor de supermarkt is er al, maar verborgen tot een functie het gebruikt.)
- Deel `https://karrie.eu` in WhatsApp. De voorvertoning toont Karrie met **Speur, vind en vink af!** en een korte omschrijving. WhatsApp bewaart voorvertoningen een tijd; een link die je al eerder deelde, kan nog de oude (lege) versie tonen.
- Plak een korte lijst, controleer hem en start het avontuur.
- **Lang drukken** (ruim een halve seconde) op een product bij **Toevoegen** of **Controleren** haalt het van de lijst. **Ongedaan maken** staat daarna even in beeld. Een korte tik voegt nog steeds toe, en scrollen met de vinger erop verwijdert niets.
- Geluid staat standaard uit. Zet het aan via het tandwiel op het beginscherm en hoor een plopje bij **Gevonden!**.
- Tandwiel → **❤️ Over Karrie** toont de tekening van Thomas en het verhaal; **Terug** brengt je terug naar de instellingen. **Privacy en gegevens** scrollt tot **Lees de volledige privacyverklaring**, die in een nieuw venster opent.
- Met verdiende stickers staat onder **Nieuw avontuur** één rustige rij **Mijn stickers** (aantal, de nieuwste vijf en eventueel **+1**), ook op een smalle telefoon. Tikken opent het stickerboek met alle verdiende stickers en hun naam; **Klaar** sluit het.
- `https://karrie.eu/privacy.html` toont de privacyverklaring, ook als de app al op het beginscherm staat (niet het beginscherm van Karrie).
- Zet het toestel daarna in vliegtuigmodus en open het beginscherm-icoon opnieuw. De winkelmodus werkt nog.
- De eerste keer openen heeft internet nodig, zodat de app en de service worker binnenkomen.
- Zie je na een nieuwe deploy nog de oude versie? Sluit de app helemaal (niet alleen naar de achtergrond) en open hem opnieuw. De service worker (`autoUpdate`) haalt de nieuwe build op de achtergrond; die wordt actief bij de volgende koude start. Onder **Voor ouders** staat de build (`Versie x.y.z · commit`); zo zie je of je de nieuwe versie hebt. In een gewone browser tab: vernieuwen (of tab sluiten en `karrie.eu` opnieuw openen) volstaat meestal.

## Foto herkennen (OpenAI)

Een ouder fotografeert een product. Karrie stuurt die foto naar OpenAI, krijgt naam, merk, afdeling en soort terug en laat de ouder alles bevestigen of aanpassen. Zonder bevestiging komt er niets op de lijst.

De camera leest ook streepjescodes (zie **Streepjescode in de camera**). Een herkende streepjescode gaat voor; de foto blijft altijd mogelijk.

**De camera**

- De cameraknop naast het zoekveld opent meteen de achtercamera in de app zelf, in hetzelfde scherm als de oude barcodescanner. Op Android opent hij dus niet meer eerst de galerij.
- Eén tik op de ontspanknop maakt de foto en stuurt hem direct. Er is geen bijsnijd- of bewerkstap: Karrie neemt precies het kader dat je ziet (staand, 3:4).
- **Kies uit galerij** onder de knop blijft beschikbaar, bijvoorbeeld als de camera geweigerd is of het toestel geen camera heeft.
- Geweigerd? Het scherm legt uit hoe je toegang geeft:
  - **iPhone Safari**: **aA** in de adresbalk → **Website-instellingen** → **Camera** → **Sta toe**. Of Instellingen → Apps → Safari → Camera.
  - **iPhone, geïnstalleerde app**: werkt sinds iOS 16.4. De toestemming geldt voor de app los van Safari en kan na een update opnieuw gevraagd worden.
  - **Android Chrome**: slotje naast het adres → **Rechten** → **Camera**. Voor de geïnstalleerde app: lang drukken op het icoon → **App-info** → **Rechten**.
- De camera stopt zodra de foto gemaakt is, als het scherm sluit en als de app naar de achtergrond gaat.

**Welk plaatje op de lijst komt**

- Een specifiek merkproduct (bijvoorbeeld AH Terra of een pot Calvé) krijgt de foto die de ouder maakte. Die vervangt de tekening op de lijst, bij **Toevoegen** en in de winkel.
- Een algemeen product (een brood, een tros bananen, een pak melk zonder duidelijk merk) houdt de Karrie-tekening. OpenAI helpt dan alleen de lijst te vullen. Het resultaat zegt **Karrie gebruikt de tekening van …**.
- Staat hetzelfde algemene product al op de lijst? Dan biedt Karrie **Nog één erbij** aan in plaats van een dubbele regel.

**Verder scannen**

Het productvenster heeft **Toevoegen en verder scannen** (de camera komt meteen terug, met even een groene melding) en **Toevoegen en klaar** (de camera sluit). Ook **Nog één erbij**, **Ja, werk … bij**, **Als apart product** en een afbeelding vervangen gaan daarna terug naar de camera; sluiten kan met het kruisje. De streepjescode van het product dat je net bevestigde, wordt even genegeerd (minstens 3 seconden, en zolang de pot in beeld blijft). **Annuleren** en **Klaar** sluiten de camera zonder iets te bewaren, zoals voorheen.
- In het productvenster bij **Controleren** zet **Gebruik Karrie-tekening** de tekening terug.

**Opbouw**

- `server/` is een kleine Node-server (`karrie-api`) met de routes `POST /api/products/recognize-photo`, `POST /api/products/barcode` en `POST /api/images/discover`. `GET /api/health` geeft status en tellers, zonder geheimen.
- Herkennen roept de OpenAI Responses API aan met model `gpt-5.4-mini`, een strikt JSON-schema (`server/src/schema.ts`) en `store: false`. Geen web search, geen beeldgeneratie.
- De OpenAI-sleutel staat alleen in de omgeving van de server. De app kent hem niet; `VITE_API_ORIGIN` is alleen het openbare adres van de server.
- Lokaal: zet de sleutel in `server/.env` (kopie van `server/.env.example`, staat in `.gitignore`). Start `npm run build --prefix server` en `npm start --prefix server` (poort 8787). `npm run dev` en `npm run preview` sturen `/api` daarheen door.

**Instellingen op Render (`karrie-api`)**

| Variabele | Standaard | Betekenis |
|---|---|---|
| `OPENAI_API_KEY` | (geheim) | Alleen in het Render-dashboard invullen |
| `OPENAI_VISION_MODEL` | `gpt-5.4-mini` | Model voor herkennen |
| `OPENAI_IMAGE_DETAIL` | `auto` | `low`, `high` of `auto` |
| `OPENAI_REASONING_EFFORT` | `low` | `none`, `low`, `medium`, `high` |
| `ALLOWED_ORIGINS` | `https://karrie.eu,https://www.karrie.eu,https://karrieapp.onrender.com` | Komma-lijst van toegestane app-adressen |
| `LIMIT_PER_IP_HOUR` / `LIMIT_PER_IP_DAY` | 20 / 60 | Per IP-adres |
| `LIMIT_DAILY_REQUESTS` | 300 | Alle gebruikers samen, per UTC-dag |
| `DAILY_BUDGET_USD` | 1 | Server stopt met herkennen boven dit bedrag per dag |

Krijgt de server van Render een ander adres dan `https://karrie-api.onrender.com`? Zet dat adres dan in `VITE_API_ORIGIN` van `karrieapp` en bouw de site opnieuw.

De officiële Nutri-Score-logo's (A–E) staan standaard aan in de ouder-schermen. Zet `VITE_NUTRISCORE_LOGOS=off` bij **karrieapp** alleen als het merklogo tijdelijk uit moet (daarna opnieuw bouwen).

**Gratis plan: slaapstand**

De gratis web service slaapt na ongeveer 15 minuten zonder verkeer. De eerste herkenning daarna duurt tot ongeveer een minuut. Karrie wekt de server al zodra de camera opengaat. Duurt het lang, dan staat in het camerascherm **Karrie wordt even wakker**; hij wacht tot 75 seconden. Wie dat niet wil, zet `karrie-api` op een betaald plan.

**Privacy**

- Er gaat pas iets weg als de ouder op de ontspanknop tikt (of een foto uit de galerij kiest). Dan gaat er één foto naar de server.
- De app verkleint de foto eerst tot hoogstens 1024 pixels en maakt er een nieuwe JPEG van. Daardoor verdwijnen EXIF-gegevens zoals GPS-locatie en toestelnaam.
- Het camerascherm vraagt om alleen het product in beeld te brengen, zonder mensen. Ziet het model toch een gezicht of lichaam, dan toont Karrie geen resultaat en vraagt hij om een nieuwe foto. Die ene foto is dan wel al bij OpenAI geweest: herkennen op het toestel zelf bestaat niet in gewone mobiele browsers. Een hand die het product vasthoudt is goed.
- De server bewaart geen foto's en logt geen beelden, Base64 of IP-adressen. Het log bevat alleen tijd, grootte, status, model en tokengebruik.
- OpenAI verwerkt de foto. Met `store: false` bewaart OpenAI de aanvraag niet voor later ophalen; OpenAI kan aanvragen wel tijdelijk bewaren voor misbruikcontrole volgens de [API-gegevensregels](https://platform.openai.com/docs/guides/your-data). Het camerascherm zegt dat de foto naar OpenAI gaat.
- De bevestigde foto (512 pixels) blijft alleen op het toestel, in IndexedDB, en alleen als hij de tekening vervangt. Foto's die nergens meer gebruikt worden, worden bij het opstarten opgeruimd.
- **Maak foto** in het productvenster zet een foto bij een product zonder hem te versturen.
- Anonieme statistieken via Umami Cloud: zonder cookies, zonder namen, producten, streepjescodes, lijstjes, foto's of locatie. Zie **Statistieken (Umami)**.

**Wat Karrie wel en niet doet**

- Alleen de streepjescodelezer van de telefoon levert een EAN op. Cijfers die het model op de foto leest, worden nooit als echte EAN opgeslagen; ze blijven hoogstens een onbevestigde aanwijzing en tellen nergens voor.
- Een product hoort alleen bij een catalogussoort als het precies die soort is. Chocopasta wordt geen jam, havermelk geen melk.
- Merk of inhoud die het model alleen gokt, worden niet overgenomen. In het resultaat staat **gelezen op de verpakking** of **geschat**.

## Streepjescode in de camera

Het camerascherm zegt **Scan streepjescode of maak foto**. Er is geen apart scanscherm: dezelfde camera leest streepjescodes terwijl de ontspanknop gewoon werkt.

**Zo werkt het**

- De telefoon leest de streepjescode zelf (EAN-13, EAN-8, UPC-A en UPC-E). Chrome op Android heeft daar een ingebouwde lezer voor (`BarcodeDetector`); Safari op de iPhone niet, dan laadt Karrie de lezer ZXing (ongeveer 160 kB, alleen als de camera opengaat).
- Karrie kijkt hoogstens drie keer per seconde naar een band in het midden van het beeld, en alleen als de app op de voorgrond staat. Een code telt pas als hij twee keer achter elkaar gelezen is en de controlecijfers kloppen. Beelden verlaten de telefoon daarbij nooit; alleen het nummer gaat naar de server.
- Opzoeken gaat in deze volgorde: **Mijn producten** op dit toestel, dan het geheugen van dit toestel (gevonden: 30 dagen, onbekend: 1 dag), dan de server. De server kijkt in zijn eigen geheugen, dan bij **Open Food Facts**, en daarna met één OpenAI-webzoekopdracht.
- Gevonden? Dan stopt het lezen en opent meteen het bevestigingsscherm met naam, merk, inhoud en foto, en per veld waar het vandaan komt (**Open Food Facts**, **gevonden op …**, **gelezen op de verpakking**, **geschat** of **door jou ingevuld**). Dezelfde code wordt per cameragebruik maar één keer opgezocht.
- Onbekend of opzoeken lukt niet? De camera blijft open met **Onbekende streepjescode. Maak een foto van de voorkant.** of **Opzoeken lukt nu niet. …**, en **Zelf invullen**. De foto die je dan maakt, gaat met de gelezen code als hint naar OpenAI. Het model mag die code niet zomaar overnemen.
- Een galerijfoto wordt eerst op het toestel op een streepjescode gecontroleerd. Staat er een bekende code op, dan gaat de foto niet naar OpenAI.
- Wat de ouder eerder bevestigde (in **Mijn producten**), wint altijd van Open Food Facts, webzoeken en de foto. Een gelezen streepjescode wordt bij het product bewaard, zodat Karrie het product de volgende keer meteen herkent.
- Tijdens het avontuur in de winkel wordt er geen streepjescode gevraagd; tijdens **Een foto voor deze missie** leest de camera geen codes.

**Open Food Facts**

- Open en gratis, zonder sleutel. Karrie vraagt het via de server op (`/api/v3/product/{ean}`, Nederlandse namen voorop) met een eigen User-Agent (`OFF_USER_AGENT`, standaard `Karrie/1.0 (https://karrie.eu)`), zoals Open Food Facts vraagt.
- Open Food Facts staat 100 productopvragingen per minuut per IP-adres toe. De server houdt minstens 0,7 seconde tussen twee opvragingen, probeert na een `429` of `5xx` hoogstens twee keer opnieuw (na 1 en 3 seconden, of na `Retry-After`) en vraagt dezelfde code nooit twee keer tegelijk op.
- Het geheugen van de server: gevonden 30 dagen, onbekend 7 dagen, fout 5 minuten. Het is leeg na een herstart of slaapstand.
- Een record telt alleen als het een echte naam heeft en bij dezelfde code hoort. Naam en merk: **exact**. Alleen een naam of alleen een foto: **gedeeltelijk**, dan vraagt Karrie de ouder om te controleren. Foto's worden alleen van `images.openfoodfacts.org` overgenomen; ingrediënten alleen in het Nederlands.
- Licenties: de gegevens vallen onder **ODbL**, de foto's onder **CC BY-SA**. Karrie toont beide apart (**Gegevens: Open Food Facts (ODbL), foto CC BY-SA**) en bewaart bij het product dat het van Open Food Facts komt.
- Heeft het product een foto van Open Food Facts, dan zoekt Karrie geen voorbeeldfoto meer. In het productvenster kan de ouder kiezen tussen **Open Food Facts-foto**, **Voorbeeldfoto** en **Tekening**. Zonder Open Food Facts-foto gaat het zoeken naar een voorbeeldfoto zoals voorheen.

**Webzoeken voor onbekende codes**

- Kent Open Food Facts de code niet, dan zoekt de server één keer met OpenAI-webzoeken (`max_tool_calls: 1`, `store: false`) naar de code. De server haalt daarna zelf de gevonden pagina op en neemt het antwoord alleen over als die pagina de code én het grootste deel van de productnaam echt vermeldt. Een foto van zo'n winkelpagina wordt niet overgenomen; dan zoekt Karrie later een voorbeeldfoto.
- Zo'n antwoord heet **gevonden op …** en vraagt altijd om controle.
- Kosten: zie **Kosten**. Een onbekende code wordt per 7 dagen hoogstens één keer gezocht. Het dagbudget (`BARCODE_DAILY_BUDGET_USD`, standaard $0,50) geldt alleen voor webzoeken; daarboven werkt Open Food Facts gewoon door. `BARCODE_WEB_SEARCH=off` zet webzoeken helemaal uit.

**Instellingen op Render (`karrie-api`)**

| Variabele | Standaard | Betekenis |
|---|---|---|
| `OFF_USER_AGENT` | `Karrie/1.0 (https://karrie.eu)` | Naam en contactadres voor Open Food Facts |
| `BARCODE_WEB_SEARCH` | `on` | `off` = nooit webzoeken voor onbekende codes |
| `BARCODE_DAILY_BUDGET_USD` | 0,5 | Webzoeken stopt boven dit bedrag per dag |
| `BARCODE_LIMIT_PER_IP_HOUR` / `BARCODE_LIMIT_PER_IP_DAY` | 60 / 200 | Opzoekingen per IP-adres die niet uit het geheugen komen |
| `BARCODE_LIMIT_DAILY_REQUESTS` | 1000 | Alle gebruikers samen, per UTC-dag |

`/api/health` toont onder `barcode` of webzoeken aan staat, de tellers van vandaag, de uitkomsten (`off-exact`, `off-partial`, `web-page`, `none`) en de fouten (`off:http-429`, `web:not-on-page`, …). Het nummer zelf wordt niet gelogd.

## Bonusmissies (slimme ontdekking)

Bij een herkend voedingsproduct kijkt OpenAI of er binnen dezelfde soort een eenvoudiger keuze bestaat, bijvoorbeeld 100% pindakaas zonder toegevoegd zout of suiker, volkorenbrood in plaats van wit brood, of yoghurt zonder toegevoegde suiker. In de winkel wordt dat een **bonusmissie** voor het kind.

**Wanneer een missie aan staat**

- **Op het etiket gezien**: de foto toont de ingrediënten, en die bevestigen het (bijvoorbeeld "suiker" of "zout" in pindakaas). Dan staat de missie standaard aan.
- **Waarschijnlijk**: Karrie leidt het alleen af (bijvoorbeeld een wit brood zonder etiket in beeld). Dan staat de missie standaard uit. De ouder kan hem aanzetten in het productvenster bij **Controleren** (blok **Bonusmissie**).
- Zegt het etiket iets anders dan het model, dan wint het etiket: criteria die de ingrediëntenlijst tegenspreekt vallen weg.
- Geen etiket leesbaar en niets af te leiden: geen missie (**insufficient-data**). Voor niet-voedsel (afwasmiddel, wc-papier) nooit.
- Een missie blijft binnen dezelfde soort of hetzelfde doel (brood → volkorenbrood, ontbijtgranen → muesli of havermout). Pindakaas wordt nooit hummus.
- Karrie noemt geen voedingswaarden of percentages, en gebruikt geen woorden als gezond, ongezond, goed of slecht.
- Hoogstens 3 missies per avontuur.

**In de winkel**

- Bij een product met missie verschijnt na een korte pauze **Ik heb een bonusmissie!** met het product van de lijst, een voorbeeldplaatje van de keuze, een kenmerk (bijvoorbeeld **100%** of **volkoren**) en **+2** sterren.
- **Op zoek!** start de missie. **Nu niet** slaat hem over; het kind kan het product dan gewoon vinden voor 1 ster.
- Bij **Gevonden!** tijdens een missie verschijnt **Voor de ouder** met drie keuzes:
  - **Gevonden, deze nemen we**: de lijstregel wordt het nieuwe product, het kind krijgt 1 + 2 sterren.
  - **Gevonden, we houden de oude**: de lijstregel blijft, het kind krijgt ook 1 + 2 sterren. Bij dit product stelt Karrie die missie daarna niet meer vanzelf voor.
  - **Nog niet**: terug naar zoeken.
- **Terug** zet de missie en de bonussterren terug.
- Missies werken ook zonder internet: alles staat al op het toestel als het avontuur begint.

**Uitzetten**

- Voor de hele app: tandwiel op het beginscherm, of het menu in de winkel → **Bonusmissies**. Uitzetten tijdens een avontuur haalt de open missies weg.
- Per product: het blok **Bonusmissie** in het productvenster.

## Voorbeeldfoto's (automatisch zoeken)

**Welke producten.** Alleen een **merkproduct** (van een foto herkend, met merk) krijgt automatisch een echte foto van de verpakking. Standaardproducten uit de catalogus (banaan, melk, brood) houden hun Karrie-tekening. Wil een ouder daar toch een foto, dan tikt hij in het productvenster op **Voorbeeldfoto**; pas dan zoekt Karrie. Dat gebeurt op de achtergrond; het toevoegen wacht er nooit op. Alleen de productnaam (en bij een herkende verpakking merk, variant en inhoud) gaat naar de server, nooit een foto.

**Brave Image Search voor merkproducten.** Is `BRAVE_SEARCH_API_KEY` gezet, dan zoekt de server de verpakking via [Brave Image Search](https://brave.com/search/api/) (land NL, 12 resultaten). De server haalt eerst de originele foto bij de winkel. Weigert de winkel de server van Render, dan neemt hij Brave's eigen verkleinde kopie. Daarna volgt dezelfde controle met OpenAI-vision. Faalt Brave (sleutel fout, limiet, storing), dan zoekt de server via OpenAI-webzoeken zoals voorheen, en staat `brave:unauthorized`, `brave:rate-limited` of `brave:unavailable` in `/api/health` → `images.failures`. Standaardproducten gaan nooit via Brave.
- *Wat je nodig hebt:* een account op brave.com/search/api, een abonnement met betaalgegevens, en de sleutel als `BRAVE_SEARCH_API_KEY` in `server/.env` en bij Render (Environment).
- *Kosten:* ongeveer $5 per 1.000 zoekopdrachten ($0,005 per nieuw merkproduct), met maandelijks ongeveer $5 gratis tegoed. Karrie rekent de kosten mee in het dagbudget (`PRICE_BRAVE_CALL`, standaard 0,005).
- *Opslaan:* Brave staat het bewaren van zoekresultaten alleen toe met een abonnement dat dat uitdrukkelijk toestaat. Karrie bewaart op de server geen Brave-foto's (ze hebben onbekende rechten en blijven op het toestel van het gezin); controleer de voorwaarden van je abonnement voordat je het aanzet.

**Productinformatie van de productpagina.** Bij een merkproduct leest de server de winkel- of merkpagina van de gekozen foto (en anders van de volgende passende foto, hoogstens twee pagina's): JSON-LD, de Nutri-Score in afbeeldingsnamen en alt-teksten, en de tekst rond *Voedingswaarden* en *Ingrediënten*. Een kleine OpenAI-aanroep (`store: false`) zet dat om naar Nutri-Score, voedingswaarden per 100 g of 100 ml (energie, vet, verzadigd vet, suikers, vezels, eiwit, zout), ingrediënten, allergenen, claims en keurmerken, en inhoud. Daarna controleert de server alles tegen de pagina zelf: een getal moet naast zijn eigen label staan ("Zout 0,1 g"), de Nutri-Score moet op de pagina staan, en claims, allergenen, ingrediënten en inhoud moeten er letterlijk staan. Een pagina van hetzelfde product in een andere verpakking (een multipack, of 90 g in plaats van 111 g) telt mee voor de waarden per 100 g, ingrediënten en claims, maar de inhoud wordt dan niet overgenomen. Wat niet klopt, valt weg; niets wordt verzonnen. De ouder ziet het als **Productinformatie** in het productvenster, met de bron. De gegevens staan op het toestel bij de voorbeeldfoto (ook offline), en de server onthoudt ze 30 dagen per product, zodat een volgend gezin ze gratis krijgt, ook als de foto zelf alleen persoonlijk is. Ze zijn bedoeld om later in een bonusmissie een gezonder alternatief voor te stellen (`factsFor` in `src/domain/productFacts.ts`); de missieregels gebruiken ze nog niet. Kosten: ongeveer $0,002 tot $0,004 per merkproduct.

**Waarom niet de beeldzoekfunctie van OpenAI.** Die is eerst los getest (`server/scripts/diagnose-image-search.mjs`) met de gedocumenteerde instellingen (`search_content_types: ["image","text"]`, `image_settings`, `include: ["web_search_call.results"]`, verplichte zoekaanroep) op vijf producten en twee modellen. Uitkomst: **0 van 10 aanvragen gaf een `image_result`**, zonder foutmelding, terwijl de server de instellingen wel terugmeldde. Elke aanvraag duurde 13 tot 20 seconden en kostte $0,03 tot $0,04. Daarom gebruikt Karrie de webzoekfunctie alleen om productpagina's te vinden. De server haalt de foto zelf van die pagina's: van Wikimedia Commons via de Commons-API (met licentie), van Unsplash en Pixabay, en anders de `og:image` van de pagina.

**Openverse voor algemene producten.** Bij een algemeen product (banaan, brood, eieren) vraagt de server daarnaast [Openverse](https://api.openverse.org/) om foto's met een open licentie (CC0, publiek domein, CC BY, CC BY-SA), alleen van de fotobanken StockSnap en Rawpixel. Openverse is gratis en werkt zonder sleutel. De Engelse zoekterm komt uit de zoekopdracht die het model al schreef ("site:unsplash.com banana isolated" wordt "banana"), dus dit kost geen extra modelaanroep. Alleen foto's waarvan de titel het product noemt, tellen mee, hoogstens drie. De server haalt de verkleinde kopie bij Openverse zelf op, niet bij de fotobank. Daarna volgt dezelfde controle met OpenAI-vision als bij elke andere foto. Uitzetten kan met `IMAGE_OPENVERSE=off`.

Zonder sleutel geeft Openverse ongeveer 20 zoekopdrachten per minuut en enkele honderden per dag per IP-adres; alle gezinnen delen het IP-adres van de server. Wie meer nodig heeft, kan gratis een sleutel aanvragen bij Openverse (nog niet ingebouwd). Openverse is soms traag (6 tot 14 seconden) en geeft af en toe een `504`. Dan gaat het zoeken zonder Openverse verder, en staat `openverse:unavailable` in `/api/health` → `images.failures`.

**Hoe een foto gekozen wordt.** Elke foto wordt gedownload en gecontroleerd: alleen HTTPS, geen interne adressen (ook niet via een doorverwijzing), echte JPEG, PNG of WebP en hoogstens 4 MB. Daarna vergelijkt OpenAI-vision de foto's met het product: soort, merk, variant, inhoud, vooraanzicht, scherpte, het hele product zoals in de winkel (geen plakje, geen close-up), en bij een algemeen product geen merk in beeld. Een ander merk, een andere variant of inhoud, of een persoon in beeld valt af. Een vergelijkbaar product wordt nooit gebruikt als het exacte product.

**Gebruiksrechten.**
- *Open licentie* (CC0, publiek domein, CC BY / BY-SA, Unsplash, Pixabay): de foto wordt automatisch gebruikt, met naam van de maker en licentie in het productvenster. De server onthoudt hem 30 dagen voor alle gebruikers.
- *Rechten onbekend* (winkels en merksites): past de foto precies, dan gebruikt Karrie hem automatisch, maar **alleen op dit toestel** als persoonlijk voorbeeld, met een link naar de bron. De server bewaart zo'n foto niet en geeft hem nooit aan een ander gezin. Dit is een bewuste keuze van de eigenaar van de app.
- Twijfelt de controle, dan staan de gevonden foto's in het productvenster en kiest de ouder er een, of niet.

**Wat het kind ziet.** De keuze van de ouder gaat voor. Anders bij een merkproduct: voorbeeldfoto, dan de eigen foto, dan de Karrie-tekening; bij een standaardproduct de eigen foto of de tekening. In het productvenster (alleen voor ouders) staat **Je kind ziet** met *Voorbeeldfoto*, *Eigen foto* en *Tekening*, de gevonden foto's om uit te kiezen, de bron, **Opnieuw zoeken** en **Geen voorbeeldfoto**. Het hele zoeken staat aan of uit bij **Voor ouders → Voorbeeldfoto's**.

**Bewaren en opnieuw proberen.** Antwoorden staan in IndexedDB op het toestel; de gekozen foto wordt er als bestand bij bewaard, zodat hij ook offline werkt. Een product met een antwoord wordt niet opnieuw gezocht. Niets gevonden: na 14 dagen opnieuw. Fout: na 2, 8, 32 minuten enzovoort (hoogstens een dag). Limiet bereikt: na 3 uur. Offline: zodra er weer verbinding is. Er lopen hoogstens twee zoekopdrachten tegelijk.

**Gemeten op 20 Nederlandse producten** (15 merkproducten, 5 algemene; `server/scripts/validate-image-search.mjs`, november 2026, provider OpenAI-webzoeken):

| Meting | Uitkomst |
|---|---|
| Met een passende foto (na controle) | 15 van 20 (75%) |
| Met een open licentie | 4 van 20 (20%) |
| Automatisch gebruikt | 13 van 20 (65%): 2 met open licentie, 11 als persoonlijk voorbeeld |
| Daarvan goed, met het oog nagekeken | 12 van 13; Almhof yoghurt was het juiste product maar een uitsnede van de verpakking |
| Aan de ouder voorgelegd | 2 (Calvé, eieren met merk in beeld) |
| Mediaan zoektijd | 6,9 s |
| Kosten | $0,017 per product, $0,026 per automatisch gebruikte foto |
| Opnieuw opgevraagd, uit het geheugen van de server | 9 van 9 deelbare antwoorden, zonder kosten; 0 persoonlijke foto's gedeeld |

Niets gevonden: Unox rookworst, Lay's paprika, Verkade chocolade, Heinz ketchup en appel. De uitkomst verschilt per keer: in een eerdere ronde vonden Lay's en Heinz wel iets en Almhof niet. Oorzaken bij het ophalen: pagina niet bereikbaar (43 keer), geen foto op de pagina (23 keer), geen afbeelding (4 keer). Merkfoto's komen bijna altijd van winkels (Jumbo, Hoogvliet, ingredientenlijst.nl, mijn-boodschappen.nl), dus met onbekende rechten.

**Gemeten op 10 algemene producten met Openverse** (banaan, appel, volkorenbrood, komkommer, eieren, tomaat, wortel, aardappelen, kaas, melk; `validate-image-search.mjs --generic --like-render`, dus met Unsplash en Pixabay geblokkeerd zoals op Render):

| Meting | Zonder Openverse | Met Openverse |
|---|---|---|
| Met een passende foto (na controle) | 3 van 10 | 9 van 10 |
| Automatisch gebruikt (open licentie, voor iedereen) | 2 van 10 | 7 van 10 |
| Aan de ouder voorgelegd | 1 | 2 (aardappelen, melk) |
| Niets gevonden | 7 | 1 (appel: "apple" geeft vooral iPhones) |
| Mediaan zoektijd | 3 s | 8 s |
| Kosten per product | $0,015 | $0,018 |

Met het oog nagekeken zijn vijf van de zeven goed: bananen, brood, tomaten, eieren, wortels. De komkommer is een vergiet met augurkjes. Kaas (van Wikimedia Commons, niet van Openverse) is een plak smeltkaas in plastic. Openverse kost zelf niets; het kleine verschil in kosten komt van de extra foto's die OpenAI-vision bekijkt.

Een eerdere ronde liet zien waarom de controle op "het hele product" nodig is: zonder die controle koos Karrie een plakje komkommer, een gepelde banaan en een eierdoos met merk.

**Productinformatie gemeten op de 15 merkproducten** (`validate-image-search.mjs --branded`, lokaal, via OpenAI-webzoeken omdat er nog geen Brave-sleutel is): bij 12 van de 15 gevonden. Nutri-Score bij 4 (Calvé B, AH Terra A, De Ruijter D, Verkade E), voedingswaarden bij 10, ingrediënten bij 10, claims bij 11. Bronnen: ingredientenlijst.nl, jumbo.com, hoogvliet.com, optimel.nl, heinz.com. Niets bij Unox (geen foto gevonden), Almhof en Dreft. De kosten per merkproduct stegen van $0,017 naar $0,021. Een fout op de bronpagina wordt overgenomen: optimel.nl vermeldt "Zout 8 g" per 100 ml (bedoeld is waarschijnlijk 0,08 g).

**Andere zoekdienst** (niet ingebouwd): **SerpApi** (Google Images), 250 zoekopdrachten per maand gratis, $25 per maand voor 1.000.

## Mijn producten

Een product dat van een foto is herkend en een merk heeft, of dat niet in de catalogus staat, onthoudt Karrie op dit toestel als **Mijn producten**: naam, merk, afdeling, foto en eventuele bonusmissie. In **Toevoegen** staat het met een hartje vooraan in zijn eigen afdeling en in de zoekresultaten. Tikken zet het op de lijst (of telt er één bij). Lang drukken haalt het van de lijst en vergeet het, met **Ongedaan maken**. Een herkende AH Terra pindakaas telt op zijn eigen tegel, niet ook op de tegel Pindakaas. Karrie onthoudt hoogstens 120 producten.

## Zelf een product toevoegen

Staat een gewoon product niet in de catalogus (walnoten, komijn, rozijnen), dan toont **Toevoegen** bij het zoeken een tegel **Voeg "walnoten" toe**. Tikken zet het meteen op de lijst met de melding **Walnoten toegevoegd!** (met **Ongedaan maken**). De ouder hoeft niets in te vullen; de rest gebeurt op de achtergrond.

**Eerst zoeken.** Voor er iets nieuws komt, kijkt Karrie: dezelfde naam in de catalogus, enkelvoud of meervoud ("preien" is Prei), een tikfout ("courget" toont Courgette vooraan, met de tegel om toe te voegen erachter), en een product dat dit toestel al eerder toevoegde ("walnoot" vindt Walnoten). Daarna vraagt de server of iemand anders het al toevoegde.

**Geen vervuiling.** Karrie weigert lege invoer, zinnen en lijstjes ("dingen voor ontbijt", "brood met kaas", meer dan drie woorden). Een verpakking of inhoud mag erachter ("Chocomel blik", "Chocomel 1 liter", "Chocomel 6 x 200 ml"); die telt niet als woord. Enkelvoud en meervoud worden één product (`custom:walnoot`). Een getypt product krijgt nooit een streepjescode, voedingswaarden of een inhoud van ergens anders; een merk alleen via de naamzoekfunctie hieronder.

**Merken** (Chocomel, Nutella, Optimel, Calvé). Ook die voeg je met één tik toe; ze komen in **Mijn producten** zoals elk ander product. Op de achtergrond zoekt Karrie eerst op naam (zie [Merken en foto's op naam](#merken-en-fotos-op-naam)). Is het een merk, dan krijgt het product het merk, geen OpenAI-ordening en geen tekening. Anders gaat het zoals hieronder. Zegt OpenAI zelf dat het een merk is, dan wordt het ook een merkproduct (zonder extra aanroep).

**Op dit toestel.** Het product staat als **Mijn product** (met hartje) in IndexedDB: `productId`, `canonicalName`, naam, afdeling, `kind: custom_generic`, `source: user_created`, `createdAt`, en zodra die er is een tekening (in de fotoopslag op het toestel). Het werkt in **Controleren** (naam, afdeling en tekening aanpassen; dat wint altijd van de achtergrond) en in de winkel zoals elk ander product.

**Op de achtergrond** (`POST /api/products/normalize`). De app stuurt alleen de getypte naam, nooit de rest van de lijst. De server vraagt OpenAI (Responses API, `store: false`, strikt JSON-schema) om `canonicalName`, `displayName`, `singularName`, `pluralName`, `childFriendlyLabel`, `category`, `subcategory`, `isGeneric`, `closestDrawing` (de tekening uit de catalogus die er het meest op lijkt) en `confidence`. Daarna controleert de server zelf: het moet één algemeen product zijn, zeker genoeg, en hetzelfde woord als getypt (enkelvoud, meervoud of een kleine spelfout). Anders blijft het product gewoon zoals de ouder het typte. Mislukt het, dan probeert de app het hoogstens 3 keer (bij het toevoegen en bij het starten van de app). De afdeling begint als **Houdbaar** met het doosje en verandert als het antwoord binnen is. Noten, specerijen en gedroogd fruit vallen onder Houdbaar met `subcategory` (bijvoorbeeld "noten").

**Kandidaten voor de gedeelde catalogus.** Elk goedgekeurd antwoord wordt een kandidaat op de server: `candidateId`, `canonicalName`, `displayName`, `searchKeys`, afdeling, tekening, `firstSeenAt`, `lastSeenAt`, `usageCount`, `createdFrom` (search, photo of import) en `approvalStatus`. Hetzelfde product in dezelfde afdeling is één kandidaat; `usageCount` telt hoogstens één keer per toestel per dag (een gehashte IP met een sleutel die bij elke herstart nieuw is; IP-adressen worden niet bewaard). Een tweede gezin dat walnoten typt, krijgt het antwoord van de kandidaat, zonder OpenAI. Een kandidaat staat altijd op `pending` en komt **nooit vanzelf** in de catalogus van de app: dat doet een mens.

- **Soorten.** Elke kandidaat heeft een `classification`: `generic` (walnoten), `branded` (Chocomel; met `brand`, `variant` voor een smaak of soort zoals "0% suiker", `requestedPackaging` zoals "blik" of "1 l", `prijsprofeetMatch`, `offMatch` en `imageAvailable`) of `unknown` (nog niet ingedeeld; gaat op in het product zodra dat bekend is). "Chocomel", "Chocomel blik" en "Chocomel 1 liter" zijn één kandidaat; "Chocomel 0% suiker" is een andere. Alleen algemene kandidaten beantwoorden de ordening of krijgen een tekening.
- **Bewaren.** Er zijn drie standen; `/api/health` toont onder `products.candidates.storage` welke er echt draait:
  - **Geheugen** (standaard, zo staat het nu op Render): weg na een herstart of slaapstand.
  - **Bestand** met `CANDIDATES_FILE=/var/data/candidates.json` (atomair geschreven). Op het gratis Render-plan is er geen blijvende schijf; daarvoor zijn een betaalde instance (Starter, $7 per maand) en een Persistent Disk ($0,25 per GB per maand) nodig.
  - **Postgres** met `CANDIDATES_DATABASE_URL` (heeft voorrang op het bestand). De server draait bij het starten de migraties in `server/migrations/` (`001_candidates.sql`, `002_catalog.sql`) via `schema_migrations`, leest alle kandidaten voor hij luistert en schrijft daarna alleen gewijzigde rijen. Is de database niet bereikbaar, dan draait hij in het geheugen en toont `/api/health` `storage: "memory"` met `loadError`. Een mislukte schrijfactie wordt bij de volgende wijziging opnieuw geprobeerd.
- **Postgres kiezen** (er is **niets aangemaakt**; dat is jouw keuze):
  - **Neon**, gratis plan: geen einddatum, ongeveer 0,5 GB opslag, genoeg voor vele duizenden kandidaten. Maak op neon.tech een project in regio Frankfurt, kopieer de connection string (met `?sslmode=require`) en zet die op `karrie-api` als `CANDIDATES_DATABASE_URL` (geheim; staat al in `render.yaml` met `sync: false`).
  - **Render Postgres**: het gratis plan verloopt na 30 dagen (daarna worden de gegevens verwijderd); betaalde plannen kosten per maand, kijk voor de actuele prijs op render.com/pricing. Gebruik dan de *Internal Database URL*.
  - Duurzaam bewaren werkt pas als `CANDIDATES_DATABASE_URL` gezet is én `/api/health` `"storage": "postgres"` toont.
- **Gedeelde productcatalogus.** Dezelfde Postgres bevat ook producten, verpakkingen, GTINs, feiten (Nutri-Score alleen van Open Food Facts), afbeeldingslinks en een lookup-cache. Bij het starten zaait de server de gebundelde catalogus (`origin=bundled`). Streepjescode-lookups lezen eerst deze database, daarna Open Food Facts; gevonden antwoorden worden gedeeld tussen gezinnen. Retailerfoto's van PrijsProfeet worden alleen als URL bewaard (`usage_status=link_only`), nooit gedownload. `/api/health` toont onder `catalog` `{ enabled, degraded, migrations, products, identifiers, centralHits, writes, writeErrors }`.
- **Beoordelen.** Zet `CANDIDATES_ADMIN_TOKEN` (geheim, lang en willekeurig) op `karrie-api`. Dan werken:
  - `GET /api/admin/candidates?status=pending` — kandidaten; `priority: true` als `usageCount >= CATALOG_PRIORITY_COUNT` (standaard 5; dat zijn aanvraag-tellingen, geen geverifieerde gebruikers).
  - `POST /api/admin/candidates/<candidateId>` met `{"approvalStatus":"approved"}` of `"rejected"` — goedkeuren koppelt automatisch een `catalog_products`-rij (`approved`, nog niet default).
  - `POST /api/admin/catalog/<productId>` met bijvoorbeeld `{"isDefaultCatalog":true}`, `{"illustrationKey":"melk"}`, `{"deprecated":true}` — alleen met hetzelfde Bearer-token.
  - Zonder token of met een fout token antwoorden ze `404`. Er is geen publieke schrijfroute.
- **Sync naar toestellen.** `GET /api/catalog/changes?since=<iso>` is openbaar en alleen-lezen (pagina van 200, `Cache-Control: max-age=300`). Alleen default of deprecated shared metadata; geen feiten of lijstjes. De app bewaart de sync in IndexedDB (`catalogSync`) en mengt hem in de gebundelde catalogus; lokale overrides winnen altijd.
- **Exporteren.** `npm run candidates:export -- --status=pending --format=csv` in `server/` leest `CANDIDATES_FILE`, of met `KARRIE_API_URL` en `CANDIDATES_ADMIN_TOKEN` de draaiende server.
- `/api/health` toont onder `products` de aantallen kandidaten per status en soort, waar ze bewaard worden (`storage`) en de uitkomsten (`normalized`, `known`, `brand`, `refused-input`, fouten).

**Voorbeelden (admin).**

```bash
curl -s -H "Authorization: Bearer $CANDIDATES_ADMIN_TOKEN" \
  "https://karrie-api.onrender.com/api/admin/candidates?status=pending"

curl -s -X POST -H "Authorization: Bearer $CANDIDATES_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvalStatus":"approved"}' \
  "https://karrie-api.onrender.com/api/admin/candidates/<candidateId>"

curl -s -X POST -H "Authorization: Bearer $CANDIDATES_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isDefaultCatalog":true,"illustrationKey":"drinkpakje"}' \
  "https://karrie-api.onrender.com/api/admin/catalog/<productId>"
```

**Tekening (uit, kost geld per tekening).** Een nieuw product krijgt de catalogustekening die er het meest op lijkt (anders het doosje van de afdeling). Met `ILLUSTRATIONS_ENABLED=true` maakt de server ook een eigen tekening in Karrie-stijl (`POST /api/products/illustration`): `gpt-image-1`, 1024×1024, kwaliteit `low`, transparante achtergrond, WebP, met een vaste stijlopdracht (platte tekening, dikke ronde lijnen, geen tekst, merk, mensen of foto-realisme). Alleen voor een bekende kandidaat, nooit met vrije tekst; één tekening per kandidaat, daarna uit het geheugen van de server voor iedereen gratis. De app verkleint hem tot 256×256 en bewaart hem op het toestel. Tot hij er is, staat de catalogustekening er; een foto van de ouder wint altijd. Zonder de vlag antwoordt de route `404` en vraagt de app niets.

- **Kosten.** Volgens de prijslijst van OpenAI kost `gpt-image-1` op `low` bij 1024×1024 ongeveer **$0,011 per tekening** (`medium` $0,042, `high` $0,167; niet gebruikt). Er is geen gratis tegoed. 100 nieuwe producten kosten dus ongeveer $1,10. Tekeningen hebben een eigen dagbudget: `ILLUSTRATION_DAILY_BUDGET_USD` (standaard $1, ongeveer 90 tekeningen per dag), per IP 5 per uur en 10 per dag (`ILLUSTRATION_LIMIT_PER_IP_HOUR`, `ILLUSTRATION_LIMIT_PER_IP_DAY`), 100 per dag in totaal (`ILLUSTRATION_LIMIT_DAILY_REQUESTS`) en in de app 8 per toestel per dag. `PRICE_ILLUSTRATION` (standaard 0,011) is wat de server per tekening telt; `ILLUSTRATION_MODEL` kiest een ander model (bijvoorbeeld `gpt-image-1-mini`, goedkoper; zet dan ook `PRICE_ILLUSTRATION`). Voor `gpt-image-1` moet de OpenAI-organisatie geverifieerd zijn (platform.openai.com → Settings → Organization → Verify).
- **Aanzetten.** Zet op `karrie-api` `ILLUSTRATIONS_ENABLED=true` en controleer een maandlimiet bij OpenAI. Het geheugen met tekeningen is weg na een herstart; de tekeningen op de toestellen blijven.

**Instellingen.**

| Variabele | Standaard | Wat |
| --- | --- | --- |
| `OPENAI_PRODUCT_MODEL` | het herkenningsmodel | Model voor het ordenen van een getypt product |
| `PRODUCTS_LIMIT_PER_IP_HOUR`, `PRODUCTS_LIMIT_PER_IP_DAY` | 30, 100 | Nieuwe producten per IP (bekende kandidaten tellen niet) |
| `PRODUCTS_LIMIT_DAILY_REQUESTS`, `PRODUCTS_DAILY_BUDGET_USD` | 1000, 0,5 | Hele server per dag |
| `CANDIDATES_DATABASE_URL` | leeg | Postgres voor kandidaten én gedeelde catalogus (geheim); wint van `CANDIDATES_FILE` |
| `CANDIDATES_FILE` | leeg (geheugen) | JSON-bestand voor kandidaten |
| `CANDIDATES_MAX` | 5000 | Daarboven komen er geen nieuwe kandidaten bij |
| `CANDIDATES_ADMIN_TOKEN` | leeg (routes bestaan niet) | Token voor beoordelen, catalogus en exporteren |
| `CATALOG_REFRESH_DAYS` | 90 | Na zoveel dagen wordt een bewaard barcode-record op de achtergrond ververst |
| `CATALOG_PRIORITY_COUNT` | 5 | Aanvraag-telling vanaf waar een kandidaat `priority` krijgt |
| `CATALOG_IMAGE_HEALTH` | aan | `off` zet de periodieke HEAD-check van afbeeldingslinks uit |
| `ILLUSTRATIONS_ENABLED` | uit | `true` zet eigen tekeningen aan (kost geld) |
| `ILLUSTRATION_MODEL`, `PRICE_ILLUSTRATION` | `gpt-image-1`, 0,011 | Model en prijs per tekening |
| `ILLUSTRATION_DAILY_BUDGET_USD` | 1 | Dagbudget voor tekeningen |

**Privacy.** Naar de server gaat alleen de getypte productnaam en waar hij vandaan komt (`search`). Geen lijst, geen lijstnaam, geen foto, geen gegevens over het kind. De server logt de naam niet, alleen de uitkomst. Kandidaten bevatten geen IP-adressen, toestel-id's, lijstjes of namen van mensen.

## Thuis verzamelen (Lijstjesavontuur)

In **Toevoegen** staat boven de tegels **Help jij Karrie boodschappen verzamelen?** met **Ga op ontdekking!**. Dat opent dezelfde camera als de cameraknop, maar met een eenvoudig resultaat voor het kind. De cameraknop naast het zoekveld blijft het gewone ouderscherm.

- **Zeker** (een losse banaan met de tekening uit de catalogus, of een streepjescode met een volledig record bij Open Food Facts of uit Mijn producten): **Banaan gevonden!** met de tekening of de productfoto en één grote knop **In het mandje!**. Daarna vliegt het product in Karrie's mandje, telt Karrie mee ("1 product ontdekt!", "3 producten verzameld!") en brengt **Zoek de volgende!** de camera terug.
- **Twijfel bij een los product**: **Is dit een appel?** met **Ja!**.
- **Onbekend of twijfelachtig** (geen herkenning, een webpagina of een merk dat niet klopt): **Vraag een ouder** opent het gewone ouderscherm met hetzelfde resultaat. Karrie verzint nooit een product.
- **Staat al op de lijst**: **Die hebben we al!**. Dat telt niet mee; **Nog één erbij** verhoogt het aantal.
- Bij 5 verzamelde producten: **Hoera! Karrie heeft al 5 producten verzameld!** met confetti, één keer per lijstje.
- In de camera staat een zoekidee ("Zoek iets uit de fruitmand!"). Past het product, dan zegt Karrie **Gelukt!**. Het telt nergens voor mee.
- Bij **Start avontuur** zegt Karrie kort **Alles verzameld? Nu gaan we ze zoeken!**. Tikken of even wachten sluit het. Sterren komen alleen in de winkel, zoals altijd.

**Geluid.** Met geluid aan klinkt een korte "biep" als een streepjescode gelezen is (één keer per code) of als een foto herkend is, niet bij de ontspanknop. In het mandje doen geeft een "plop", de mijlpaal een fanfare. Er zijn geen geluidsbestanden; de tonen worden op het toestel gemaakt.

**Privacy.** Een losse banaan krijgt de tekening; de foto van het kind wordt dan niet bewaard. Een merkproduct houdt het bestaande gedrag (foto van Open Food Facts of jouw foto, alleen op dit toestel). Camerabeeld verlaat het toestel alleen bij de ontspanknop, net als voorheen. Statistieken tellen alleen het bestaande `product_added` met `photo` of `barcode`; het aantal verzamelde producten en de mijlpaal sturen niets. Er is geen account en Karrie bewaart niets over het kind: alleen welke items van dit lijstje thuis verzameld zijn.

## Aanbiedingen (PrijsProfeet)

Kies per lijstje één supermarkt: **Jumbo**, **Albert Heijn** of **Lidl**. Dat kan in **Controleren** (onder de titel) en in **Toevoegen** (het knopje rechtsboven, met een labeltje). Nog een keer tikken op de gekozen supermarkt zet het weer uit. Zonder supermarkt zoekt Karrie niets op. Een nieuw lijstje begint met de supermarkt die je het laatst koos; een bewaard lijstje houdt zijn eigen supermarkt. Op het beginscherm kun je onder **Voor ouders → Supermarkt** de standaard voor nieuwe lijstjes kiezen (of uitzetten); het lijstje waar je mee bezig bent, verandert daar niet door.

**Wat je ziet.** In **Controleren** staat bij een product **Aanbieding** (oranje) als het zeker of vrijwel zeker hetzelfde product is, en **Mogelijke aanbieding** (alleen een rand) als het waarschijnlijk zo is maar niet zeker. Bovenaan staat dan bijvoorbeeld "2 producten in de aanbieding bij Jumbo"; daar tellen alleen de zekere aanbiedingen mee. Tik op een label voor de actie (bijvoorbeeld "2 voor €2,99" en "Normaal €1,79"), het product van de supermarkt, de einddatum, de voorwaarden (alleen online, met klantenkaart, maximaal per klant) en een link naar de supermarkt. Karrie rekent zelf geen besparing uit. In **Toevoegen** krijgt een tegel die op de lijst staat alleen een klein oranje labeltje bij een zekere aanbieding. Er komt geen melding, geen pop-up en geen "Geen aanbieding". In het winkelavontuur staat onder de productnaam hetzelfde label; tikken opent de details voor de ouder. Karrie vervangt nooit zelf een product.

**Zo wordt gezocht.** De app stuurt de naam, de andere namen uit de catalogus ("bananen"), de afdeling, en bij een merkproduct het merk, de variant, de inhoud en de gescande streepjescode naar `POST /api/offers/match` op `karrie-api`. De server vraagt PrijsProfeet `GET https://www.prijsprofeet.nl/api/v1/search` met `q`, `retailer`, `promotion_status=active` en `page_size=20`. Andere eindpunten gebruikt Karrie niet: `/match/*`, schapprijzen en prijsgeschiedenis zijn betaald.

**Zo wordt gematcht (streng).**

- **Exact**: de streepjescode is gelijk. Wijkt de inhoud af (1 l tegen 1,5 l), dan wordt het **waarschijnlijk** met gemiddelde zekerheid.
- **Merkproduct zonder streepjescode**: hetzelfde merk en dezelfde naam. Is ook de inhoud gelijk en staat er niets extra's in de naam, dan is het waarschijnlijk met hoge zekerheid; anders gemiddeld. Een ander merk of een andere variant ("volle" in plaats van "halfvolle") telt niet.
- **Standaardproduct** ("Banaan"): de afdeling moet passen (groente bij groente-fruit, zuivel bij zuivel-eieren of kaas, enzovoort), de naam moet er enkelvoud of meervoud in staan, en elk ander woord moet onschuldig zijn. Woorden als "los" en "per kg" veranderen niets; woorden als "bio", "tros" en "halfvolle" maken het gemiddeld zeker. Elk ander woord betekent: niet dit product. "Ella's Kitchen Baby bananen ontbijtje" is dus geen banaan, "Dove roller komkommer" geen komkommer en "Witte kaas" geen kaas. Een A-merk bij een standaardproduct is hoogstens gemiddeld zeker.
- Alleen acties met status `active` tellen, en alleen tussen `valid_from` en het einde van de dag `valid_until` (Nederlandse tijd).
- **Aanbieding** = exact of hoge zekerheid. **Mogelijke aanbieding** = gemiddelde zekerheid.

Live gemeten in november 2026 (`node scripts/check-offers.mjs`, 24 zoekopdrachten): bij AH gaf de Arla-melk met streepjescode **exact** en zonder streepjescode **waarschijnlijk, hoog**; "Banaan" werd **mogelijk** Chiquita bananen en "Melk" **mogelijk** Arla. Bij Jumbo en Lidl vond Karrie voor de testproducten niets dat streng genoeg overeenkwam.

**Bewaren.** De gekozen supermarkt staat bij het lijstje (en bij bewaarde lijstjes) en de laatst gekozen bij de instellingen, in IndexedDB op het toestel. Antwoorden staan ook in IndexedDB (`offers`), per supermarkt en product. Een lijst toont bewaarde antwoorden meteen. Na 6 uur vraagt Karrie het op de achtergrond opnieuw; een antwoord ouder dan 24 uur of een actie na de einddatum wordt nooit getoond. De server onthoudt zoekresultaten hoogstens 3 uur en nooit langer dan de eerste einddatum erin.

**Rustig zoeken.** Vragen wachten 300 ms, zodat snel na elkaar toevoegen of van supermarkt wisselen niets extra kost. Hetzelfde product wordt maar één keer tegelijk gevraagd, en er lopen hoogstens twee vragen tegelijk. Na een fout probeert Karrie het opnieuw na 2, 8 en 32 minuten, na een limiet na 30 minuten. Offline wacht Karrie tot er weer verbinding is en toont het alleen geldige bewaarde antwoorden. Faalt PrijsProfeet, dan zie je gewoon geen label; het lijstje en het avontuur werken door.

**Limieten.** Zonder sleutel staat PrijsProfeet 120 zoekopdrachten per minuut toe, en 500 zoekopdrachten op alleen een streepjescode per dag. Karrie blijft daar voor de hele server onder: hoogstens 60 per minuut en 400 streepjescodes per dag (daarna zoekt Karrie op naam). Bij een `429` stopt de server met vragen zolang `Retry-After` zegt. Per IP: 300 per uur en 1500 per dag (`OFFERS_LIMIT_PER_IP_HOUR`, `OFFERS_LIMIT_PER_IP_DAY`). `/api/health` toont onder `offers` de aantallen per supermarkt en uitkomst, het geheugen en of de server even pauzeert.

**Instellen op Render (`karrie-api`).** Niets is verplicht. `OFFERS=off` zet het uit. `PRIJSPROFEET_USER_AGENT` (standaard `Karrie/1.0 (+https://karrie.eu)`; PrijsProfeet weigert namen met "bot", "crawler", "spider" of "slurp"). **Aanbevolen:** vraag een gratis sleutel aan op prijsprofeet.nl en zet die als `PRIJSPROFEET_API_KEY` (geheim, alleen op de server). Daarmee wordt de limiet 150 per minuut en is Karrie herkenbaar voor PrijsProfeet. De gratis sleutel kost niets; een betaald abonnement is niet nodig en niet ingesteld.

**Naamsvermelding.** Waar een label of het aanbiedingsvenster staat, staat ook "Aanbiedingen via PrijsProfeet" met een link naar https://www.prijsprofeet.nl, zoals PrijsProfeet vraagt.

**Privacy.** Er gaat alleen productinformatie naar de server en PrijsProfeet: geen foto's, geen namen of leeftijden, geen lijstnaam, geen locatie. De server logt alleen de supermarkt, of het een standaardproduct was en de uitkomst, niet de productnaam.

### Productfoto's via PrijsProfeet

**Wat het doet.** Heeft een gescand product geen voorpagina-foto van Open Food Facts, dan vraagt de app op de achtergrond `POST /api/images/ean` met alleen `{ ean }`. De server zoekt bij PrijsProfeet `GET /api/v1/search?q=<ean>&retailer=jumbo,albert_heijn,lidl&page_size=20&page=1…` (maximaal 3 pagina’s tot er een exacte EAN-foto is), zonder `promotion_status`, dus ook verlopen en komende acties. Een rij telt alleen als haar `ean` precies de gescande code is (ook met of zonder voorloopnul); een gelijkende naam is nooit genoeg. Van die rij neemt Karrie alleen `image_url` over, en alleen van de eigen fotoserver van de supermarkt: `static.ah.nl/dam/product/`, `www.jumbo.com/dam-images/` of `www.lidl.nl/assets/`, altijd via https. De app controleert dat opnieuw. Er komt geen OpenAI-aanroep aan te pas. De drie ketens in de winkelkiezer blijven de enige **shopping**-supermarkten; eventuele extra PrijsProfeet-ketens voor foto’s worden apart geallowlist.

**Welke foto je kind ziet.** Zonder keuze van de ouder: Open Food Facts, dan de supermarktfoto via PrijsProfeet, dan een gevonden voorbeeldfoto, dan de eigen foto van de ouder, dan de Karrie-tekening. Kiest de ouder bij het product **Eigen foto**, **Voorbeeldfoto** (dat is ook de supermarktfoto) of **Tekening**, dan wint die keuze altijd, ook in bewaarde lijstjes. Laadt de gekozen foto niet, dan valt Karrie terug op de volgorde hierboven; de keuze zelf blijft bewaard. Met een supermarktfoto zoekt Karrie geen voorbeeldfoto meer. Standaardproducten zonder streepjescode houden hun tekening; het toevoegen wacht nooit op de foto.

**Dekking.** De gratis zoekfunctie bevat alleen producten die in de aanbieding zijn, waren of komen. Een product dat nooit in de aanbieding was, heeft dus geen foto. Lidl geeft geen streepjescodes door, dus in de praktijk komen de foto's van Albert Heijn en Jumbo.

**Limieten en geheugen.** De zoekopdracht telt mee voor dezelfde limieten als de aanbiedingen: hoogstens 60 per minuut en 400 streepjescodes per dag voor de hele server, dezelfde pauze na een `429`, en per IP de aanbiedingslimieten. De server onthoudt een gevonden foto 14 dagen, "geen foto" 1 dag en een fout 5 minuten (hoogstens 5000 codes). De app onthoudt de link per streepjescode op het apparaat, vraagt "geen foto" na 7 dagen opnieuw en controleert een gevonden foto na 30 dagen. `/api/health` toont onder `storeImages` de uitkomsten per supermarkt. De server logt nooit de link.

**Rechten.** De foto's zijn van de supermarkt. PrijsProfeet zegt: "Een productfoto komt alleen mee als link naar de keten zelf." Karrie linkt daarom alleen (met `referrerPolicy="no-referrer"`), kopieert de foto nooit naar de server of het apparaat en deelt hem niet met andere gezinnen. Bij de foto staat altijd "Foto: Albert Heijn, via PrijsProfeet" (of Jumbo, Lidl) met een link naar de productpagina; nooit Open Food Facts. **Lees vóór gebruik de [API-voorwaarden](https://www.prijsprofeet.nl/api-voorwaarden)**; die konden bij het bouwen niet automatisch worden opgehaald. Mag het niet, zet dan `PRIJSPROFEET_IMAGES=off` op `karrie-api`: het eindpunt verdwijnt en de app valt terug op voorbeeldfoto's en tekeningen.

### Merken en foto's op naam

**Wat het doet.** Typt een ouder een product dat niet in de catalogus staat (en zonder streepjescode), dan vraagt de app op de achtergrond `POST /api/images/name` met `{ name }` en optioneel `{ retailer }` (de supermarkt van **dit** lijstje). Het toevoegen wacht daar nooit op; het kind ziet tot er een foto is de tekening van de afdeling. De server zoekt in deze volgorde en stopt zodra er een betrouwbare foto is:

1. **PrijsProfeet** `GET /api/v1/search?q=<naam>&retailer=jumbo,albert_heijn,lidl&page_size=20&page=1…` (zonder `promotion_status`, max. 3 pagina’s tot er een goede merkmatch is). Vindt de hele naam geen merk, dan nog één keer met alleen het eerste woord ("calve").
2. **Open Food Facts** `cgi/search.pl` met `search_terms`, alleen producten uit Nederland, gratis en zonder sleutel. Langzaam en soms onbereikbaar: na een `503` probeert de server het na 1,5 s nog één keer, daarna pauzeert hij 30 s; hoogstens 8 zoekopdrachten per minuut voor de hele server.
3. **Voorbeeldfoto** (de bestaande OpenAI/Brave-zoekfunctie), alleen voor een merk zonder foto uit 1 en 2, en alleen als **Voor ouders → Voorbeeldfoto's** aanstaat. Daarbij worden geen productgegevens van winkelpagina's gelezen (`typed: true`).

**Huismerken.** Alleen rijen met `private_label: true` van de gekozen lijst-supermarkt worden als huismerk-alternatief getoond. Ontbreekt die vlag, dan wordt niets als huismerk aangenomen. Merkfoto’s (Pepsi, Nutella, …) blijven retailer-onafhankelijk. Een gekozen voorbeeldfoto verandert de productidentiteit niet; alleen **Gebruik dit huismerkproduct** zet merk/`privateLabelRetailer`.

**Supermarkt per lijst.** `adventure.retailer` stuurt aanbiedingen en huismerksuggesties. `settings.retailer` is alleen de default voor nieuwe lijstjes (instellingen). Wisselen van winkel op een lijst wijzigt geen producten, EAN’s of ouderfoto’s.

**Zo wordt gematcht (vast, zonder AI).** Het merk moet in de rijen staan en de getypte naam moet ermee beginnen; een ander merk telt nooit. Een smaak of soort die niet getypt is ("0% suiker", "halfvol", "plant-based", "vanille", "kwark") maakt een rij ongeschikt: "Chocomel" geeft Chocomel Vol 1 l, nooit 0% suiker of plant-based. Een getypte soort moet erin staan: "Chocomel 0% suiker" krijgt alleen de 0%-pak. Verpakking is iets anders dan soort: "Chocomel blik" wil een blik (anders geen foto), "Chocomel 1 liter" wil 1 l (5% marge). Zonder verpakking wint een los pak boven een multipack; actieve promo’s verliezen van niet-promo bij gelijke score. Eén rij met een raar merk ("Calvé Pindakaas") verdringt het merk dat in de meeste rijen staat niet. Een merk zonder passende rij (Optimel, alleen smaken) wordt wel een merkproduct, maar zonder automatische foto.

Live gemeten op 8 november 2026: Chocomel, Chocomel blik, Chocomel 1 liter en Chocomel 0% suiker kregen de juiste foto van AH of Jumbo; Nutella (niet bij PrijsProfeet) kreeg een foto van Open Food Facts; Optimel werd een merk zonder automatische foto; walnoten bleef een gewoon product. Calvé pindakaas werkt in de test met de echte Open Food Facts-rijen, maar Open Food Facts gaf tijdens de meting vaak `503`.

**Wat er bewaard wordt.** Alleen de link naar de foto, de productnaam van de bron, de supermarkt, de bronpagina en de verpakking als tekst. Nooit een streepjescode, voedingswaarden of inhoud voor het product van de ouder; de server stuurt de streepjescode van de gevonden rij niet eens mee. Foto's worden alleen gelinkt (`referrerPolicy="no-referrer"`), nooit gekopieerd. Bij de foto staat "Foto: Albert Heijn, via PrijsProfeet" of "Foto: Open Food Facts (CC BY-SA)", met "een voorbeeld van dit product".

**De ouder kiest.** In het productvenster (alleen in **Controleren**) staan bij een merk de andere gevonden foto's van hetzelfde merk en dezelfde getypte woorden. Tikken kiest die foto voor dit product in Mijn producten en op elk lijstje. De volgorde voor het kind: keuze van de ouder, dan de foto bij de streepjescode, dan de foto op naam, dan een voorbeeldfoto, dan de tekening. Laadt een foto niet, dan valt Karrie terug.

**Geheugen.** De server onthoudt een antwoord met foto 7 dagen, zonder foto 1 dag en een storing 5 minuten (hoogstens 5000 namen), en de ruwe zoekresultaten 6 uur, zodat "Chocomel", "Chocomel blik" en "Chocomel 1 liter" één zoekopdracht bij PrijsProfeet kosten. Huismerksuggesties zitten apart onder `private-label|{retailer}|{nameKey}` en overschrijven elkaar niet. De app onthoudt antwoorden per `naam|r|{retailer}` in IndexedDB (`nameImages`): een gevonden foto wordt na 30 dagen opnieuw gecontroleerd, "geen foto" na 7 dagen; offline wacht de app. Hetzelfde product op meerdere lijstjes wordt één keer gevraagd. Antwoorden uit het geheugen van de server tellen niet mee voor de limieten (dezelfde als bij de aanbiedingen).

**Kosten.** PrijsProfeet en Open Food Facts kosten niets. Alleen stap 3 kost geld: ongeveer 2 OpenAI-aanroepen per nieuw merk per toestel (ongeveer $0,017, of $0,016 met Brave; zie Kosten), en alleen als er geen foto uit 1 of 2 kwam. Een merk dat bij PrijsProfeet of Open Food Facts gevonden wordt, kost ook geen ordening door OpenAI. Uitzetten kan per toestel met **Voor ouders → Voorbeeldfoto's**, of voor iedereen door `OPENAI_API_KEY` weg te laten (dan ook geen fotoherkenning).

**Uitzetten.** `OFF_NAME_SEARCH=off` slaat Open Food Facts over; `PRIJSPROFEET_IMAGES=off` slaat PrijsProfeet over (ook de foto's bij streepjescodes). Staan beide uit, dan verdwijnt het eindpunt en gaat elk getypt product meteen naar de ordening zoals vroeger. `/api/health` toont onder `nameImages` de uitkomsten (`branded-prijsprofeet`, `branded-off`, `branded-none`, `unknown-none`, fouten), het geheugen en de stand van Open Food Facts. De server logt de naam en de links nooit.

## Statistieken (Umami)

Karrie telt anoniem hoe de app gebruikt wordt, met [Umami Cloud](https://umami.is). Umami zet geen cookies en maakt geen gebruikersprofiel; Karrie roept nooit `umami.identify()` aan.

**Instellen.** Zet `UMAMI_SCRIPT_URL` (bijvoorbeeld `https://cloud.umami.is/script.js`) en `UMAMI_WEBSITE_ID` bij de statische site **`karrieapp`** (Environment), niet alleen bij `karrie-api`. Kies daarna **Manual Deploy → Clear build cache & deploy**: de waarden worden tijdens het bouwen in `index.html` gezet. Ontbreekt er één, dan bouwt de site gewoon zonder statistieken. Beide waarden zijn openbaar; er is geen Umami-sleutel nodig.

**Waar het niet telt.** `npm run dev` krijgt het script nooit. Een gebouwde versie telt alleen op `karrie.eu`, `www.karrie.eu` en het oude `karrieapp.onrender.com` (`data-domains`), dus `vite preview` op localhost stuurt niets. Wie in de browser *Do Not Track* aan heeft, wordt niet geteld. Zoekparameters en `#` worden niet meegestuurd. Deellinks (`/l/{id}`) worden vóór verzenden herschreven naar `/l`, zodat de geheime code niet in Umami belandt (`data-before-send` in `vite.config.ts`).

**Paginaweergaven** komen automatisch: Umami ziet ook het wisselen van scherm binnen de app (`/`, `/toevoegen`, `/controleren`, `/winkel`, `/klaar`, en `/l` voor deellinks).

**Gebeurtenissen.** Alleen vaste namen, vaste waarden en aantallen:

| Gebeurtenis | Wanneer | Gegevens |
| --- | --- | --- |
| `shopping_list_created` | eerste product op een nieuw lijstje (een geplakte lijst telt als één) | geen |
| `product_added` | een nieuwe regel op het lijstje; nog een tik op hetzelfde product of **+** telt niet | `method`: catalog, paste, saved (Mijn producten), photo, barcode, manual, custom (zelf toegevoegd, zonder de naam); `category`: afdeling |
| `product_recognized` | een herkend product: streepjescode bekend, of foto herkend | `method`: barcode of photo; `source`: open_food_facts, web_search, cache, my_products, openai |
| `adventure_started` | **Start** van een lijstje dat nog niet liep | `item_count` |
| `adventure_completed` | het laatste product gevonden | `item_count`, `completed_missions` |
| `bonus_mission_completed` | de ouder bevestigt een bonusmissie | `choice`: alternative of original |
| `offer_opened` | de ouder tikt op een aanbiedingslabel in **Controleren** of in de **winkel** en het venster gaat open | `retailer`: jumbo, ah, lidl; `match_type`: exact of likely |
| `app_first_open` | eerste keer dat dit browserprofiel Karrie opent (na deploy van deze meting) | geen |
| `new_adventure_clicked` | tik op **Nieuw avontuur** op het beginscherm | geen |
| `onboarding_opened` / `onboarding_finished` | intro “Hoe werkt Karrie?” openen / afsluiten | `action`: start, skip of dismiss |
| `first_list_created` | eerste echte lijst krijgt zijn eerste product (één keer per installatie) | geen |
| `first_adventure_started` / `first_adventure_completed` | eerste start / eerste afronding (één keer per installatie) | geen |
| `app_returned` | bestaand profiel opent Karrie op een andere lokale kalenderdag | `days_since_last_open`: 1, 2-7, 8-30 of 31+ |
| `shopping_list_saved` | lijstje succesvol bewaard | `action`: new of updated |
| `saved_list_reopened` | ouder opent een bewaard lijstje opnieuw | geen |
| `scanner_opened` | camera voor streepjescode/foto gaat open | geen |
| `scanner_result` | één uitkomst per herkenningspoging | `method`: barcode of photo; `outcome`: success, not_found, error of offline |
| `share_completed` | delen van de Karrie-site lukte (systeemblad of kopiëren; annuleren telt niet) | `method`: native of copied |
| `shopping_list_share_opened` | deellink-sheet voor een lijstje opent | geen |
| `shopping_list_shared` | deellink gedeeld of gekopieerd | `method`: native of copied |
| `shared_list_imported` | ontvanger bevestigt import van een deellink | `item_count`; `entry`: link |
| `feedback_opened` | Tally-formulier geopend (geen bewijs van verzenden) | `source`: settings of completed |
| `sticker_book_opened` | stickerboek bewust geopend | geen |

**Eerste-gebruik funnel (Umami Goals/Funnel):** `app_first_open` → `new_adventure_clicked` → `first_list_created` → `first_adventure_started` → `first_adventure_completed`.

**Retentie en hergebruik:** `app_returned`, `shopping_list_saved`, `saved_list_reopened`. Vergelijk `first_adventure_started` met alle `adventure_started`, en `first_list_created` met `shopping_list_created`.

Umami **visitors** is niet hetzelfde als unieke mensen over de hele levensduur. `app_first_open` en `app_returned` zijn benaderingen per browserprofiel/apparaat, pas vanaf de dag van deze deploy; eerdere geschiedenis wordt niet teruggezet. Bestaande installaties worden niet als nieuw geteld.

Wat niet telt: hydrateren, **Ongedaan maken**, opnieuw openen van het eindscherm, elke camerabeeld-frame, geannuleerd delen, en een missie die alleen getoond of overgeslagen wordt. Na **Terug** en opnieuw **Gevonden!** telt de voltooiing niet nog eens zolang de app open blijft (sessie-`once`).

**Controleren in Umami Cloud.** Open Websites → Karrie. **Realtime** toont binnen enkele seconden een bezoek aan `karrie.eu` en elke gebeurtenis. Onder **Events** staan de gebeurtenissen met hun aantallen; klik op een naam voor de verdeling van `method`, `source` of `choice`. In de browser (DevTools → Network, filter `api/send`) zie je per verzoek precies wat er wordt verstuurd. Geen wijziging nodig aan Render-env-vars behalve de bestaande Umami-sleutels.

Faalt Umami (geblokkeerd, offline, traag), dan merkt Karrie daar niets van: er wordt geen wachtrij aangelegd; een gemiste first-open kan bij een later bezoek alsnog gaan als de tracker er is.

## Over Karrie en privacy

Onder **Voor ouders** staan, onder **Bewaarde lijstjes wissen**, twee rustige regels: **❤️ Over Karrie** (het verhaal van Thomas met `public/images/karrie_thomas_over-ons.webp`) en **Privacy en gegevens** (een korte samenvatting). Ze openen in hetzelfde venster; **Terug** brengt je naar de instellingen, sluiten zet het venster weer op de instellingen.

De volledige privacyverklaring is een losse pagina, `public/privacy.html` (`/privacy.html`). De service worker stuurt die niet naar de app (`navigateFallbackDenylist`), en Render levert bestaande bestanden voor de rewrite naar `/index.html`. De naam en het e-mailadres van de verantwoordelijke staan er nog niet; die kun je later in het blok **Wie is verantwoordelijk?** zetten. Laat de tekst juridisch nakijken als je klaar bent. Verandert er iets aan welke gegevens Karrie verstuurt (in dit bestand onder Privacy, Umami of een nieuwe dienst), pas dan ook `privacy.html`, de samenvatting in `src/features/home/PrivacyInfo.tsx` en de datum bovenaan aan.

## Kosten (gemeten met `gpt-5.4-mini`, november 2026)

Prijs: $0,75 per miljoen invoertokens, $4,50 per miljoen uitvoertokens. Het schema met de bonusmissie maakt elke aanvraag wat groter dan voorheen.

Gemeten op echte productfoto's (pindakaas voor- en achterkant, chocopasta, frisdrank, vleesvervanger, yoghurt, brood): ongeveer 3.500 invoertokens en 200 tot 300 uitvoertokens per foto.

Reken op ongeveer $0,004 per foto: 100 foto's per maand kosten zo'n $0,40. Het dagbudget van $1 is genoeg voor ongeveer 250 foto's, dus dat grijpt nu eerder in dan de daglimiet van 300 aanvragen. Een herkenning duurt ongeveer 3 seconden als de server wakker is.

**Voorbeeldfoto's** kosten per nieuw product ongeveer $0,017: $0,01 voor de webzoekaanroep plus zo'n 9.000 invoertokens (zoekresultaten en kleine versies van de foto's). Een merkproduct kost met productinformatie ongeveer $0,021; met Brave in plaats van OpenAI-webzoeken naar verwachting ongeveer $0,016 ($0,005 voor Brave, zonder de webzoekaanroep van $0,01; nog niet gemeten). Een product dat al bekend is, kost niets. Een gezin dat 50 verschillende producten gebruikt, kost dus eenmalig ongeveer $0,85. Een open-licentiefoto die de server al kent, is voor andere gezinnen gratis. Voorbeeldfoto's hebben een eigen dagbudget (`IMAGE_DAILY_BUDGET_USD`, standaard $1, ongeveer 60 nieuwe producten per dag). `/api/health` toont onder `images` het aantal zoekopdrachten en de kosten van vandaag.

**Streepjescodes**: Open Food Facts kost niets. Alleen een code die Open Food Facts niet kent, kost geld: één OpenAI-webzoekaanroep ($0,01) plus de tokens van de zoekresultaten, gemeten op Render $0,014 per onbekende code (ongeveer 8.500 invoertokens, de helft uit de cache, en 5 seconden). Een onbekende code wordt hoogstens één keer per 7 dagen gezocht, zolang de server wakker blijft. Met het dagbudget van $0,50 zijn dat ongeveer 35 onbekende codes per dag. Een bekende code bij Open Food Facts duurde op Render 0,4 tot 0,6 seconde; uit het geheugen van de server 0,2 seconde. Een code uit **Mijn producten** of uit het geheugen van het toestel gaat niet eens naar de server.

**Zelf toegevoegde producten**: het ordenen kost naar schatting $0,001 tot $0,002 per nieuw product (ongeveer 500 invoertokens en 100 tot 300 uitvoertokens; nog niet gemeten). Een product dat al als kandidaat bekend is, kost niets. Een eigen tekening kost ongeveer $0,011 extra, alleen met `ILLUSTRATIONS_ENABLED=true` (zie **Zelf een product toevoegen**).

## Limieten en misbruik

- De server accepteert alleen JPEG, PNG of WebP als data-URL, controleert de bestandskop en weigert aanvragen boven 2 MB (`413`).
- Alleen aanvragen vanaf `ALLOWED_ORIGINS` worden geaccepteerd. Per IP-adres loopt er hoogstens één herkenning tegelijk.
- De app staat per toestel 25 herkenningen per dag toe.
- Voorbeeldfoto's: per toestel 40 zoekopdrachten per dag; op de server per IP 30 per uur en 80 per dag (`IMAGE_LIMIT_PER_IP_HOUR`, `IMAGE_LIMIT_PER_IP_DAY`), 200 per dag in totaal (`IMAGE_LIMIT_DAILY_REQUESTS`) en hoogstens 3 tegelijk (`IMAGE_MAX_CONCURRENT`, daarboven `503`). Antwoorden uit het geheugen van de server tellen niet mee. Optioneel: `OPENAI_IMAGE_SEARCH_MODEL` (standaard het herkenningsmodel) en `BRAVE_SEARCH_API_KEY` (zet Brave aan voor merkproducten; standaardproducten blijven via OpenAI-webzoeken en Openverse gaan). `IMAGE_OPENVERSE=off` zet Openverse uit.
- Streepjescodes: op de server per IP 60 per uur en 200 per dag, 1000 per dag in totaal (zie **Streepjescode in de camera**). Antwoorden uit het geheugen tellen niet mee. Per toestel loopt er hoogstens één opzoeking per code tegelijk.
- Aanbiedingen: per IP 300 per uur en 1500 per dag; naar PrijsProfeet hoogstens 60 per minuut en 400 streepjescodes per dag voor de hele server (zie **Aanbiedingen**).
- De tellers op de server staan in het geheugen. Ze beginnen opnieuw na een herstart of slaapstand, en per-IP-limieten zijn te omzeilen door een ander IP-adres. **Stel daarom ook een maandlimiet in bij OpenAI** (platform.openai.com → Settings → Limits). Dat is de harde grens.

## Checklist camera en bonusmissies (op een echte telefoon)

Dit is nog niet op een echte iPhone of Android-telefoon getest. Loop deze lijst daarom op beide toestellen na en noteer toestel, versie en of de camera direct opende.

- **Toevoegen**: tik op de camera naast het zoekveld. De telefoon vraagt één keer om camera-toegang. Het camerascherm toont live beeld van de achtercamera, niet de galerij.
- Richt op een pot pindakaas en tik op de ontspanknop. Na ongeveer 3 seconden zie je **Herkend!** met naam, merk en afdeling. Er is geen bijsnijdstap.
- Tik op **Toevoegen en verder scannen**. De camera komt meteen terug met even **Pindakaas staat op je lijst** (en een plopje als geluid aan staat); de pot die nog in beeld is, springt niet meteen weer op. Scan daarna een streepjescode en fotografeer nog een product: beide werken in dezelfde camera. Snel twee keer tikken zet het product maar één keer op de lijst.
- Tik bij het laatste product op **Toevoegen en klaar**: de camera sluit en je bent terug bij **Toevoegen**. Het product staat met jouw foto op de lijst, niet met een tekening. Binnen ongeveer 10 seconden kan die foto vervangen worden door een voorbeeldfoto; in het productvenster zie je welke en waarvandaan, en vaak ook **Productinformatie** (Nutri-Score, voedingswaarden, bron).
- Zet **Banaan** uit de catalogus op de lijst. Hij houdt de tekening. In het productvenster zet **Voorbeeldfoto** een foto aan en **Geen voorbeeldfoto** de tekening terug.
- Lang drukken op een lijstje op het beginscherm wist het, met **Ongedaan maken**. **Voor ouders → Bewaarde lijstjes wissen** wist ze allemaal na een bevestiging.
- Ga terug naar **Toevoegen**. Het herkende product staat met een hartje onder zijn afdeling en vind je via het zoekveld. Lang drukken vergeet het; **Ongedaan maken** zet het terug.
- Zet vliegtuigmodus aan en open de lijst opnieuw. De voorbeeldfoto's van open bronnen en van dit toestel staan er nog.
- Fotografeer een los brood. Het resultaat zegt **Karrie gebruikt de tekening van brood** en de lijst toont de tekening.
- Zet eerst **Pindakaas** uit de catalogus op de lijst en fotografeer een pot pindakaas. Karrie vraagt **Wil je deze foto gebruiken voor Pindakaas?** en maakt geen dubbele regel.
- Fotografeer de achterkant met de ingrediënten (suiker, zout). Het resultaat toont **Bonusmissie: …** met **Op het etiket gezien** en **Staat aan**.
- Fotografeer twee producten tegelijk of maak een wazige foto. Karrie zegt **Klopt dit?** of **Niet zeker** en laat je alles zelf invullen.
- Fotografeer een product met iemands gezicht erbij. Karrie toont **Alleen het product graag**.
- Weiger de camera een keer. Het scherm legt uit hoe je toegang geeft, en **Kies uit galerij** werkt nog.
- Zet de app op de achtergrond terwijl de camera open is. Het cameralampje moet uitgaan.
- Zet vliegtuigmodus aan en maak een foto. Je krijgt **Geen internet** en kunt het product zelf invullen.
- **Controleren**: lang drukken op een regel haalt hem weg, met **Ongedaan maken**. Lang drukken op de **+** of **−** verwijdert niets.
- Start het avontuur. Bij de pindakaas verschijnt **Ik heb een bonusmissie!**. Probeer **Op zoek!**, **Gevonden!** en alle drie de oudersknoppen, en **Terug**.
- Start het avontuur, zet vliegtuigmodus aan en ververs `/winkel`. De foto's en de missie staan er nog.
- Open de app na een kwartier niets doen. De eerste foto toont **Karrie wordt even wakker** en lukt daarna alsnog.

**Streepjescode (op beide toestellen)**

- Open de camera en houd de streepjescode van een bekend merkproduct (bijvoorbeeld Nutella 400 g, 3017620422003) in de band in het midden. Binnen ongeveer een seconde verschijnt **Streepjescode gevonden…** en daarna het bevestigingsscherm met **Open Food Facts** bij naam en merk, de foto van Open Food Facts en **Gegevens: Open Food Facts (ODbL), foto CC BY-SA**.
- Houd dezelfde code nog eens voor de camera nadat je **Terug naar camera** tikte: er komt geen tweede aanvraag (zie `/api/health` → `barcode.stats`).
- Scan een zelfgemaakte of onbekende code. De camera blijft open met **Onbekende streepjescode. Maak een foto van de voorkant.** Tik op de ontspanknop: het resultaat komt van de foto en de gelezen code staat erbij.
- Tik op de ontspanknop terwijl er een streepjescode in beeld is, en ook als er geen enkele code in beeld is. Beide keren wordt de foto gewoon gemaakt.
- Houd de camera twee minuten open en richt op van alles. Let op batterij, warmte en of het beeld blijft lopen. Zet de app op de achtergrond en weer terug: de camera en het lezen gaan weer aan.
- Weiger de camera. **Kies uit galerij** met een foto van een streepjescode vindt het product zonder OpenAI.
- Scan een product dat al in **Mijn producten** staat. Naam en merk komen van jou (**uit Mijn producten**), niet van Open Food Facts.
- Zet vliegtuigmodus aan en scan een code die je eerder scande: het product komt uit het geheugen van het toestel. Een nieuwe code geeft **Opzoeken lukt nu niet** en **Zelf invullen**.

**Aanbiedingen (op beide toestellen)**

- **Toevoegen**: tik op het knopje rechtsboven en kies **Albert Heijn**. Zet Banaan, Melk en Komkommer op de lijst. Er komt geen melding.
- **Controleren**: Albert Heijn staat aan. Bij een product met een actie staat **Aanbieding** of **Mogelijke aanbieding**, met "Aanbiedingen via PrijsProfeet" eronder. Tik op een label: het venster toont de actie, de einddatum en **Bekijk bij Albert Heijn**. In de **winkel** staat hetzelfde label onder de productnaam.
- Kies **Jumbo**: de labels van AH verdwijnen en die van Jumbo komen (of niets). Kies weer **Albert Heijn**: de labels staan er meteen weer, zonder te wachten.
- Bewaar het lijstje, maak een nieuw lijstje met **Lidl** en open het bewaarde lijstje: dat staat nog op Albert Heijn.
- Zet vliegtuigmodus aan en open het lijstje: bewaarde labels blijven, er komt geen foutmelding. **Start avontuur** werkt en in het avontuur staan geen labels.

**Thuis verzamelen (iPhone Safari en Android Chrome)**

- Zet het geluid aan (beginscherm → **Voor ouders**). **Toevoegen → Ga op ontdekking!**: de camera opent met een zoekidee onderin.
- Scan de streepjescode van een bekend merkproduct. Eén keer "biep", ook als je de code langer in beeld houdt. Het scherm toont **… gevonden!** met de productfoto. Tik **In het mandje!**: het product vliegt in het mandje, Karrie springt, "1 product ontdekt!".
- Tik **Zoek de volgende!**: de camera komt terug en de pot die nog in beeld is, springt niet meteen weer op.
- Fotografeer een losse banaan: na het herkennen één "biep" (niet bij de ontspanknop), **Banaan gevonden!** met de tekening. Na **In het mandje!** staat Banaan met de tekening in **Controleren** en in het winkelavontuur.
- Fotografeer de banaan nog eens: **Die hebben we al!**, en de teller gaat niet omhoog.
- Fotografeer iets vaags of onbekends: **Wat is dit?** met **Vraag een ouder**. Dat opent het gewone scherm om zelf in te vullen.
- Verzamel vijf verschillende producten: één keer **Hoera!** met confetti en fanfare. Sluit de app en open hem weer: geen tweede keer.
- Zet het geluid uit en herhaal een scan: geen biep, de rest werkt hetzelfde.
- Zet op de telefoon "Beweging beperken" (iPhone) of "Animaties verwijderen" (Android) aan: er vliegt niets en er is geen confetti, maar alle knoppen werken meteen.
- **Controleren**: aantallen, verwijderen, **Ongedaan maken** en de supermarkt werken als voorheen. **Start avontuur** toont kort **Alles verzameld? Nu gaan we ze zoeken!**; tikken sluit het meteen.
- Tik snel twee keer op **In het mandje!**: het product staat maar één keer op de lijst.

## Bekende beperkingen

- Camera, foto herkennen en bonusmissies zijn niet getest op een echte iPhone of Android-telefoon. Ze zijn getest in een desktopbrowser (met een nagebootste camera en met de galerijknop), met echte productfoto's en echte OpenAI-aanroepen.
- Het model leest kleine tekst soms net verkeerd. Daarom bevestigt de ouder altijd.
- Bij meerdere producten op één foto kiest Karrie het meest zichtbare product.
- Of een product "algemeen" of "specifiek" is, beslist het model. Twijfelt de ouder, dan kan **Gebruik Karrie-tekening** of **Maak foto** in het productvenster het plaatje alsnog wisselen.
- De tekst van een missie komt van het model en kan soms wat stroef Nederlands zijn ("zonder toegevoegd suiker").
- Hoe `X-Forwarded-For` er op Render precies uitziet, is niet gecontroleerd; de per-IP-limieten zijn daarom een extra rem, niet de hoofdbeveiliging.
- OpenAI levert bij de webzoekfunctie geen `image_result` (zie Voorbeeldfoto's). Als dat verandert, leest de code ze automatisch als eerste.
- **Unsplash en Pixabay blokkeren de servers van Render.** Lokaal werken ze; op Render geeft elke pagina een fout (`/api/health` → `images.failures` toonde `unsplash.com:page-unavailable` en `pixabay.com:page-unavailable`). Op Render komen open-licentiefoto's daarom van Wikimedia Commons en Openverse. Merkproducten werken op Render wel (live getest met Hak bruine bonen).
- Openverse kent alleen Engelse zoektermen en geeft soms iets anders dan bedoeld (iPhones bij "apple", augurken bij "cucumber"). De controle met OpenAI-vision gooit het meeste weg, maar niet alles. Openverse is zonder sleutel beperkt tot ongeveer 20 zoekopdrachten per minuut voor de hele server.
- Brave Image Search draait op Render met een echte sleutel (`/api/health` → `images.provider` is `brave`); live getest met drie merkproducten.
- Het lezen van streepjescodes is niet getest op een echte iPhone of Android-telefoon, ook niet hoe snel het is bij weinig licht, op gebogen verpakkingen of hoeveel batterij het kost. Getest zijn de code (unit tests), de opzoekroute met echte Open Food Facts-aanroepen en een galerijfoto in een desktopbrowser.
- Open Food Facts wordt door vrijwilligers gevuld. Nederlandse namen ontbreken soms, het merk is soms de fabrikant ("COCA-COLA SERVICES SA/NV") en niet elk product heeft een foto of Nederlandse ingrediënten. Daarom bevestigt de ouder altijd.
- Webzoeken op een streepjescode vindt kleine of nieuwe producten vaak niet. Dan blijft de foto over.
- Productinformatie is zo goed als de bronpagina: een fout op de pagina (Optimel "Zout 8 g") wordt overgenomen. Winkelpagina's die de server van Render weigeren, leveren niets op (`facts:page-unavailable`).
- Voorbeeldfoto's van merkproducten komen bijna altijd van winkelsites met onbekende rechten. Ze worden alleen op het eigen toestel bewaard en getoond; of dat voor jouw gebruik mag, is aan de eigenaar van de app.
- De zoekresultaten verschillen per keer: hetzelfde product vond de ene keer wel en de andere keer geen foto. **Opnieuw zoeken** helpt soms.
- Het geheugen van de server met open-licentiefoto's is leeg na een herstart of slaapstand; dan wordt opnieuw (betaald) gezocht.
- Thuis verzamelen is alleen in een desktopbrowser getest (met een galerijfoto van een streepjescode), niet op een echte telefoon. Het geluid, de trilfunctie en het herkennen van een echte banaanfoto zijn daar niet nagelopen.
- Aanbiedingen zijn alleen in een desktopbrowser getest (met de echte PrijsProfeet en een lokale server), niet op een echte telefoon.
- De matching is bewust streng: een standaardproduct krijgt alleen **Aanbieding** bij een huismerkproduct met precies die naam. Bij A-merken of extra woorden wordt het hoogstens **Mogelijke aanbieding**, en onbekende woorden ("bananen ontbijtje") betekenen niets. Echte aanbiedingen worden daardoor soms gemist. Geeft PrijsProfeet geen merk bij een product, dan behandelt Karrie het als huismerk.
- PrijsProfeet haalt de acties zelf bij de supermarkten op. Een fout of vertraging daar (een actie die al voorbij is, een verkeerde prijs) neemt Karrie over; daarom staan de einddatum en de link naar de supermarkt erbij.
- De limieten naar PrijsProfeet staan in het geheugen van de server en beginnen opnieuw na een herstart.
- De server controleert adressen op interne IP-nummers, maar zoekt de DNS-naam niet zelf op. Een domein dat naar een intern adres wijst, wordt dus niet herkend; op Render is er geen intern netwerk om te bereiken.
