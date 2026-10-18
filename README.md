# Typewriter Neon Dark

Eine kleine Firefox-/Zen-Erweiterung, die auf allen Seiten von
`at4.typewriter.at` ein schwarzes Design mit roten Neon-Akzenten anwendet,
einschliesslich der Lektionen und der virtuellen Tastatur. Die Startseite wurde
anhand der tatsächlichen Seitenstruktur angepasst; Abzeichenbilder selbst
werden nicht umgefärbt. Die Navigationsbuttons, die Statusfarben der Lektion
und die Google-Privacy-Leiste erhalten ebenfalls passende Neon-Dark-Farben.
Leistungstabellen und ihre Reiter sind dunkel gestaltet; Abzeichen und
Ergebnis-Icons bleiben unverändert.
Bereiche mit Klassen oder IDs wie `medal`, `achievement`, `reward`, `award`
oder `badge` werden von den Komponenten-Regeln ausgenommen, damit ihre
Medaillen und Erfolgsdarstellungen moeglichst unveraendert bleiben.

## In Zen Browser temporaer laden

1. Diesen Ordner an einem festen Ort speichern.
2. In Zen `about:debugging#/runtime/this-firefox` oeffnen.
3. **This Firefox** / **Dieser Firefox** auswaehlen und **Load Temporary Add-on…**
   / **Temporäres Add-on laden…** anklicken.
4. Die Datei `manifest.json` in diesem Ordner auswaehlen.
5. Eine Typewriter-Seite oder Lektion neu laden.

Das Add-on bleibt bis zum Beenden des Browsers aktiv. Nach einem Neustart muss
es erneut ueber `about:debugging` geladen werden.
