# Suno Video Compiler

Chaîne de production automatisée pour vidéos longues (lo-fi, deep focus, sleep music) :
pistes Suno + visuel en boucle → vidéo YouTube complète avec chapitres, description et miniature.

---

## Installation (Windows)

### 1. Node.js
Télécharge la version **LTS** sur [nodejs.org](https://nodejs.org). Installateur classique, tout par défaut.

### 2. FFmpeg
Le plus simple, dans un PowerShell **administrateur** :

```powershell
winget install Gyan.FFmpeg
```

Ferme puis rouvre le terminal, et vérifie :

```powershell
ffmpeg -version
ffprobe -version
```

Si la commande n'est pas reconnue, c'est que le dossier `bin` de FFmpeg n'est pas dans le `PATH` :
*Paramètres → Rechercher « variables d'environnement » → Path → Modifier → Nouveau →* chemin vers `...\ffmpeg\bin`.

### 3. Le projet
```powershell
cd chemin\vers\suno-video-compiler
npm install          # aucune dépendance obligatoire, mais initialise le projet
```

Pour l'upload YouTube uniquement :
```powershell
npm install googleapis
```

---

## Production d'une vidéo

### 1. Créer le projet
```
projets/
└── deep-focus-01/
    ├── audio/              ← tes pistes Suno (.wav ou .mp3)
    ├── background.mp4      ← ton loop de 10-20 s
    └── projet.json         ← titre, tags, durée (facultatif)
```

### 2. Lancer
```powershell
node index.js --projet deep-focus-01
```

### 3. Récupérer
Tout arrive dans `projets/deep-focus-01/output/` :
- `deep-focus-01.mp4` — la vidéo
- `description.txt` — description + chapitres, prêts à coller
- `miniature.jpg` — image extraite du loop
- `recap.json` — trace de l'ordre exact des pistes

---

## Commandes

| Commande | Effet |
|---|---|
| `node index.js --projet <nom>` | Compile un projet |
| `node index.js --tous` | Compile tous les projets prêts (mode batch) |
| `node index.js --projet <nom> --upload` | Compile et dépose sur YouTube **en privé** |
| `node index.js --vider-cache` | Vide `.cache/` |

---

## Réglages

`config.json` à la racine s'applique à tout ; `projets/<nom>/projet.json` a la priorité pour un projet donné.

| Réglage | Défaut | Rôle |
|---|---|---|
| `audio.lufs` | -14 | Cible loudness (norme YouTube) |
| `audio.crossfadeSeconds` | 3 | Durée du fondu entre pistes |
| `video.targetDurationMinutes` | 180 | Durée visée ; le nombre de passages est calculé seul |
| `video.upscaleTo4k` | false | Sortie 2160p → traitement VP9/Opus par YouTube |
| `video.copyVideoStream` | true | Copie du flux vidéo (rapide). `false` = ré-encodage complet |
| `graine` | nom du projet | Même graine = même ordre de pistes, exactement |

---

## Upload YouTube

1. [Google Cloud Console](https://console.cloud.google.com) → nouveau projet
2. Active **YouTube Data API v3**
3. Identifiants → ID client OAuth → type **Application de bureau**
4. URI de redirection autorisé : `http://localhost:4567`
5. Télécharge le JSON dans `credentials/client_secret.json`
6. `node index.js --projet <nom> --upload`

La première fois, une adresse s'affiche : tu l'ouvres, tu autorises, et le jeton est mémorisé.

**La vidéo est déposée en privé, jamais publiée automatiquement.** C'est volontaire :
publier en série sans aucun contrôle humain correspond exactement au profil que YouTube
identifie comme contenu de masse à faible valeur. Une écoute en accéléré coûte quelques
minutes ; une démonétisation coûte la chaîne.

Le quota d'upload par défaut de l'API est de **6 vidéos par jour environ** (10 000 unités,
1 600 par envoi). Largement suffisant pour 1-2 par semaine.

---

## Points de vigilance

- **Droits commerciaux Suno** : la monétisation dépend de ton abonnement. À vérifier avant d'investir des heures.
- **Content ID** : réutiliser exactement le même loop visuel sur toutes les vidéos peut déclencher des détections de doublon. Fais tourner 3-4 visuels.
- **Espace disque** : le cache stocke les masters audio en FLAC (~1 Go pour 3 h). `--vider-cache` quand tu as publié.
- **Premières minutes** : le premier passage garde l'ordre naturel de tes fichiers. Nomme tes pistes de façon que les meilleures ouvrent la vidéo — c'est ce qui décide de la rétention.

---

## Durées indicatives (3 h de vidéo, 8 pistes)

| Étape | Temps |
|---|---|
| Normalisation (1er passage) | ~2 min |
| Montage playlist | ~4 min |
| Encodage du loop | ~1 min |
| Assemblage (copie du flux) | ~3 min |
| **Total** | **~10 min** |

Les lancements suivants avec le même audio ou le même loop tombent à 3-4 minutes grâce au cache.
