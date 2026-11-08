# Suno Video Compiler — Contexte pour Claude Code

## Ce que fait ce projet

Pipeline Node.js qui produit des vidéos YouTube longues (45 min – 1h20) type "ambient focus music" à partir de :
- pistes audio générées avec Suno (dans `projets/<nom>/audio/`)
- une image fixe `background.jpg` (dans `projets/<nom>/`, sert de vignette ET de vidéo)

Le rendu final est une image fixe plein écran + audio normalisé avec crossfades.

**Nouveau (nov. 2026) : le MCP Suno est connecté.** La musique peut maintenant être
générée directement via l'outil, sans passer par le site. Répartition des rôles :
- **Claude (cerveau)** : génère la musique (MCP Suno), écrit le SEO (titres, descriptions,
  chapitres), prépare les assets (miniatures).
- **PC du user (muscle)** : encode la vidéo (NVENC) et pousse sur YouTube via l'API.
  La vidéo fait 1-3 Go et vit sur le disque du user — ce n'est pas Claude qui la transporte.

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
    ↓ [03-background.js] vérifie la présence du background
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
- **Musique 100 % instrumentale, JAMAIS de voix** — les voix cassent le focus. Non négociable.
- **Encodage en local, pas dans le cloud** : le RTX 3080 encode en ~3 min gratuitement.
  L'encodage cloud « gratuit » (type Vercel) a été étudié puis rejeté : serverless limité à
  10-60 s, pas de GPU, et 1-3 Go à transférer. Un site web = au mieux un tableau de bord qui
  orchestre, jamais l'encodeur. Archi web + agent local possible mais prématurée pour une chaîne solo.

## Réglages actuels du user (config.json / projet.json)

```json
{
  "audio": { "lufs": -14, "crossfadeSeconds": 3, "bitrate": "320k" },
  "video": { "fps": 30, "crf": 20, "codec": "nvenc", "preset": "ultrafast" }
}
```

## Génération musicale (MCP Suno)

Compte Suno : **Pro Plan**, 2500 crédits/mois, modèles `v6-mini` / `v6` / `v6-wild`.
Via le MCP, **chaque appel de génération sort 2 morceaux et débite des crédits** → toujours
confirmer avant de lancer un batch. L'**analyse** audio (BPM, tonalité, sections) est **gratuite**.

**Identité sonore retenue** (après tests d'écoute) : électronique, synthé, sombre, avec du
mouvement — univers « night coding / lock-in ». Les 3 presets partagent la palette et
s'enchaînent dans une même session d'1-2h. Les styles doux (piano, lo-fi, ambient pluie,
organic) ont été testés puis **écartés** (trop lents, trop « wallpaper IA »).

Les presets vivent dans **`presets/musique.json`** (3 gardés) :
- `synthwave-focus` — synthés analogiques chauds, arpège lent, ~90-100 BPM
- `dark-focus-cinematic` — dark ambient, pads cinématiques, sub profond, lent
- `minimal-techno-engine` — techno minimale hypnotique, ~120 BPM

Levier anti-« IA » validé : pistes plus longues (240 s) + `controls.variety` à 2.

**Outil `outils/decouper-compilation.js`** : découpe une compilation (fichier local chez le user)
en ses pistes uniques d'après un chapitrage YouTube, déduplique les titres répétés, ignore les
lignes-marqueurs (ex : `🔃`). Sert à extraire des échantillons de référence pour analyser la
cible sonore (analyse uniquement — on ne republie pas de morceaux protégés).

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
- **FFmpeg 9+ / NVENC** : l'option s'écrit `-spatial-aq` (plus `-spatial_aq`, renommé). La détection NVENC se fait par probe réelle d'encodage (256×256 min, sinon « Frame Dimension less than the minimum supported value »), pas par lecture de `-encoders`. Corrigé et mergé dans `main`.

## Structure fichiers projet

```
suno-video-compiler/
├── index.js
├── config.json           # réglages globaux (surchargés par projet.json)
├── lancer-video.bat      # menu interactif Windows
├── demarrer-app.bat      # lanceur Electron Windows
├── demarrer-app.command  # lanceur Electron macOS
├── presets/
│   └── musique.json      # presets de génération Suno (3 gardés, instrumental only)
├── outils/
│   └── decouper-compilation.js  # découpe une compil en pistes uniques (référence)
├── src/
│   ├── config.js
│   ├── utils.js
│   ├── 01-normalize.js
│   ├── 02-playlist.js
│   ├── 03-background.js
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

Roadmap d'automatisation (dans l'ordre) :
1. **Analyse des références** : le user extrait des échantillons d'une compilation concurrente
   (`outils/decouper-compilation.js`) et les envoie ; Claude analyse (BPM, tonalité, instruments)
   et fige les tags définitifs des 3 presets. *← étape en cours au moment du passage en local.*
2. **Batch session complète** : générer ~9-12 pistes (3 par style, 240 s, variety 2) pour monter
   une vraie session d'1h30, puis la passer dans le pipeline (normalize → playlist → assemble).
3. **Miniatures automatisées** : template fixe (fond, 3 objets centrés + titre). Pas de MCP Canva
   dispo → soit générateur programmatique Node (`sharp`), soit Figma (connecté). **Garde-fou
   juridique** : pas de personnage/marque protégés sur des miniatures monétisées (ex : Harvey
   Specter/Suits, logo Red Bull) → utiliser des visuels libres/génériques au même code visuel.
4. **Titres cliffhanger** dans la voix LucidityFM, branchés sur `05-metadata.js`.
5. **Plus tard** : connecter le PC du user à Claude (Remote Control, Early Access) pour lancer le
   pipeline de bout en bout sans copier-coller ; interface Electron pour centraliser le workflow.

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
- Descriptions: focus, discipline, solitude, deep work themes

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
