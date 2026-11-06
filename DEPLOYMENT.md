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

Er is geen barcodescanner meer en Karrie gebruikt Open Food Facts niet meer. Oude lijstjes met gescande producten blijven werken; hun foto's en de vermelding **Gegevens: Open Food Facts (ODbL)** blijven staan.

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

- Een barcode die op de foto leesbaar is, wordt nooit als echte EAN opgeslagen. Hij blijft hoogstens een onbevestigde aanwijzing en telt nergens voor.
- Een product hoort alleen bij een catalogussoort als het precies die soort is. Chocopasta wordt geen jam, havermelk geen melk.
- Merk of inhoud die het model alleen gokt, worden niet overgenomen. In het resultaat staat **gelezen op de verpakking** of **geschat**.

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

Karrie zoekt bij elk product op de lijst een echte foto, en ook bij de producten waar een bonusmissie naar wijst. Dat gebeurt op de achtergrond; het toevoegen wacht er nooit op. Alleen de productnaam (en bij een herkende verpakking merk, variant en inhoud) gaat naar de server, nooit een foto.

**Waarom niet de beeldzoekfunctie van OpenAI.** Die is eerst los getest (`server/scripts/diagnose-image-search.mjs`) met de gedocumenteerde instellingen (`search_content_types: ["image","text"]`, `image_settings`, `include: ["web_search_call.results"]`, verplichte zoekaanroep) op vijf producten en twee modellen. Uitkomst: **0 van 10 aanvragen gaf een `image_result`**, zonder foutmelding, terwijl de server de instellingen wel terugmeldde. Elke aanvraag duurde 13 tot 20 seconden en kostte $0,03 tot $0,04. Daarom gebruikt Karrie de webzoekfunctie alleen om productpagina's te vinden. De server haalt de foto zelf van die pagina's: van Wikimedia Commons via de Commons-API (met licentie), van Unsplash en Pixabay, en anders de `og:image` van de pagina.

**Hoe een foto gekozen wordt.** Elke foto wordt gedownload en gecontroleerd: alleen HTTPS, geen interne adressen (ook niet via een doorverwijzing), echte JPEG, PNG of WebP en hoogstens 4 MB. Daarna vergelijkt OpenAI-vision de foto's met het product: soort, merk, variant, inhoud, vooraanzicht, scherpte, het hele product zoals in de winkel (geen plakje, geen close-up), en bij een algemeen product geen merk in beeld. Een ander merk, een andere variant of inhoud, of een persoon in beeld valt af. Een vergelijkbaar product wordt nooit gebruikt als het exacte product.

**Gebruiksrechten.**
- *Open licentie* (CC0, publiek domein, CC BY / BY-SA, Unsplash, Pixabay): de foto wordt automatisch gebruikt, met naam van de maker en licentie in het productvenster. De server onthoudt hem 30 dagen voor alle gebruikers.
- *Rechten onbekend* (winkels en merksites): past de foto precies, dan gebruikt Karrie hem automatisch, maar **alleen op dit toestel** als persoonlijk voorbeeld, met een link naar de bron. De server bewaart zo'n foto niet en geeft hem nooit aan een ander gezin. Dit is een bewuste keuze van de eigenaar van de app.
- Twijfelt de controle, dan staan de gevonden foto's in het productvenster en kiest de ouder er een, of niet.

**Wat het kind ziet.** De keuze van de ouder gaat voor. Anders: voorbeeldfoto, dan de eigen foto, dan de Karrie-tekening. In het productvenster (alleen voor ouders) staat **Je kind ziet** met *Voorbeeldfoto*, *Eigen foto* en *Tekening*, de gevonden foto's om uit te kiezen, de bron, **Opnieuw zoeken** en **Geen voorbeeldfoto**. Het hele zoeken staat aan of uit bij **Voor ouders → Voorbeeldfoto's**.

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

Een eerdere ronde liet zien waarom de controle op "het hele product" nodig is: zonder die controle koos Karrie een plakje komkommer, een gepelde banaan en een eierdoos met merk.

**Andere zoekdiensten** (niet actief). De code heeft een adapter voor **Brave Image Search** (`BRAVE_SEARCH_API_KEY`): $5 per 1.000 zoekopdrachten met vooraf betaald tegoed; resultaten bewaren mag alleen met een abonnement met opslagrechten. **SerpApi** (Google Images): 250 zoekopdrachten per maand gratis, $25 per maand voor 1.000. Geen van beide is aangezet.

## Mijn producten

Een product dat van een foto is herkend en een merk heeft, of dat niet in de catalogus staat, onthoudt Karrie op dit toestel als **Mijn producten**: naam, merk, afdeling, foto en eventuele bonusmissie. In **Toevoegen** staat het met een hartje onder zijn eigen afdeling, onder **Alles** en in de zoekresultaten. Tikken zet het op de lijst (of telt er één bij). Lang drukken haalt het van de lijst en vergeet het, met **Ongedaan maken**. Een herkende AH Terra pindakaas telt op zijn eigen tegel, niet ook op de tegel Pindakaas. Karrie onthoudt hoogstens 120 producten.

## Kosten (gemeten met `gpt-5.4-mini`, november 2026)

Prijs: $0,75 per miljoen invoertokens, $4,50 per miljoen uitvoertokens. Het schema met de bonusmissie maakt elke aanvraag wat groter dan voorheen.

