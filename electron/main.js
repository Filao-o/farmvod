'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const RACINE = path.resolve(__dirname, '..');

// ── Window ──────────────────────────────────────────────────────────
let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1120,
        height: 740,
        minWidth: 860,
        minHeight: 560,
        title: 'FarmVod',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Helpers ─────────────────────────────────────────────────────────
function projetsDir() { return path.join(RACINE, 'projets'); }

function listerProjets() {
    const dir = projetsDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
            const nom = d.name;
            const audioDir = path.join(dir, nom, 'audio');
            const pistes = fs.existsSync(audioDir)
                ? fs.readdirSync(audioDir).filter(f => /\.(wav|mp3|flac|ogg|m4a)$/i.test(f))
                : [];
            const bgExists = ['.jpg', '.jpeg', '.png', '.webp']
                .some(ext => fs.existsSync(path.join(dir, nom, `background${ext}`)));
            const projetJson = path.join(dir, nom, 'projet.json');
            let config = {};
            try { config = JSON.parse(fs.readFileSync(projetJson, 'utf-8')); } catch {}
            return { nom, pistes: pistes.length, bgExists, config };
        });
}

function creerProjet(nom) {
    const slug = nom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (!slug) throw new Error('Nom de projet invalide');
    const dir = path.join(projetsDir(), slug);
    if (fs.existsSync(dir)) throw new Error(`Le projet "${slug}" existe déjà`);
    fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'projet.json'), JSON.stringify({
        metadata: { titre: nom.trim() },
    }, null, 2), 'utf-8');
    return slug;
}

function supprimerProjet(nom) {
    const dir = path.join(projetsDir(), nom);
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── Audio helpers ───────────────────────────────────────────────────
const EXT_AUDIO = /\.(wav|mp3|flac|ogg|m4a)$/i;

function audioDir(projet) { return path.join(projetsDir(), projet, 'audio'); }

function listerPistes(projet) {
    const dir = audioDir(projet);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => EXT_AUDIO.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f, i) => {
            const parsed = path.parse(f);
            const titre = parsed.name.replace(/^\d+[-_\s]+/, '');
            return { fichier: f, titre, index: i };
        });
}

function renumerotePistes(projet, orderedFiles) {
    const dir = audioDir(projet);
    const tmp = [];
    orderedFiles.forEach((f, i) => {
        const ext = path.extname(f);
        const titre = path.parse(f).name.replace(/^\d+[-_\s]+/, '');
        const nouveau = `${String(i + 1).padStart(2, '0')}-${titre}${ext}`;
        if (f !== nouveau) {
            const tmpName = `__tmp_${i}_${Date.now()}${ext}`;
            fs.renameSync(path.join(dir, f), path.join(dir, tmpName));
            tmp.push({ tmpName, nouveau });
        }
    });
    tmp.forEach(({ tmpName, nouveau }) => {
        fs.renameSync(path.join(dir, tmpName), path.join(dir, nouveau));
    });
}

function ajouterAudio(projet, chemins) {
    const dir = audioDir(projet);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existants = fs.readdirSync(dir).filter(f => EXT_AUDIO.test(f));
    let idx = existants.length;
    const ajoutes = [];
    for (const src of chemins) {
        if (!EXT_AUDIO.test(src)) continue;
        idx++;
        const ext = path.extname(src);
        const titre = path.parse(src).name.replace(/^\d+[-_\s]+/, '');
        const dest = `${String(idx).padStart(2, '0')}-${titre}${ext}`;
        fs.copyFileSync(src, path.join(dir, dest));
        ajoutes.push(dest);
    }
    return ajoutes;
}

function supprimerPiste(projet, fichier) {
    const fp = path.join(audioDir(projet), fichier);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

function renommerPiste(projet, fichier, nouveauTitre) {
    const dir = audioDir(projet);
    const ext = path.extname(fichier);
    const prefix = fichier.match(/^(\d+[-_\s]+)/);
    const nouveau = (prefix ? prefix[1] : '') + nouveauTitre + ext;
    if (fichier !== nouveau) {
        fs.renameSync(path.join(dir, fichier), path.join(dir, nouveau));
    }
    return nouveau;
}

// ── Background ──────────────────────────────────────────────────────
function setBackground(projet, cheminSource) {
    const dir = path.join(projetsDir(), projet);
    ['.jpg', '.jpeg', '.png', '.webp'].forEach(ext => {
        const old = path.join(dir, `background${ext}`);
        if (fs.existsSync(old)) fs.unlinkSync(old);
    });
    const ext = path.extname(cheminSource).toLowerCase();
    const dest = path.join(dir, `background${ext === '.jpeg' ? '.jpg' : ext}`);
    fs.copyFileSync(cheminSource, dest);
    return dest;
}

function getBackgroundPath(projet) {
    const dir = path.join(projetsDir(), projet);
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        const p = path.join(dir, `background${ext}`);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ── Citations ───────────────────────────────────────────────────────
function listerFichiersCitations() {
    const dir = path.join(RACINE, 'citations');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.txt')).map(f => path.parse(f).name);
}

// ── Pipeline execution ──────────────────────────────────────────────
let pipelineProcess = null;

function lancerPipeline(projet, test) {
    if (pipelineProcess) throw new Error('Un pipeline tourne déjà');

    const { fork } = require('child_process');
    const args = ['--projet', projet];
    if (test > 0) args.push('--test', String(test));

    const child = fork(path.join(RACINE, 'index.js'), args, {
        cwd: RACINE,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, FORCE_COLOR: '0' },
    });

    pipelineProcess = child;

    child.stdout.on('data', (data) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('pipeline:log', data.toString());
        }
    });
    child.stderr.on('data', (data) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('pipeline:log', data.toString());
        }
    });
    child.on('close', (code) => {
        pipelineProcess = null;
        if (win && !win.isDestroyed()) {
            win.webContents.send('pipeline:done', code);
        }
    });
    child.on('error', (err) => {
        pipelineProcess = null;
        if (win && !win.isDestroyed()) {
            win.webContents.send('pipeline:done', 1);
            win.webContents.send('pipeline:log', `Erreur: ${err.message}\n`);
        }
    });
}

