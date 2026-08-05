'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Projets
    listProjets: () => ipcRenderer.invoke('projets:list'),
    createProjet: (nom) => ipcRenderer.invoke('projets:create', nom),
    deleteProjet: (nom) => ipcRenderer.invoke('projets:delete', nom),

    outputInfo: (projet) => ipcRenderer.invoke('projets:outputInfo', projet),

    // Audio
    listPistes: (projet) => ipcRenderer.invoke('audio:list', projet),
    addAudio: (projet, chemins) => ipcRenderer.invoke('audio:add', projet, chemins),
    deleteAudio: (projet, fichier) => ipcRenderer.invoke('audio:delete', projet, fichier),
    renameAudio: (projet, fichier, titre) => ipcRenderer.invoke('audio:rename', projet, fichier, titre),
    reorderAudio: (projet, orderedFiles) => ipcRenderer.invoke('audio:reorder', projet, orderedFiles),

    // Background
    setBackground: (projet, chemin) => ipcRenderer.invoke('background:set', projet, chemin),
    getBackground: (projet) => ipcRenderer.invoke('background:get', projet),

    // Citations
    listCitations: () => ipcRenderer.invoke('citations:list'),

    // Config
    saveConfig: (projet, jsonStr) => ipcRenderer.invoke('config:save', projet, jsonStr),
    readConfig: (projet) => ipcRenderer.invoke('config:read', projet),
    browseFont: () => ipcRenderer.invoke('fonts:browse'),
    openCitationFile: (theme) => ipcRenderer.invoke('citations:openFile', theme),
    addCitationFile: () => ipcRenderer.invoke('citations:addFile'),

    // Pipeline
    runPipeline: (projet, test) => ipcRenderer.invoke('pipeline:run', projet, test),
    isRunning: () => ipcRenderer.invoke('pipeline:running'),
    onPipelineLog: (cb) => ipcRenderer.on('pipeline:log', (_, data) => cb(data)),
    onPipelineDone: (cb) => ipcRenderer.on('pipeline:done', (_, code) => cb(code)),

    // Shell / Dialog
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
    openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    getRacine: () => ipcRenderer.invoke('app:racine'),
});