Gemeten op echte productfoto's (pindakaas voor- en achterkant, chocopasta, frisdrank, vleesvervanger, yoghurt, brood): ongeveer 3.500 invoertokens en 200 tot 300 uitvoertokens per foto.

Reken op ongeveer $0,004 per foto: 100 foto's per maand kosten zo'n $0,40. Het dagbudget van $1 is genoeg voor ongeveer 250 foto's, dus dat grijpt nu eerder in dan de daglimiet van 300 aanvragen. Een herkenning duurt ongeveer 3 seconden als de server wakker is.

**Voorbeeldfoto's** kosten per nieuw product ongeveer $0,017: $0,01 voor de webzoekaanroep plus zo'n 9.000 invoertokens (zoekresultaten en kleine versies van de foto's). Een product dat al bekend is, kost niets. Een gezin dat 50 verschillende producten gebruikt, kost dus eenmalig ongeveer $0,85. Een open-licentiefoto die de server al kent, is voor andere gezinnen gratis. Voorbeeldfoto's hebben een eigen dagbudget (`IMAGE_DAILY_BUDGET_USD`, standaard $1, ongeveer 60 nieuwe producten per dag). `/api/health` toont onder `images` het aantal zoekopdrachten en de kosten van vandaag.

## Limieten en misbruik

- De server accepteert alleen JPEG, PNG of WebP als data-URL, controleert de bestandskop en weigert aanvragen boven 2 MB (`413`).
- Alleen aanvragen vanaf `ALLOWED_ORIGINS` worden geaccepteerd. Per IP-adres loopt er hoogstens één herkenning tegelijk.
- De app staat per toestel 25 herkenningen per dag toe.
- Voorbeeldfoto's: per toestel 40 zoekopdrachten per dag; op de server per IP 30 per uur en 80 per dag (`IMAGE_LIMIT_PER_IP_HOUR`, `IMAGE_LIMIT_PER_IP_DAY`), 200 per dag in totaal (`IMAGE_LIMIT_DAILY_REQUESTS`) en hoogstens 3 tegelijk (`IMAGE_MAX_CONCURRENT`, daarboven `503`). Antwoorden uit het geheugen van de server tellen niet mee. Optioneel: `OPENAI_IMAGE_SEARCH_MODEL` (standaard het herkenningsmodel) en `BRAVE_SEARCH_API_KEY` (zet Brave aan in plaats van OpenAI-webzoeken).
- De tellers op de server staan in het geheugen. Ze beginnen opnieuw na een herstart of slaapstand, en per-IP-limieten zijn te omzeilen door een ander IP-adres. **Stel daarom ook een maandlimiet in bij OpenAI** (platform.openai.com → Settings → Limits). Dat is de harde grens.

## Checklist camera en bonusmissies (op een echte telefoon)

Dit is nog niet op een echte iPhone of Android-telefoon getest. Loop deze lijst daarom op beide toestellen na en noteer toestel, versie en of de camera direct opende.

- **Toevoegen**: tik op de camera naast het zoekveld. De telefoon vraagt één keer om camera-toegang. Het camerascherm toont live beeld van de achtercamera, niet de galerij.
- Richt op een pot pindakaas en tik op de ontspanknop. Na ongeveer 3 seconden zie je **Herkend!** met naam, merk en afdeling. Er is geen bijsnijdstap.
- Tik op **Toevoegen aan lijst**. Het product staat met jouw foto op de lijst, niet met een tekening. Binnen ongeveer 10 seconden kan die foto vervangen worden door een voorbeeldfoto; in het productvenster zie je welke en waarvandaan.
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

## Bekende beperkingen

- Camera, foto herkennen en bonusmissies zijn niet getest op een echte iPhone of Android-telefoon. Ze zijn getest in een desktopbrowser (met een nagebootste camera en met de galerijknop), met echte productfoto's en echte OpenAI-aanroepen.
- Het model leest kleine tekst soms net verkeerd. Daarom bevestigt de ouder altijd.
- Bij meerdere producten op één foto kiest Karrie het meest zichtbare product.
- Of een product "algemeen" of "specifiek" is, beslist het model. Twijfelt de ouder, dan kan **Gebruik Karrie-tekening** of **Maak foto** in het productvenster het plaatje alsnog wisselen.
- De tekst van een missie komt van het model en kan soms wat stroef Nederlands zijn ("zonder toegevoegd suiker").
- Hoe `X-Forwarded-For` er op Render precies uitziet, is niet gecontroleerd; de per-IP-limieten zijn daarom een extra rem, niet de hoofdbeveiliging.
- OpenAI levert bij de webzoekfunctie geen `image_result` (zie Voorbeeldfoto's). Als dat verandert, leest de code ze automatisch als eerste.
- Voorbeeldfoto's van merkproducten komen bijna altijd van winkelsites met onbekende rechten. Ze worden alleen op het eigen toestel bewaard en getoond; of dat voor jouw gebruik mag, is aan de eigenaar van de app.
- De zoekresultaten verschillen per keer: hetzelfde product vond de ene keer wel en de andere keer geen foto. **Opnieuw zoeken** helpt soms.
- Het geheugen van de server met open-licentiefoto's is leeg na een herstart of slaapstand; dan wordt opnieuw (betaald) gezocht.
- De server controleert adressen op interne IP-nummers, maar zoekt de DNS-naam niet zelf op. Een domein dat naar een intern adres wijst, wordt dus niet herkend; op Render is er geen intern netwerk om te bereiken.
