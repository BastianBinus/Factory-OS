# Factory OS 2.0 — Welt-Asset- & Ambiente-Katalog

Master-Liste für den **Showroom** und die **Living-World-Spec**. Alles code-baubar im Primitiv-Stil
(chamferedBox + Kegel/Kugel/Zylinder/Low-Poly-Fels), **Flat-Shading**, palettengetrieben, Instancing
für Masse. Look-Richtung: **stilisiertes Low-Poly / Spielzeug-Diorama**.

Konventionen: `[ ]` offen · `[x]` designt & von Bastian abgenommen · `[~]` gebaut, wartet auf Feedback.

Entscheidungen: Fluids **ja** · Tag/Nacht **ja** · Extraktoren **pro Ressource leicht unterschiedlich**
· Strom/Energie **zurückgestellt** (notiert, atm nicht drin).

---

## Bau-Plan (Wellen)

Reihenfolge-Prinzip: **erst die schöne Welt Biom für Biom** (jede Welle im Showroom abnehmbar), dann
die **Fabrik-Systeme** (Gebäude/Logistik), dann **Einheiten**, zuletzt der **Ambiente-/Polish-Layer**.
„Anzahl" = *neue* Assets in dieser Welle (schon gebaute zählen nicht mit). Jede Welle: bauen →
Showroom-Preview → Abnahme → nächste.

| Welle | Fokus | Enthält | Anzahl neu | Wann / hängt ab von |
|------:|-------|---------|-----------:|---------------------|
| **0** | Keystone (Plains+Wald-Look) | Böden, Natur-Props, Komposit-Tiles, Bestandsmaschinen, Belt/Wand/Roboter | ~24 | **fertig** (Showroom) |
| **1** | Plains fertig | Eisen-Vorkommen + Cultivation-Feld mit Zuständen, mehr Gras/Blumen-Varianten | ~5 | jetzt — direkt nach Abnahme Welle 0 |
| **2** | Wald-Biom | Waldboden, Baumstumpf, Pilz/Farn, erntbarer Holz-Baum (Zustände), Baum-Var. 3 | ~6 | nach 1 |
| **3** | Wüsten-Biom | Kaktus, toter Busch, Düne, Felsbrocken, Sand-/Silizium-Knoten | ~5 | nach 2 |
| **4** | Berg-Biom | Felsblöcke, Felsnadel, Schneekappe, Erz-/Kohle-/Stein-Ader | ~5 | nach 3 |
| **5** | See & Strand | See-/Ozean-/Strand-Boden, Seerose, Schilf, Stein-im-Wasser, Muschel, Treibholz, Palme, Wasser-Quelle | ~10 | nach 4 (Fluids) |
| **6** | Extraktions-Gebäude | Miner, Pumpe, Holzfäller, Sand-/Silizium-Extraktor, Bohrer/Steinbruch | 5 | nach den Biom-Knoten (1–5) · 2.0-Phase B |
| **7** | Produktion + Kern | Glas-/Silizium-Ofen, Constructor, Fluid-Verarbeiter, Hub/Abgabe, Storage/Kiste | 5 | nach 6 · 2.0-Phase B |
| **8** | Logistik | Belt Kurve/Splitter/Merger(/Tunnel), Pipe gerade/Kurve/Kreuzung/Pumpe, Tank, Kühlturm, Brücke | ~12 | nach 7 · 2.0-Phase B |
| **9** | Einheiten | Roboter-Upgrades (Scheinwerfer/Bau-Anim/Fracht), automatisierte Einheit | ~2 | nach 8 · 2.0-Phase D |
| **10** | Stadt & Landmarks | Stadt-Boden, Klippen-Tile, Wasserfall, Absturz-Kapsel, Stadt-Ruine, Riesenbaum/Geysir | ~6 | nach 5 · 2.0-Phase C |
| **11** | Wetter & Partikel | 10 Effekt-Systeme (Wind, Nebel, Regen, Schnee, …) | ~10 | Polish · nach großer Welt (Phase C) |
| **12** | Licht (Tag/Nacht) | God-Rays, Wasserreflexion, Glühwürmchen, Golden Hour, Nacht-Lichtermeer, Bloom | ~7 | Polish · mit/nach 11 |
| **13** | Tierleben | Schmetterlinge, Vögel, Fische, Krabben, Reh/Hase, Echse/Geier, Frosch/Ente, Eule | ~8 | Polish · nach 11 |
| **14** | Kontrast Natur↔Fabrik | Rauchsäulen, Spuren/Trampelpfade, Verschmutzung, Rück-Eroberung, Stümpfe/Setzlinge, See-Spiegelung | ~7 | Polish · nach 8 (Fabrik steht) |

