# Factory OS 2.0 — Welt-Asset- & Ambiente-Katalog

Master-Liste für den **Showroom** und die **Living-World-Spec**. Alles code-baubar im Primitiv-Stil
(chamferedBox + Kegel/Kugel/Zylinder/Low-Poly-Fels), **Flat-Shading**, palettengetrieben, Instancing
für Masse. Look-Richtung: **stilisiertes Low-Poly / Spielzeug-Diorama**.

Konventionen: `[ ]` offen · `[x]` designt & von Bastian abgenommen · `[~]` gebaut, wartet auf Feedback.

Entscheidungen: Fluids **ja** · Tag/Nacht **ja** · Extraktoren **pro Ressource leicht unterschiedlich**
· Strom/Energie **zurückgestellt** (notiert, atm nicht drin).

---

## Terrain & Böden
- [ ] Wiese (Plains)
- [ ] Waldboden
- [ ] Sand (Wüste)
- [ ] Fels (Berge)
- [ ] See (innen, swim-gated)
- [ ] Ozean (Grenze, unpassierbar)
- [ ] Strand
- [ ] Stadt-Boden (gepflastert)
- [ ] Klippen-/Kanten-Tile (optional, Höhe lesbar)

## Natürliche Deko (nicht-interaktiv)
- [ ] Wiese: Grasbüschel
- [ ] Wiese: Blumen
- [ ] Wiese: Busch
- [ ] Wiese: Stein
- [ ] Wald: Baum (Nadel)
- [ ] Wald: Baum (Laub)
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
- [ ] Wiese: Cultivation-Feld (bestehend)
- [ ] Wiese: Eisen-Vorkommen
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
- [ ] Smelter (bestehend)
- [ ] Assembler (bestehend)
- [ ] Foundry (bestehend)
- [ ] Seeder (bestehend)
- [ ] Refinery / Press (bestehend, evtl. konsolidiert)
- [ ] Glas-/Silizium-Ofen (neu)
- [ ] Constructor (neu)
- [ ] Fluid-Verarbeiter (neu)

## Gebäude — Kern
- [ ] Hub / Abgabe-Zentrum (Meilensteine, evtl. in der Stadt)
- [ ] Storage / Kiste

## Logistik
- [ ] Belt: gerade
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
- [ ] Haupt-Roboter (bestehend; + Scheinwerfer nachts, Bau-Animation, sichtbare Fracht)
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

## Erster Keystone-Slice (im Showroom, wartet auf Feedback)
Wiesen-Ecke als Look-Test: Wiesen-Boden, Baum (Nadel + Laub), Fels, Grasbüschel, Wasserkante,
ein Gebäude (Smelter, Kontrast Fabrik↔Natur), Roboter, Licht + Tag/Nacht-Umschalter.
Ziel: **den Look sperren, bevor die Liste in Masse gebaut wird.**
