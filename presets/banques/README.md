# Banques par niche

> Exemple fourni : `exemple-focus.json` (niche neutre), utilisé par la chaîne d'exemple
> `presets/chaines/exemple.json`. Copie-les pour créer les tiens.

Une niche = un fichier `presets/banques/<niche>.json`. Il regroupe **tout** le
contenu copywriting d'une niche (titres, sets de chapitres, keywords) + un
`brief` qui dit à Claude ce qu'on publie et sur quel ton.

**Principe directeur : contenu ≠ usage.**
- Le **contenu** (ce fichier) est partagé, immuable à l'usage, réutilisable par
  plusieurs chaînes.
- L'**usage** (ce qui a déjà été consommé) vit à part, par chaîne, dans
  `.cache/usage/<chaine>.json`. Supprimer ce fichier = tout redevient dispo.
- Donc : un titre utilisé n'est **jamais retiré** de la banque, juste marqué
  comme consommé **pour cette chaîne-là**. Deux chaînes sur la même niche ne se
  volent pas les titres sans jamais s'amputer.

## Structure d'un fichier niche

```json
{
  "niche": "exemple-focus",
  "chaines": ["exemple"],
  "brief": "Ce qu'on publie + audience + ton titres + ton chapitres.",
  "titres":        [ { "id": "t001", "texte": "..." } ],
  "setsChapitres": [ { "id": "grind", "theme": "grind", "chapitres": ["...", "..."] } ],
  "keywords":      [ { "id": "k001", "texte": "deep house" } ]
}
```

Règles de forme :
- **id** unique et **stable** dans sa catégorie (`t###`, `k###`, set = son thème).
  L'historique s'appuie dessus → ne jamais recycler un id sur un autre contenu.
- **titres** : dans le ton décrit par le `brief` de la niche (et ta charte de chaîne si tu
  en as une).
- **setsChapitres** : chaque set = exactement le nombre de pistes uniques d'une
  session (3 styles × 4 = 12). Noms Title Case 2-4 mots, **valides en nom de
  fichier** (deviennent le nom du .mp3).
- **keywords** : tags YouTube courts.

## Enrichir une banque (procédure few-shot — faite par Claude)

Le jugement « tape un nerf » n'est pas automatisable : c'est Claude qui génère,
hors-ligne, en suivant le `brief` de la niche. Le code ne fait que piocher.

**Étape pour l'utilisateur :**
1. Donne 1 à 5 exemples (screen, liste collée, peu importe) représentatifs de ce
   que tu veux, en précisant la **niche** (existante ou nouvelle).
2. Dis à Claude : « enrichis les titres de la niche `<niche>` » (ou `chapitres`,
   ou `keywords`).

**Ce que Claude fait, à la lettre :**
1. Si la niche n'existe pas → crée `presets/banques/<niche>.json` avec un `brief`
   déduit des exemples + une question si le ton est ambigu.
2. Lit le `brief` + les exemples (+ ta charte de chaîne si elle existe).
3. Génère N nouveaux items **dans le même style** que les exemples.
4. **Dédoublonne** (insensible à la casse/ponctuation) contre l'existant de la
   niche. Rien qui existe déjà, rien de quasi-identique.
5. Attribue des **ids neufs** (incrémente le max existant) et **ajoute** à la fin.
   On n'écrase ni ne réordonne jamais l'existant.
6. Annonce combien d'items ajoutés et lesquels.

**Pour une nouvelle niche (ex. santé), l'utilisateur fournit juste les exemples ;
Claude écrit le brief et la structure.** C'est le seul moment où Claude intervient
au « runtime » — tout le reste (pioche, anti-répétition, usage) est du code.

## Pioche & usage (code, voir `src/banques.js`)

- Pioche aléatoire avec **anti-répétition** par chaîne (ne ressort pas un id déjà
  consommé tant que la banque n'est pas épuisée, puis recycle).
- `node src/banques.js --niche <niche> --chaine <chaine>` → aperçu (rien écrit).
- `... --commit` → verrouille les tirages dans l'usage de la chaîne.
- Reset d'une chaîne : supprimer `.cache/usage/<chaine>.json`.