**Summe neu (Wellen 1–14): ~93 Assets/Systeme.** Kernspiel-relevant (Welt + Fabrik + Einheiten,
Wellen 1–9): **~53**. Der Rest (10–14) ist Polish und kann parallel/nachgelagert laufen.

Nächster konkreter Schritt nach Abnahme: **Welle 1**.

---

## Terrain & Böden
- [x] Wiese (Plains) — gebaut
- [~] Waldboden — vorerst Erd-Ton, evtl. eigener Ton (Welle 2)
- [x] Sand (Wüste) — gebaut
- [x] Fels (Berge) — gebaut
- [x] See (innen, swim-gated) — Wasser + Bett gebaut
- [ ] Ozean (Grenze, unpassierbar)
- [ ] Strand
- [ ] Stadt-Boden (gepflastert)
- [ ] Klippen-/Kanten-Tile (optional, Höhe lesbar)

## Natürliche Deko (nicht-interaktiv)
- [x] Wiese: Grasbüschel — gebaut
- [x] Wiese: Blumen — gebaut
- [~] Wiese: Blumenwiese-Tile + Hohes Gras — `createFlowerPatch` / `createTallGrass`, Welle 1
- [x] Wiese: Busch — gebaut
- [x] Wiese: Stein — gebaut
- [x] Wald: Baum (Nadel) — gebaut
- [x] Wald: Baum (Laub) — gebaut
- [ ] Wald: Baumstumpf
- [ ] Wald: Pilz / Farn
- [ ] Wüste: Kaktus
- [ ] Wüste: toter Busch
- [ ] Wüste: Düne / Sandwellen
- [ ] Wüste: Felsbrocken
- [ ] Berge: Felsblöcke
- [ ] Berge: Felsnadel
- [ ] Berge: Schneekappe
- [ ] See: Seerose
- [ ] See: Schilf
- [ ] See: Stein im Wasser
- [ ] Strand: Muschel
- [ ] Strand: Treibholz
- [ ] Strand: Palme

## Ressourcen-Knoten (interaktiv, mit Zuständen: voll / abgebaut / nachwachsend)
- [~] Wiese: Cultivation-Feld — `createFarmPlot` (brach/wachsend/reif), Welle 1
- [~] Wiese: Eisen-Vorkommen — `createIronNode` (voll/abgebaut/nachwachsend), Welle 1
- [ ] Wald: erntbarer Baum (Holz)
- [ ] Wüste: Sand-/Silizium-Knoten
- [ ] Berge: Erz-/Kohle-/Stein-Ader
- [ ] See: Wasser-Quelle (Pump-Stelle)

## Gebäude — Extraktion (pro Ressource leicht unterschiedlich)
- [ ] Miner (Erz)
- [ ] Pumpe (Wasser)
- [ ] Holzfäller (Holz)
- [ ] Sand-/Silizium-Extraktor
- [ ] Bohrer / Steinbruch (Berge)

## Gebäude — Produktion
- [x] Smelter (bestehend)
- [x] Assembler (bestehend)
- [x] Foundry (bestehend)
- [x] Seeder (bestehend)
- [x] Refinery / Press (bestehend, evtl. konsolidiert)
- [ ] Glas-/Silizium-Ofen (neu)
- [ ] Constructor (neu)
- [ ] Fluid-Verarbeiter (neu)

