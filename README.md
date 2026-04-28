# Bankenplakate – Person-Swap mit Nano Banana Pro

Eine schlanke Webapp: Nutzer wählt ein Plakatmotiv, fotografiert sich (Webcam mit Silhouetten-Overlay) oder lädt ein Foto hoch, und Google Gemini 3 Pro Image (alias "Nano Banana Pro") komponiert die Person in das Originalmotiv. Output: hochauflösendes Plakatbild zum Download.

## Lokal starten

```bash
cd webapp
npm install
cp .env.example .env.local         # GEMINI_API_KEY eintragen
npx vercel dev                     # läuft auf http://localhost:3000
```

Beim ersten `vercel dev` fragt das CLI, ob du das Projekt verknüpfen möchtest – einfach annehmen oder neu anlegen.

## Online deployen (Vercel)

```bash
npm i -g vercel
vercel login
vercel link
vercel env add GEMINI_API_KEY      # Wert eingeben
vercel --prod
```

## Wie es funktioniert

1. **Motiv wählen** – die zwei vorhandenen Bank-Motive (Mann/Frau im Schafsfeld) liegen in `public/motifs/`. Ein eigenes Motiv lässt sich hochladen.
2. **Person erfassen** – entweder Webcam mit halbtransparentem Overlay des Originalmotivs (Hilfsschablone für die Pose) oder Datei-Upload.
3. **Modus** – *Nur Gesicht/Identität* (Anzug, Pose, Hintergrund bleiben original; nur das Gesicht wechselt) oder *Komplette Person* (Person ersetzt komplett, Outfit kommt vom Userfoto).
4. **Generieren** – Frontend schickt beide Bilder als Base64 an `/api/generate`. Die Function ruft `gemini-3-pro-image-preview` mit Multi-Image-Input und 4K/3:4-Output auf und liefert das fertige PNG zurück.

## Modell-Hinweise

- Modell-ID: `gemini-3-pro-image-preview`
- Aspect-Ratio: `3:4` (Portrait, passend zu Plakat-Hochformat)
- Auflösung: `4K` (für Druck reicht das in den meisten Fällen für A2; für A1/A0 ggf. nachskalieren oder upscalen)
- Multi-Image: bis zu 14 Referenzbilder, hier werden zwei genutzt

## Anpassungen

- **Prompts:** in `api/generate.js` unter `PROMPTS` editierbar.
- **Aspect-Ratio/Resolution:** ebenfalls in `api/generate.js` (`imageConfig`).
- **Eigene Motive:** PNG/JPG in `public/motifs/` ablegen und in `index.html` im Array `DEFAULT_MOTIFS` ergänzen.

## Bekannte Grenzen

- Webcam-Overlay zeigt das gesamte Originalbild semi-transparent – die Person muss sich selbst grob am sichtbaren Vorbild orientieren. Eine echte Silhouetten-Extraktion ließe sich später per `@mediapipe/selfie_segmentation` ergänzen.
- Druckauflösung 4K (≈ 4096 px Längsseite) reicht für A3/A2 Plakat sauber; für A1+ Upscaler empfehlen.
