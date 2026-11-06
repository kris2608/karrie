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
5. Bevestig het blueprint. De app staat op `https://karrieapp.onrender.com`, de server op `https://karrie-api.onrender.com`.
6. Elke push naar de gekoppelde branch publiceert beide services opnieuw. Deploy na een wijziging aan `server/src/schema.ts` altijd ook de server: de app verwacht de velden van het nieuwe schema.

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
- Op Android trilt de telefoon kort bij **Gevonden!** en bij lang drukken. Safari op iPhone ondersteunt trillen niet.
- Vernieuw de pagina op `/winkel`. Hetzelfde lijstje staat er nog.
- Maak een nieuw lijstje en tik op **Bewaren**. Het beginscherm meldt **Lijstje bewaard** en toont **Verder met lijstje** en een kaart **Bewaard**.
- Plak een korte lijst, controleer hem en start het avontuur.
- **Lang drukken** (ruim een halve seconde) op een product bij **Toevoegen** of **Controleren** haalt het van de lijst. **Ongedaan maken** staat daarna even in beeld. Een korte tik voegt nog steeds toe, en scrollen met de vinger erop verwijdert niets.
- Geluid staat standaard uit. Zet het aan via het tandwiel op het beginscherm en hoor een plopje bij **Gevonden!**.
- Zet het toestel daarna in vliegtuigmodus en open het beginscherm-icoon opnieuw. De winkelmodus werkt nog.
- De eerste keer openen heeft internet nodig, zodat de app en de service worker binnenkomen.
- Zie je na een nieuwe deploy nog de oude versie? Sluit de app helemaal en open hem opnieuw. De service worker werkt zichzelf bij.

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
| `ALLOWED_ORIGINS` | `https://karrieapp.onrender.com` | Komma-lijst van toegestane app-adressen |
| `LIMIT_PER_IP_HOUR` / `LIMIT_PER_IP_DAY` | 20 / 60 | Per IP-adres |
| `LIMIT_DAILY_REQUESTS` | 300 | Alle gebruikers samen, per UTC-dag |
| `DAILY_BUDGET_USD` | 1 | Server stopt met herkennen boven dit bedrag per dag |

Krijgt de server van Render een ander adres dan `https://karrie-api.onrender.com`? Zet dat adres dan in `VITE_API_ORIGIN` van `karrieapp` en bouw de site opnieuw.

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

**Wat Karrie wel en niet doet**

- Alleen de streepjescodelezer van de telefoon levert een EAN op. Cijfers die het model op de foto leest, worden nooit als echte EAN opgeslagen; ze blijven hoogstens een onbevestigde aanwijzing en tellen nergens voor.
- Een product hoort alleen bij een catalogussoort als het precies die soort is. Chocopasta wordt geen jam, havermelk geen melk.
- Merk of inhoud die het model alleen gokt, worden niet overgenomen. In het resultaat staat **gelezen op de verpakking** of **geschat**.

## Streepjescode in de camera

Het camerascherm zegt **Scan een streepjescode of maak een foto.** Er is geen apart scanscherm: dezelfde camera leest streepjescodes terwijl de ontspanknop gewoon werkt.

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

- Open en gratis, zonder sleutel. Karrie vraagt het via de server op (`/api/v3/product/{ean}`, Nederlandse namen voorop) met een eigen User-Agent (`OFF_USER_AGENT`, standaard `Karrie/1.0 (https://karrieapp.onrender.com)`), zoals Open Food Facts vraagt.
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
| `OFF_USER_AGENT` | `Karrie/1.0 (https://karrieapp.onrender.com)` | Naam en contactadres voor Open Food Facts |
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

Een product dat van een foto is herkend en een merk heeft, of dat niet in de catalogus staat, onthoudt Karrie op dit toestel als **Mijn producten**: naam, merk, afdeling, foto en eventuele bonusmissie. In **Toevoegen** staat het met een hartje onder zijn eigen afdeling, onder **Alles** en in de zoekresultaten. Tikken zet het op de lijst (of telt er één bij). Lang drukken haalt het van de lijst en vergeet het, met **Ongedaan maken**. Een herkende AH Terra pindakaas telt op zijn eigen tegel, niet ook op de tegel Pindakaas. Karrie onthoudt hoogstens 120 producten.

## Kosten (gemeten met `gpt-5.4-mini`, november 2026)

Prijs: $0,75 per miljoen invoertokens, $4,50 per miljoen uitvoertokens. Het schema met de bonusmissie maakt elke aanvraag wat groter dan voorheen.

Gemeten op echte productfoto's (pindakaas voor- en achterkant, chocopasta, frisdrank, vleesvervanger, yoghurt, brood): ongeveer 3.500 invoertokens en 200 tot 300 uitvoertokens per foto.

