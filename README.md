# Suno Video Compiler

Fabrique une **vidéo YouTube longue** (45 min à 3 h) à partir de **tes pistes audio** et d'**une
image fixe** : volume normalisé, fondus enchaînés entre les morceaux, encodage MP4, description
avec chapitres, et — si tu le veux — dépôt sur ta chaîne **en privé**.

C'est le format « musique de concentration / lo-fi / ambient » : une image, de la musique,
des chapitres.

```
tes pistes audio + background.jpg
  → 1. normalisation du volume (-14 LUFS, la cible de YouTube)
  → 2. playlist longue avec fondus enchaînés (ordre remélangé à chaque passage)
  → 3. vérification de l'image
  → 4. encodage MP4 1080p (carte NVIDIA si présente, sinon processeur)
  → 5. description, chapitres, miniature
  → 6. (option) upload YouTube, toujours en privé
```

> **Ce que l'outil ne fait pas : la musique.** Aucune génération musicale n'est incluse.
> Tu fournis tes propres pistes (composées, achetées sous licence, ou générées avec le service
> de ton choix — le nom du projet vient de Suno, mais n'importe quel fichier audio convient).
> **Tu es responsable des droits** sur l'audio et l'image que tu publies.

---

## Prérequis

| Quoi | Détail |
|---|---|
| **Windows 10 ou 11** | C'est là que l'outil est développé et testé. Le code est du Node.js + FFmpeg standard et un lanceur macOS existe (`demarrer-app.command`), mais macOS et Linux ne sont pas testés. |
| **Node.js 18 ou plus récent** | Version LTS sur [nodejs.org](https://nodejs.org). |
| **FFmpeg** (`ffmpeg` **et** `ffprobe` dans le PATH) | `winget install Gyan.FFmpeg`. |
| **Carte graphique NVIDIA** | **Facultative.** Avec : encodage NVENC, rapide. Sans : l'outil le détecte tout seul et encode sur le processeur (libx264) — même résultat, plus lent. |
| **Espace disque** | Compte 1 à 3 Go par vidéo, plus un cache audio (~1 Go pour 3 h). |
| **Compte Google** | Seulement pour l'upload automatique (voir plus bas). Sans lui, tu récupères le MP4 et tu l'envoies à la main. |

---

## Installation

### 1. Récupérer le projet

Télécharge le ZIP depuis la page GitHub du projet (bouton **Code → Download ZIP**) et
décompresse-le où tu veux, ou clone-le avec git. **Aucun chemin n'est imposé** : tout fonctionne
depuis le dossier où tu l'as mis.

### 2. Installer les prérequis et les dépendances

**Le plus simple** — dans PowerShell, depuis le dossier du projet :

```powershell
Set-ExecutionPolicy Bypass -Scope Process; .\installer-windows.ps1
```

Le script installe Node.js et FFmpeg s'ils manquent (via `winget`), puis lance `npm install`.

**À la main**, si tu préfères :

```powershell
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
```

Ferme et rouvre le terminal (pour que le PATH soit à jour), puis dans le dossier du projet :

```powershell
npm install
```

### 3. Vérifier

```powershell
node --version
ffmpeg -version
ffprobe -version
```

Les trois commandes doivent répondre. Si `ffmpeg` n'est pas reconnu après installation, c'est
que le terminal n'a pas été rouvert, ou que le dossier `bin` de FFmpeg n'est pas dans le PATH
(*Paramètres → « variables d'environnement » → Path → Nouveau → chemin vers `...\ffmpeg\bin`*).

---

## Premier rendu de test (sans rien fournir)

Le dépôt ne contient aucun média. Un script fabrique des sons et une image de démonstration
neutres, juste pour vérifier que tout tourne chez toi :

```powershell
node outils/creer-demo.js
node index.js --projet exemple-deep-focus --test 30
```

La première commande crée 4 pistes de 45 s (des accords synthétiques, pas de la musique) et un
fond uni dans `projets/exemple-deep-focus/`. La seconde produit une vidéo de 30 secondes.
Résultat dans `projets/exemple-deep-focus/output/` :

- `exemple-deep-focus.mp4` — la vidéo
- `description.txt` — description + chapitres, prêts à coller
- `miniature.jpg` — l'image en 1280×720
- `recap.json` — l'ordre exact des pistes

> `--test 30` limite la **vidéo** à 30 secondes, mais l'audio complet du projet est quand même
> préparé (normalisation + playlist). Sur un vrai projet de 3 h, le test prend donc quelques
> minutes la première fois ; ensuite le cache accélère tout.

---

## Ta première vraie vidéo

### 1. Créer le projet

Un projet = un dossier dans `projets/` :

```
projets/
└── ma-video-01/
    ├── audio/              ← tes pistes (.mp3, .wav, .flac, .m4a, .aac, .ogg)
    ├── background.jpg      ← l'image (aussi .png ou .webp) : fond de la vidéo ET miniature
    └── projet.json         ← titre, description, tags, durée (facultatif)
```

- **Ordre des pistes** : tri naturel des noms de fichier. Préfixe-les (`01-…`, `02-…`) pour
  choisir l'ordre du premier passage — ce sont les premières minutes qui décident si l'auditeur
  reste. Le préfixe numérique est retiré des titres de chapitres.
- **Image** : n'importe quelle taille ; elle est recadrée en 1920×1080.
- **Au moins 3 pistes** si tu veux des chapitres YouTube.

Exemple de `projet.json` (tout est facultatif) :

```json
{
  "video": { "targetDurationMinutes": 90 },
  "metadata": {
    "titre": "Deep Focus — 90 Minutes of Calm Music",
    "langue": "en",
    "intro": "Texte en haut de la description.",
    "outro": "#focusmusic #studymusic",
    "tags": ["focus music", "study music"],
    "chapitres": ["First Light", "Slow Tide", "Quiet Room"]
  }
}
```

`chapitres` remplace les noms de fichier par les libellés de ton choix, dans l'ordre des
pistes. Vide ou absent : le nom du fichier sert de titre.

### 2. Lancer

```powershell
node index.js --projet ma-video-01 --test 30
node index.js --projet ma-video-01
```

Un test d'abord, le rendu complet ensuite. Ou double-clique sur **`lancer-video.bat`**, qui
pose les questions.

### 3. Récupérer

Tout arrive dans `projets/ma-video-01/output/`. Écoute les jonctions entre morceaux avant de
publier.

---

## Commandes

| Commande | Effet |
|---|---|
| `node index.js --projet <nom>` | Compile un projet |
| `node index.js --projet <nom> --test 30` | Vidéo limitée aux 30 premières secondes |
| `node index.js --tous` | Compile tous les projets qui ont de l'audio |
| `node index.js --projet <nom> --upload` | Compile, puis dépose sur YouTube **en privé** |
| `node index.js --projet <nom> --meta-only` | Régénère description et chapitres **sans ré-encoder** |
| `node index.js --projet <nom> --meta-only --upload` | Idem, puis envoie le MP4 existant tel quel |
| `node index.js --projet <nom> --update [<id>]` | Met à jour titre/description/tags d'une vidéo **déjà en ligne** |
| `node index.js --vider-cache` | Vide `.cache/` |
| `node index.js --aide` | Rappel des commandes |
| `node outils/creer-demo.js` | Crée les médias de démonstration |
| `node outils/auth-youtube.js` | (Ré)autorise l'accès à ta chaîne YouTube |
| `node outils/composer-projet.js --nouveau` | Crée un projet à partir d'un modèle de chaîne (voir « Banques ») |
| `node outils/decouper-compilation.js` | Découpe un long fichier en pistes d'après un chapitrage |

En cas d'erreur inattendue, `DEBUG=1` devant la commande affiche le détail technique
(PowerShell : `$env:DEBUG=1; node index.js …`).

---

## Réglages

Trois niveaux, du plus général au plus précis — chacun surcharge le précédent :

1. **`config.json`** — réglages communs, versionnés avec le projet.
2. **`config.local.json`** — *tes* réglages personnels. Ignoré par git. Copie
   `config.local.exemple.json` pour démarrer.
3. **`projets/<nom>/projet.json`** — pour un projet donné.

| Réglage | Défaut | Rôle |
|---|---|---|
| `audio.lufs` | -14 | Volume cible (la norme YouTube) |
| `audio.crossfadeSeconds` | 3 | Durée du fondu entre deux pistes |
| `audio.bitrate` | `320k` | Débit audio du MP4 |
| `video.targetDurationMinutes` | 180 | Durée visée ; le nombre de passages est calculé seul |
| `video.codec` | `auto` | `auto` : NVENC si une carte NVIDIA répond, sinon libx264. `libx264` : force le processeur. |
| `video.preset` / `video.crf` | `fast` / 20 | Vitesse et qualité d'encodage |
| `video.upscaleTo4k` | `false` | Sortie en 2160p |
| `graine` | nom du projet | Même graine = même ordre de pistes, exactement |
| `metadata.descriptionTemplate` | — | Gabarit de description : `{intro}`, `{chapitres}`, `{outro}`, `{titre}`, `{duree}` |
| `upload.playlistId` | vide | ID de **ta** playlist (ce qui suit `list=` dans son URL) |
| `upload.oauthPort` | 4567 | Port local utilisé pendant l'autorisation Google |
| `chaineDefaut` | `exemple` | Modèle de chaîne utilisé par `composer-projet.js` |

---

## Upload YouTube (facultatif)

L'outil peut déposer la vidéo sur ta chaîne avec titre, description, chapitres, tags, miniature
et playlist. **Aucun identifiant n'est fourni avec le projet : tu crées les tiens**, gratuitement,
une fois pour toutes.

### 1. Créer tes identifiants Google Cloud

1. Va sur [console.cloud.google.com](https://console.cloud.google.com) et crée un **nouveau
   projet** (le nom n'a pas d'importance).
2. **API et services → Bibliothèque** : cherche **YouTube Data API v3** et clique **Activer**.
3. **API et services → Écran de consentement OAuth** : type d'utilisateur **Externe**, remplis le
   nom de l'application et ton e-mail, puis ajoute **ton propre compte Google** dans les
   **utilisateurs test**.
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** : type
   d'application **Application de bureau**.
5. Télécharge le JSON et enregistre-le sous **`credentials/client_secret.json`** dans le dossier
   du projet (crée le dossier `credentials/`).

> `credentials/` est ignoré par git. **Ne partage jamais son contenu** : il donne accès à ta
> chaîne.

### 2. Autoriser l'accès à ta chaîne

```powershell
node outils/auth-youtube.js
```

Une adresse s'affiche : ouvre-la, connecte-toi avec le compte de ta chaîne, autorise. Google
affiche « application non validée » — c'est normal, c'est *ton* application : **Paramètres
avancés → Accéder à…**. Le jeton est enregistré dans `credentials/token.json`.

**Le jeton expire au bout de 7 jours** tant que ton application Google est en mode « Test ».
L'outil te le dit clairement quand ça arrive : relance `node outils/auth-youtube.js`. Pour
supprimer cette limite, passe l'application en **Production** dans l'écran de consentement.

### 3. ⚠️ Vérifier ta chaîne par téléphone AVANT la première vidéo longue

**YouTube refuse les vidéos de plus de 15 minutes sur une chaîne non vérifiée.** La vidéo est
envoyée en entier, puis YouTube affiche « traitement abandonné » : elle est perdue et il faut
tout renvoyer. La **miniature personnalisée** a la même exigence.

- Vérifie ta chaîne sur **[youtube.com/verify](https://www.youtube.com/verify)** (un SMS, deux
  minutes).
- L'outil contrôle ce point avant d'envoyer quoi que ce soit (`longUploadsStatus` doit valoir
  `allowed`) et s'arrête avec un message clair sinon.

### 4. Envoyer

```powershell
node index.js --projet ma-video-01 --upload
```

Si le MP4 existe déjà, pas besoin de ré-encoder :

```powershell
node index.js --projet ma-video-01 --meta-only --upload
```

**La vidéo est toujours déposée en privé, jamais publiée automatiquement.** Ce n'est pas
réglable, c'est voulu : tu l'écoutes, tu vérifies, tu publies toi-même depuis YouTube Studio.

La miniature envoyée est `output/miniature.jpg`. Si ce fichier n'existe pas, il est tiré de
`background.jpg` ; s'il existe déjà, il n'est jamais écrasé. Pour une miniature différente de
l'image de fond, dépose donc la tienne à cet endroit (1280×720) avant l'upload.

---

## Changer un titre ou un chapitre sans ré-encoder

Les chapitres ne sont que du texte dans la description : inutile de refaire la vidéo.

1. Modifie `metadata.titre`, `metadata.chapitres`, `intro`… dans `projet.json`.
2. `node index.js --projet <nom> --meta-only` régénère `description.txt` en quelques secondes.
3. Colle-la dans YouTube Studio, ou utilise `--update` pour modifier la vidéo en ligne.

> **Ne renomme pas les fichiers audio** pour changer un libellé : le nom de fichier fait partie
> de la clé de cache, donc tout serait recalculé. Passe par `metadata.chapitres`.

Règles de YouTube pour que les chapitres apparaissent (l'outil les respecte, mais elles
expliquent certains avertissements) : au moins **3** chapitres, le premier à **0:00**, au moins
**10 secondes** chacun. Sinon YouTube les ignore sans rien dire.

---

## Banques de titres et modèles de chaîne (facultatif)

Si tu publies régulièrement, tu peux éviter de réécrire les mêmes textes :

- **`presets/chaines/<chaine>.json`** — le contenu fixe de ta chaîne (durée, gabarit de
  description, intro, hashtags, playlist). Exemple fourni : `exemple.json`.
- **`presets/banques/<niche>.json`** — une réserve de titres, de séries de chapitres et de
  mots-clés. Exemple fourni : `exemple-focus.json`. Détails dans `presets/banques/README.md`.

```powershell
node outils/composer-projet.js --nouveau --chaine exemple --dry
node outils/composer-projet.js --nouveau ma-video-02 --chaine exemple
```

La première commande montre un aperçu sans rien écrire. La seconde crée
`projets/ma-video-02/` avec un `projet.json` rempli (titre, chapitres et tags piochés, sans
répéter ceux déjà utilisés par cette chaîne). Il te reste à déposer l'audio et l'image.

Pour ta propre chaîne : copie `exemple.json` et `exemple-focus.json`, adapte-les, puis mets
`"chaineDefaut": "ta-chaine"` dans `config.local.json`.

---

## Interface graphique (facultatif)

Double-clique sur **`demarrer-app.bat`** (ou `npm start`) : une fenêtre permet de créer des
projets, d'ajouter les pistes, de choisir l'image et de lancer le rendu. Elle repose sur
Electron, installé comme dépendance optionnelle. La ligne de commande reste la référence :
l'upload, `--meta-only` et `--update` ne sont disponibles que là.

---

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `"ffmpeg" est introuvable` | FFmpeg absent ou terminal pas rouvert après l'installation. `winget install Gyan.FFmpeg`, rouvre le terminal. |
| `Aucun encodeur GPU NVIDIA (NVENC) utilisable` | Simple information : pas de carte NVIDIA (ou pilote ancien). L'encodage se fait sur le processeur. |
| `Projet introuvable` | Le nom ne correspond à aucun dossier de `projets/`. Le message liste ceux qui existent. |
| `Aucun fichier audio dans …` | Le dossier `audio/` du projet est vide ou ne contient pas de format reconnu. |
| `Image background manquante` | Ajoute `background.jpg` (ou `.png`, `.webp`) à la racine du projet. |
| `Identifiants Google absents` | `credentials/client_secret.json` n'existe pas : voir « Upload YouTube ». |
| `Autorisation YouTube expirée` | Jeton de 7 jours en mode Test : `node outils/auth-youtube.js`. |
| `Upload long bloqué` | Chaîne non vérifiée par téléphone : [youtube.com/verify](https://www.youtube.com/verify). |
| `Le port 4567 est déjà utilisé` | Mets un autre port dans `config.local.json` : `"upload": { "oauthPort": 4568 }`. |
| Les chapitres n'apparaissent pas sur YouTube | Moins de 3 chapitres, ou un chapitre de moins de 10 s. |
| J'ai changé l'audio mais la vidéo n'a pas changé | `node index.js --vider-cache`, puis relance. |

---

## Points de vigilance

- **Droits** : tu dois avoir le droit de publier (et, le cas échéant, de monétiser) ta musique
  et ton image. Vérifie les conditions de la source de tes pistes avant d'y passer des heures.
- **Contenu répétitif** : YouTube sanctionne les chaînes qui publient en masse du contenu
  quasi identique. Varie visuels et musique, et garde un contrôle humain — d'où l'upload en
  privé.
- **Espace disque** : le cache garde les pistes normalisées et les masters en FLAC.
  `--vider-cache` après publication.
- **Durées indicatives** : sur la machine de l'auteur (carte NVIDIA), une vidéo de 3 h à partir
  de 8 pistes prend une dizaine de minutes la première fois, quelques minutes ensuite grâce au
  cache. Sur processeur seul, compte nettement plus pour l'encodage.

---

## Structure du dépôt

```
index.js                  point d'entrée (enchaîne les étapes)
config.json               réglages communs
config.local.exemple.json modèle pour tes réglages personnels
src/                      les étapes 01 → 06, la config, les utilitaires
outils/                   démo, autorisation YouTube, création de projet, découpe
presets/                  modèles de chaîne et banques de textes (exemples neutres)
projets/                  un dossier par vidéo (seul projet.json est versionné)
electron/                 interface graphique optionnelle
lancer-video.bat          lanceur Windows (ligne de commande guidée)
demarrer-app.bat          lanceur Windows (interface graphique)
installer-windows.ps1     installation des prérequis
```

Jamais dans le dépôt : `credentials/`, `config.local.json`, `.cache/`, `node_modules/`, et tous
les fichiers audio/vidéo/image des projets.

---

## Licence

Voir le fichier `LICENSE` à la racine du dépôt.
