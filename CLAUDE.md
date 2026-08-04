# Suno Video Compiler — Contexte pour Claude Code

## Ce que fait ce projet

Pipeline Node.js qui produit des vidéos YouTube longues (1-3h) type "lo-fi study music" à partir de :
- pistes audio générées avec Suno (dans `projets/<nom>/audio/`)
- pochettes carrées 1024×1024 (dans `projets/<nom>/pochettes/`, même nom que l'audio)
- fichier de citations (dans `citations/<theme>.txt`)

Le rendu final est un habillage "now playing" style Apple Music : pochette centrale avec halo, citation en vedette, titre discret, barre de progression par piste, fond flouté hérité de la pochette courante.

## Utilisateur

- **Windows** avec RTX 3080 (encodage GPU via NVENC)
- Publie 1-2 vidéos/semaine sur YouTube
- Préfère les explications concrètes et le "je code, puis tu testes"
- Communique parfois par transcription vocale (phrases longues, hésitations)
- Chemin projet : `C:\Lucas\YouTube\suno-video-compiler`

## Architecture (pipeline en 5 étapes)

```
audio Suno + pochettes + citations
    ↓ [01-normalize.js]  loudnorm 2 passes → -14 LUFS
    ↓ [02-playlist.js]   fondus enchaînés, ordre remélangé par passage
    ↓ [03-nowplaying.js] pré-génère les fonds floutés (cache), pioche les citations
    ↓ [04-assemble.js]   compose via filter_complex FFmpeg + NVENC
    ↓ [05-metadata.js]   description, chapitres, miniature
    ↓ [06-upload.js]     upload YouTube en PRIVÉ (validation humaine obligatoire)
```

Le module central est `04-nowplaying-filter.js` qui construit un gros filter_complex FFmpeg.

## Décisions figées (ne pas remettre en question)

- **Confidentialité upload** : toujours "private", jamais "public" (validation humaine)
- **Fond dérivé de la pochette** (blur + zoom + saturation), pas de `background.mp4` séparé
- **Pré-génération des fonds** en cache pour éviter que FFmpeg refasse gblur×N à chaque frame
- **Codec par défaut** : `nvenc` (NVIDIA), fallback `libx264` dans config si besoin
- **Barre de progression** : `scale=eval=frame` sur source blanche (drawbox n'évalue qu'une fois → bug connu)
- **Halo** : blanc pochette-taille + pad transparent (marge ≥ 3×sigma) + `premultiply`/`gblur`/`unpremultiply` + `lut a×1.8`. **Toujours blanc**, jamais teinté par la pochette.
- **Citation + auteur inline** sur la même ligne, centré
- **Titre du morceau** petit et discret, sous la citation
- **Aucun visualiseur audio-réactif** (abandonné pour rester simple et rapide)
- **Pas de vinyle qui tourne** (cliché de la niche, décision volontaire)

## Réglages actuels du user (config.json / projet.json)

```json
{
  "nowplaying": {
    "pochette": { "taille_pct_hauteur": 55, "halo_blanc_px": 40, "coins_arrondis_px": 6 },
    "fond_diffuse": { "flou_px": 80, "zoom": 2.4, "assombrissement_pct": 15, "saturation": 1.1, "respiration": 0.05 },
    "typographie": {
      "taille_titre": 15, "taille_sous_titre": 30, "taille_auteur": 18,
      "auteur_meme_ligne": true, "espace_pochette_texte": 44, "epaisseur_barre_px": 6
    }
  }
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

- **drawbox n'évalue son expression qu'une fois** → utiliser `scale=eval=frame`
- **`-loop 1 -i img.jpg` sans `-framerate`** → produit un stream à FPS variable, vidéo tronquée. Toujours mettre `-framerate 30` avant l'input.
- **Filter_complex trop long en ligne de commande** → passer par `-filter_complex_script <fichier>`
- **Pilotes NVIDIA < 610.00** → NVENC échoue avec "required nvenc API version"
- **Apostrophes typographiques dans citations** → drawtext ne les gère pas bien, remplacer `'` par `’`
- **Chapitres YouTube** : minimum 3, premier à 0:00, min 10s d'espacement, format `MM:SS` sous 1h, `H:MM:SS` au-delà. Sinon YouTube les ignore silencieusement.
- **`gblur` sur RGBA avec zones transparentes → halo gris, pas blanc**. Le blur mélange le RGB blanc avec le RGB (0,0,0) sous-jacent des pixels transparents. Solution : entourer par `premultiply=inplace=1` avant et `unpremultiply=inplace=1` après le blur. Voir section 2 de `04-nowplaying-filter.js`.
- **`gblur` coupé net au bord du canvas** → marge du pad doit être ≥ 3 × sigma, sinon on voit une ligne visible là où le blur s'arrête.

## Prototypes visuels (dans `outputs/` du chat, pas dans le repo)

- `prototype-now-playing.html` — outil de design du look (charge une pochette + un MP3, ajuste les curseurs)
- `prototype-visualiseur.html` — ancien prototype visualiseur (à ignorer maintenant)
- `deep-focus.txt` — 82 citations Deep Focus vérifiées (Newport, Clear, Naval, Holiday, stoïciens…)

## Structure fichiers projet

```
suno-video-compiler/
├── index.js
├── config.json           # réglages globaux (surchargés par projet.json)
├── lancer-video.bat      # menu interactif pour non-devs
├── src/
│   ├── config.js
│   ├── utils.js
│   ├── 01-normalize.js
│   ├── 02-playlist.js
│   ├── 03-nowplaying.js
│   ├── 04-assemble.js
│   ├── 04-nowplaying-filter.js
│   ├── 05-metadata.js
│   └── 06-upload.js
├── citations/
│   └── deep-focus.txt    # 82 citations, format "citation|auteur"
├── projets/
│   └── <nom>/
│       ├── audio/        # .wav ou .mp3
│       ├── pochettes/    # .jpg carrée, même nom que l'audio
│       ├── projet.json   # overrides pour ce projet
│       └── output/       # vidéo générée + description + miniature + filter.txt
└── .cache/               # fonds pré-générés, normalisations
```

## Prochaines étapes envisagées

- **Interface Electron** (après stabilisation) : centraliser le workflow, pas la cosmétique. Objectifs : drop d'audio + pochette auto-redimensionnée et auto-renommée, édition inline des titres/timing, sélection de la durée cible, cases à cocher pour les options. But = zéro fouille dans les fichiers.
- ~~Génération pochettes via API~~ : abandonné, images libres de droit suffisent pour la 1ère chaîne.
- ~~Teinte halo dynamique~~ : abandonné, halo blanc figé.

## Style de collaboration attendu

- **Édits ciblés** (str_replace) plutôt que réécritures complètes
- **Tester avant de livrer** : lancer `node index.js --projet test --test 30` après chaque modif
- **Toujours honnête** sur ce qui marche / ne marche pas, éviter le "ça devrait marcher"
- **Économie tokens** : si une info est déjà dans ce fichier, ne pas la re-explorer
