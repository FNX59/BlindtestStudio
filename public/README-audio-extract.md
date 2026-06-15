# Service local de téléchargement des extraits

Ce service sert à préparer les extraits avant le lancement de la présentation dans `BlindTest_Studio.html`.

Il télécharge l'audio avec `yt-dlp`, découpe l'extrait avec `ffmpeg`, puis renvoie un MP3 encodé en `data:audio/mpeg;base64,...` pour que la présentation et l'export HTML restent autonomes.

Si le lien YouTube fourni par l'IA est incomplet ou inutilisable, le service utilise automatiquement une recherche `ytsearch1:artiste titre`.

## Prérequis

- Node.js 20 ou plus
- `yt-dlp`
- `ffmpeg`

Les binaires peuvent être indiqués avec des variables d'environnement :

```powershell
$env:YTDLP_BIN = "yt-dlp"
$env:FFMPEG_BIN = "ffmpeg"
node audio-extract-server.js
```

Par défaut, le service écoute sur :

```text
http://localhost:3478/api/extract
```

La page HTML utilise cette URL automatiquement. Pour changer l'adresse côté navigateur :

```js
localStorage.setItem('blindtestAudioExtractApi', 'http://localhost:3478/api/extract')
```

Les fichiers temporaires et le cache sont stockés par défaut dans `../audio-cache-local/`, à la racine du projet.

Le service ajoute automatiquement `--js-runtimes node:<node.exe>` à `yt-dlp`, ce qui évite les erreurs récentes de YouTube liées au runtime JavaScript manquant.