// ── IPC handlers ────────────────────────────────────────────────────
ipcMain.handle('projets:list', () => listerProjets());
ipcMain.handle('projets:create', (_, nom) => creerProjet(nom));
ipcMain.handle('projets:delete', (_, nom) => supprimerProjet(nom));

ipcMain.handle('audio:list', (_, projet) => listerPistes(projet));
ipcMain.handle('audio:add', (_, projet, chemins) => ajouterAudio(projet, chemins));
ipcMain.handle('audio:delete', (_, projet, fichier) => supprimerPiste(projet, fichier));
ipcMain.handle('audio:rename', (_, projet, fichier, titre) => renommerPiste(projet, fichier, titre));
ipcMain.handle('audio:reorder', (_, projet, orderedFiles) => renumerotePistes(projet, orderedFiles));

ipcMain.handle('background:set', (_, projet, chemin) => setBackground(projet, chemin));
ipcMain.handle('background:get', (_, projet) => getBackgroundPath(projet));

ipcMain.handle('citations:list', () => listerFichiersCitations());

ipcMain.handle('pipeline:run', (_, projet, test) => lancerPipeline(projet, test));
ipcMain.handle('pipeline:running', () => pipelineProcess !== null);

ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
ipcMain.handle('shell:showItem', (_, p) => shell.showItemInFolder(p));

ipcMain.handle('dialog:openFile', async (_, opts) => {
    const result = await dialog.showOpenDialog(win, opts);
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('config:save', (_, projet, jsonStr) => {
    const fichier = path.join(projetsDir(), projet, 'projet.json');
    fs.writeFileSync(fichier, jsonStr, 'utf-8');
});

ipcMain.handle('config:read', (_, projet) => {
    const fichier = path.join(projetsDir(), projet, 'projet.json');
    try { return JSON.parse(fs.readFileSync(fichier, 'utf-8')); } catch { return {}; }
});

ipcMain.handle('fonts:browse', async () => {
    const result = await dialog.showOpenDialog(win, {
        title: 'Choisir une police',
        filters: [{ name: 'Polices', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
        properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('citations:openFile', (_, theme) => {
    const fichier = path.join(RACINE, 'citations', `${theme}.txt`);
    if (fs.existsSync(fichier)) shell.openPath(fichier);
});

ipcMain.handle('citations:addFile', async () => {
    const result = await dialog.showOpenDialog(win, {
        title: 'Ajouter un fichier de citations',
        filters: [{ name: 'Citations', extensions: ['txt'] }],
        properties: ['openFile'],
    });
    if (result.canceled) return null;
    const src = result.filePaths[0];
    const nom = path.parse(src).name;
    const dest = path.join(RACINE, 'citations', `${nom}.txt`);
    if (!fs.existsSync(path.join(RACINE, 'citations'))) {
        fs.mkdirSync(path.join(RACINE, 'citations'), { recursive: true });
    }
    fs.copyFileSync(src, dest);
    return nom;
});

ipcMain.handle('projets:outputInfo', (_, nom) => {
    const outDir = path.join(projetsDir(), nom, 'output');
    const mp4 = path.join(outDir, `${nom}.mp4`);
    const recapFile = path.join(outDir, 'recap.json');
    const descFile = path.join(outDir, `${nom}.description.txt`);
    const compiled = fs.existsSync(mp4);
    let recap = {};
    try { recap = JSON.parse(fs.readFileSync(recapFile, 'utf-8')); } catch {}
    let description = '';
    try { description = fs.readFileSync(descFile, 'utf-8'); } catch {}
    return {
        compiled,
        mp4Path: compiled ? mp4 : null,
        outputDir: outDir,
        recap,
        description,
    };
});

ipcMain.handle('app:racine', () => RACINE);