## Gebäude — Kern
- [ ] Hub / Abgabe-Zentrum (Meilensteine, evtl. in der Stadt)
- [ ] Storage / Kiste

## Logistik
- [x] Belt: gerade (bestehend)
- [ ] Belt: Kurve
- [ ] Belt: Splitter
- [ ] Belt: Merger
- [ ] Belt: Tunnel / Untergrund (optional)
- [ ] Pipe: gerade
- [ ] Pipe: Kurve
- [ ] Pipe: Kreuzung
- [ ] Pipe: Pumpe
- [ ] Tank / Puffer
- [ ] Kühlturm (Dampf)
- [ ] Brücke (über Wasser / Gaps)

## Einheiten
- [~] Haupt-Roboter (bestehend; + Scheinwerfer nachts, Bau-Animation, sichtbare Fracht offen)
- [ ] Automatisierte Einheit (andere Silhouette + "was tue ich"-Indikator)

## Wetter & Partikel
- [ ] Sand-Drift über Dünen (Wüste)
- [ ] Blätter im Wind (Wald)
- [ ] Bodennebel früh / in Bergtälern
- [ ] Schaum-Linie am Strand (Wellen-Rhythmus)
- [ ] Regen → Pfützen → Regenbogen
- [ ] Schnee (Berge)
- [ ] Sandsturm (selten)
- [ ] Kohärente Wind-Welle über Gras/Bäume
- [ ] Hitzeflimmern (Wüste / heiße Maschinen)
- [ ] Kräusel-Ringe im flachen Wasser

## Licht (Tag/Nacht)
- [ ] God-Rays durchs Blätterdach
- [ ] Wasserreflexion (Himmel/Bäume auf See/Ozean)
- [ ] Glühwürmchen nachts (See / Waldrand)
- [ ] Golden Hour bei Auf-/Untergang
- [ ] Fabrik als Lichtermeer bei Nacht (Öfen/Belts glühen)
- [ ] Mond / Sterne, evtl. Aurora über den Bergen
- [ ] Bloom auf Emissivem

## Tierleben (fliehen vor Spieler/Robotern; meiden Maschinen-Zonen)
- [ ] Schmetterlinge / Bienen (Wiese)
- [ ] Auffliegende Vögel + Schwarm
- [ ] Fische-Kräuseln (See)
- [ ] Krabben (Strand)
- [ ] Reh / Hase (Wald)
- [ ] Echse / Geier (Wüste)
- [ ] Frosch / Libelle / Ente (See)
- [ ] Eule (nachts)

## Kontrast Natur ↔ Fabrik
- [ ] Rauchsäulen aus Schornsteinen (Smelter/Foundry)
- [ ] Verblassende Fuß-/Reifenspuren (Sand/Schnee)
- [ ] Dauerhafte Trampelpfade wo der Roboter oft läuft
- [ ] Verschmutzungs-Schleier nahe Maschinen (Gras stumpft)
- [ ] Natur erobert bei Abschaltung zurück
- [ ] Baumstümpfe nach Rodung, Setzlinge wachsen nach
- [ ] Spiegelung der Fabrik-Lichter auf dem nächtlichen See

## Landmarks / Narrativ
- [ ] Wasserfall Berge → See (schön + Wasserquelle)
- [ ] Absturz-Kapsel / Wrack am Strand (Startpunkt)
- [ ] Stadt als überwucherte Ruine (Endgame-Hub)
- [ ] Riesenbaum / Geysir (Orientierungspunkt)

---

## Erster Keystone-Slice (im Showroom, abgenommen)
Wiesen-Ecke als Look-Test: Wiesen-Boden, Baum (Nadel + Laub), Fels, Grasbüschel, Wasserkante,
ein Gebäude (Smelter, Kontrast Fabrik↔Natur), Roboter, Licht + Tag/Nacht-Umschalter.
Look **gesperrt** — ab hier wird die Liste in Wellen dazu passend gebaut.
