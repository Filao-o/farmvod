# Échantillons de référence

Dossier de travail pour analyser des compilations concurrentes (étape 1 de la roadmap :
caler les tags définitifs des presets Suno).

> Analyse / référence uniquement — on ne republie jamais de morceaux protégés.

## Convention

Un sous-dossier par compilation. Tu déposes la vidéo longue dedans, je colle le chapitrage :

```
echantillons/
└── <nom-compil>/
    ├── source.<ext>     ← LA vidéo longue que tu déposes (mp4, mkv, webm, mp3, m4a...)
    ├── chapitres.txt    ← le chapitrage YouTube (collé ici)
    └── pistes/          ← sortie : pistes uniques découpées (.mp3), générée par le script
```

Le nom du fichier vidéo n'a pas d'importance : le script prend le premier média trouvé
dans le dossier (hors `chapitres.txt`).

## Format de `chapitres.txt`

Un chapitre par ligne, timecode puis titre :

```
0:00 Midnight Protocol
4:12 Neon Deadline
8:30 🔃
8:30 Lock In
```

- `MM:SS` ou `H:MM:SS`. Un séparateur `-`, `–`, `|` après le timecode est toléré.
- Les **titres répétés** → seule la 1re occurrence est extraite (le reste est ignoré).
- Une ligne **sans texte réel** (ex : `🔃` de boucle) est ignorée comme piste, mais
  sert de borne de fin pour la piste précédente.

## Lancer le découpage

```powershell
node outils/decouper-compilation.js --echantillon <nom-compil>
```

Ça lit `echantillons/<nom-compil>/`, trouve la vidéo + `chapitres.txt`, et écrit les
pistes dans `echantillons/<nom-compil>/pistes/`.
