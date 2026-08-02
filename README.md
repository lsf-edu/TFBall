# TFBall Pro

<p align="center">
  <img src="https://img.shields.io/badge/Status-Ready-green" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-Web-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/Type-Tournament%20Manager-orange" alt="Type" />
  <img src="https://img.shields.io/badge/Deployment-GitHub%20Pages-lightgrey" alt="Deployment" />
</p>

TFBall Pro est une application web de gestion de tournois sportifs, pensée pour créer, organiser, suivre et partager des compétitions de manière simple et moderne.

## Project Status

Le projet est actuellement fonctionnel en mode web statique et prêt à être publié sur GitHub Pages pour une utilisation de partage public.

## Overview

TFBall Pro permet de :

- créer un tournoi
- définir les équipes participantes
- générer un tirage automatique
- gérer les matchs et les résultats
- calculer un classement
- partager la vue publique avec le fichier `manager.html`

## Features

- gestion complète des tournois depuis l’interface principale
- vue publique dédiée au suivi du tournoi
- visualisation du calendrier, des résultats et du classement
- sauvegarde locale des données dans le navigateur
- interface simple pour les organisateurs et les spectateurs

## How It Works

1. L’utilisateur crée un tournoi depuis `index.html`
2. Les données sont enregistrées localement dans le navigateur
3. Une vue publique peut être ouverte via `manager.html`
4. Le lien exporté permet de partager le tournoi sans dépendre d’un backend externe

## Project Structure

```text
TFBall-Pro/
├── index.html
├── manager.html
├── app.js
├── styles.css
└── README.md
```

## Run Locally

Tu peux lancer le projet simplement en ouvrant `index.html` dans un navigateur.

Pour un lancement plus propre, utilise :

```bash
python -m http.server 8000
```

Puis ouvre :

```text
http://localhost:8000/
```

## Deploy on GitHub Pages

Pour publier le projet sur GitHub Pages :

1. Crée un dépôt GitHub
2. Envoie les fichiers du projet
3. Va dans les paramètres du dépôt
4. Ouvre `Pages`
5. Choisis la branche `main`
6. Sélectionne le dossier racine `/`
7. Active la publication

### Public URL Example

```text
https://<ton-utilisateur>.github.io/<ton-depot>/manager.html
```

## Technical Note

La page `manager.html` peut être utilisée comme page de suivi publique et lire les données exportées depuis l’URL. Pour un affichage partagé, il n’est pas nécessaire d’ajouter une base de données externe.

## Screenshots

Ajoute ici une capture d’écran du projet pour donner un aperçu visuel sur GitHub.

## License

Ce projet est fourni à titre éducatif et peut être adapté selon tes besoins.