Reken op ongeveer $0,004 per foto: 100 foto's per maand kosten zo'n $0,40. Het dagbudget van $1 is genoeg voor ongeveer 250 foto's, dus dat grijpt nu eerder in dan de daglimiet van 300 aanvragen. Een herkenning duurt ongeveer 3 seconden als de server wakker is.

**Voorbeeldfoto's** kosten per nieuw product ongeveer $0,017: $0,01 voor de webzoekaanroep plus zo'n 9.000 invoertokens (zoekresultaten en kleine versies van de foto's). Een merkproduct kost met productinformatie ongeveer $0,021; met Brave in plaats van OpenAI-webzoeken naar verwachting ongeveer $0,016 ($0,005 voor Brave, zonder de webzoekaanroep van $0,01; nog niet gemeten). Een product dat al bekend is, kost niets. Een gezin dat 50 verschillende producten gebruikt, kost dus eenmalig ongeveer $0,85. Een open-licentiefoto die de server al kent, is voor andere gezinnen gratis. Voorbeeldfoto's hebben een eigen dagbudget (`IMAGE_DAILY_BUDGET_USD`, standaard $1, ongeveer 60 nieuwe producten per dag). `/api/health` toont onder `images` het aantal zoekopdrachten en de kosten van vandaag.

**Streepjescodes**: Open Food Facts kost niets. Alleen een code die Open Food Facts niet kent, kost geld: één OpenAI-webzoekaanroep ($0,01) plus de tokens van de zoekresultaten, gemeten op Render $0,014 per onbekende code (ongeveer 8.500 invoertokens, de helft uit de cache, en 5 seconden). Een onbekende code wordt hoogstens één keer per 7 dagen gezocht, zolang de server wakker blijft. Met het dagbudget van $0,50 zijn dat ongeveer 35 onbekende codes per dag. Een bekende code bij Open Food Facts duurde op Render 0,4 tot 0,6 seconde; uit het geheugen van de server 0,2 seconde. Een code uit **Mijn producten** of uit het geheugen van het toestel gaat niet eens naar de server.

## Limieten en misbruik

- De server accepteert alleen JPEG, PNG of WebP als data-URL, controleert de bestandskop en weigert aanvragen boven 2 MB (`413`).
- Alleen aanvragen vanaf `ALLOWED_ORIGINS` worden geaccepteerd. Per IP-adres loopt er hoogstens één herkenning tegelijk.
- De app staat per toestel 25 herkenningen per dag toe.
- Voorbeeldfoto's: per toestel 40 zoekopdrachten per dag; op de server per IP 30 per uur en 80 per dag (`IMAGE_LIMIT_PER_IP_HOUR`, `IMAGE_LIMIT_PER_IP_DAY`), 200 per dag in totaal (`IMAGE_LIMIT_DAILY_REQUESTS`) en hoogstens 3 tegelijk (`IMAGE_MAX_CONCURRENT`, daarboven `503`). Antwoorden uit het geheugen van de server tellen niet mee. Optioneel: `OPENAI_IMAGE_SEARCH_MODEL` (standaard het herkenningsmodel) en `BRAVE_SEARCH_API_KEY` (zet Brave aan voor merkproducten; standaardproducten blijven via OpenAI-webzoeken en Openverse gaan). `IMAGE_OPENVERSE=off` zet Openverse uit.
- Streepjescodes: op de server per IP 60 per uur en 200 per dag, 1000 per dag in totaal (zie **Streepjescode in de camera**). Antwoorden uit het geheugen tellen niet mee. Per toestel loopt er hoogstens één opzoeking per code tegelijk.
- De tellers op de server staan in het geheugen. Ze beginnen opnieuw na een herstart of slaapstand, en per-IP-limieten zijn te omzeilen door een ander IP-adres. **Stel daarom ook een maandlimiet in bij OpenAI** (platform.openai.com → Settings → Limits). Dat is de harde grens.

## Checklist camera en bonusmissies (op een echte telefoon)

Dit is nog niet op een echte iPhone of Android-telefoon getest. Loop deze lijst daarom op beide toestellen na en noteer toestel, versie en of de camera direct opende.

- **Toevoegen**: tik op de camera naast het zoekveld. De telefoon vraagt één keer om camera-toegang. Het camerascherm toont live beeld van de achtercamera, niet de galerij.
- Richt op een pot pindakaas en tik op de ontspanknop. Na ongeveer 3 seconden zie je **Herkend!** met naam, merk en afdeling. Er is geen bijsnijdstap.
- Tik op **Toevoegen aan lijst**. Het product staat met jouw foto op de lijst, niet met een tekening. Binnen ongeveer 10 seconden kan die foto vervangen worden door een voorbeeldfoto; in het productvenster zie je welke en waarvandaan, en vaak ook **Productinformatie** (Nutri-Score, voedingswaarden, bron).
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
- De server controleert adressen op interne IP-nummers, maar zoekt de DNS-naam niet zelf op. Een domein dat naar een intern adres wijst, wordt dus niet herkend; op Render is er geen intern netwerk om te bereiken.
