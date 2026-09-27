# Suno Video Compiler — Contexte pour Claude Code

## Ce que fait ce projet

Pipeline Node.js qui produit des vidéos YouTube longues (45 min – 1h20) type "ambient focus music" à partir de :
- pistes audio générées avec Suno (dans `projets/<nom>/audio/`)
- une image fixe `background.jpg` (dans `projets/<nom>/`, sert de vignette ET de vidéo)

Le rendu final est une image fixe plein écran + audio normalisé avec crossfades.

## Utilisateur

- **Windows** avec RTX 3080 (encodage GPU via NVENC)
- Publie 1-2 vidéos/semaine sur YouTube
- Préfère les explications concrètes et le "je code, puis tu testes"
- Communique parfois par transcription vocale (phrases longues, hésitations)
- Chemin projet : `C:\Lucas\YouTube\suno-video-compiler`

## Architecture (pipeline en 5 étapes)

```
audio Suno + background.jpg
    ↓ [01-normalize.js]  loudnorm 2 passes → -14 LUFS
    ↓ [02-playlist.js]   fondus enchaînés, ordre remélangé par passage
    ↓ [03-nowplaying.js] vérifie la présence du background
    ↓ [04-assemble.js]   image fixe + audio → MP4 (NVENC ou libx264)
    ↓ [05-metadata.js]   description, chapitres, miniature
    ↓ [06-upload.js]     upload YouTube en PRIVÉ (validation humaine obligatoire)
```

## Décisions figées (ne pas remettre en question)

- **Confidentialité upload** : toujours "private", jamais "public" (validation humaine)
- **Image fixe** : le background.jpg sert de vignette YouTube ET de vidéo entière (pas d'overlay, pas de timeline)
- **Codec** : `nvenc` (NVIDIA) avec auto-détection, fallback `libx264` sur Mac/sans GPU
- **Pas d'overlay** : ni barre de progression, ni citations, ni timecode dans la vidéo (retiré pour simplifier)
- **Aucun visualiseur audio-réactif** (abandonné pour rester simple et rapide)

## Réglages actuels du user (config.json / projet.json)

```json
{
  "audio": { "lufs": -14, "crossfadeSeconds": 3, "bitrate": "320k" },
  "video": { "fps": 30, "crf": 20, "codec": "nvenc", "preset": "ultrafast" }
}
```

## Commandes utiles

```powershell
# Compilation d'un projet (mode complet)
node index.js --projet <nom>

# Test rapide 30s (à toujours faire avant un run complet)
node index.js --projet <nom> --test 30

# Batch tous les projets prêts
node index.js --tous

# Compil + upload YouTube (privé)
node index.js --projet <nom> --upload

# Vider le cache (fonds pré-générés, normalisations)
node index.js --vider-cache

# Test de coloration : vérifier la sortie loudness
ffmpeg -i projets/<nom>/output/<nom>.mp4 -af ebur128 -f null - 2>&1 | tail -6
```

## Pièges connus & résolus

- **`-loop 1 -i img.jpg` sans `-framerate`** → produit un stream à FPS variable, vidéo tronquée. Toujours mettre `-framerate 30` avant l’input.
- **Chapitres YouTube** : minimum 3, premier à 0:00, min 10s d’espacement, format `MM:SS` sous 1h, `H:MM:SS` au-delà. Sinon YouTube les ignore silencieusement.

## Structure fichiers projet

```
suno-video-compiler/
├── index.js
├── config.json           # réglages globaux (surchargés par projet.json)
├── lancer-video.bat      # menu interactif Windows
├── demarrer-app.bat      # lanceur Electron Windows
├── demarrer-app.command  # lanceur Electron macOS
├── src/
│   ├── config.js
│   ├── utils.js
│   ├── 01-normalize.js
│   ├── 02-playlist.js
│   ├── 03-nowplaying.js
│   ├── 04-assemble.js
│   ├── 05-metadata.js
│   └── 06-upload.js
├── projets/
│   └── <nom>/
│       ├── audio/        # .wav ou .mp3
│       ├── background.jpg # image fixe = vignette + vidéo
│       ├── projet.json   # overrides pour ce projet
│       └── output/       # vidéo générée + description + miniature
└── .cache/               # normalisations
```

## Prochaines étapes envisagées

- **Interface Electron** (après stabilisation) : centraliser le workflow. Objectifs : drop d'audio + background, édition inline des titres/timing, sélection de la durée cible, cases à cocher pour les options.

## Branding — LucidityFM

### Channel identity
- **Name**: LucidityFM
- **Niche**: Ambient music for deep work — not bland or tasteless, designed to accompany the brain
- **Format**: 45 min to 1h20 sessions, 2 videos/week
- **Music source**: Keep vague (AI-generated via Suno, but never stated publicly)

### Audience
- Entrepreneurs, developers, programmers, remote workers, freelancers
- **Pain points to hit**: procrastination, attention loss, lack of focus, loneliness of solo work
- People who know they should be working but keep scrolling instead

### Tone & voice
- **Direct, confrontational, like a coach who talks tough because it works**
- Not motivational-poster fluff — raw, slightly abrasive, honest
- Speaks TO the viewer, not AT them ("You keep telling yourself you'll start in 5 minutes. You won't.")
- Underlying message: I'm pushing you because I know you can do it

### Style rules for titles, descriptions, thumbnails
- English only
- Short, punchy titles — hit a nerve, not a keyword
- Minimalist thumbnails — no clutter, no clickbait faces
- No begging for likes/subs — the work speaks for itself
- Citations/quotes in videos: focus, discipline, solitude, deep work themes

### Channel description
> Your brain wasn't built for notifications. It was built for this.
>
> Long-form ambient music designed to shut the noise out and let the work in. No lyrics. No distractions. Just sound that gets out of your way while your brain does what it's supposed to do.
>
> You keep telling yourself you'll "start in 5 minutes." You won't. You'll scroll, you'll snack, you'll reorganize your desktop for the third time today. Meanwhile the deadline hasn't moved and neither have you.
>
> Hit play. Lock in. That's it.
>
> New sessions drop twice a week — 45 min to 1h+ of uninterrupted focus fuel for the ones who actually want to get something done today.

## Style de collaboration attendu

- **Édits ciblés** (str_replace) plutôt que réécritures complètes
- **Tester avant de livrer** : lancer `node index.js --projet test --test 30` après chaque modif
- **Toujours honnête** sur ce qui marche / ne marche pas, éviter le "ça devrait marcher"
- **Économie tokens** : si une info est déjà dans ce fichier, ne pas la re-explorer
