# BlindTest Studio

Application éducative de création de blindtests avec génération LLM, préparation audio locale et présentation autonome.

## Fonctionnalités

- Création de blindtests interactifs
- Génération de questions avec LLM
- Préparation audio locale
- Interface utilisateur moderne et réactive
- Mode hors-ligne (PWA)

## Technologies utilisées

- HTML5, CSS3, JavaScript (ES6+)
- Service Worker pour le mode hors-ligne
- Web Audio API pour la lecture audio
- LocalStorage pour le stockage local

## Installation

1. Clonez le dépôt
2. Ouvrez `index.html` dans votre navigateur
3. L'application fonctionne en mode hors-ligne une fois installée

## Utilisation

1. Créez un nouveau blindtest
2. Générez des questions avec l'IA
3. Ajoutez vos fichiers audio
4. Lancez le blindtest

## Structure du projet

- `index.html` : Point d'entrée principal
- `manifest.json` : Configuration PWA
- `sw.js` : Service worker pour le mode hors-ligne
- `audio-extract-server.js` : Serveur pour l'extraction audio

## Licence

MIT
