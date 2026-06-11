# BlindTest Studio

Application éducative de création de blindtests avec génération LLM, préparation audio locale et présentation autonome.

**Version : 1.0.3**

## Fonctionnalités

- Création de blindtests interactifs
- Génération de questions avec LLM
- Préparation audio locale
- Interface utilisateur moderne et réactive
- Mode hors-ligne (PWA)
- Révélation artiste/titre globale ou indépendante par vignette
- Export HTML autonome avec audio embarqué quand disponible

## Technologies utilisées

- HTML5, CSS3, JavaScript (ES6+)
- Service Worker pour le mode hors-ligne
- Web Audio API pour la lecture audio
- LocalStorage pour le stockage local

## Installation

1. Clonez le dépôt
2. Ouvrez `public/index.html` dans votre navigateur
3. L'application fonctionne en mode hors-ligne une fois installée

## Utilisation

1. Créez un nouveau blindtest
2. Générez des questions avec l'IA
3. Ajoutez vos fichiers audio
4. Lancez le blindtest
5. Utilisez le bouton de révélation principal pour toutes les vignettes, ou le bouton d'une vignette pour ne révéler que celle-ci

## Structure du projet

- `public/index.html` : Point d'entrée principal
- `public/manifest.json` : Configuration PWA
- `public/sw.js` : Service worker pour le mode hors-ligne
- `public/audio-extract-server.js` : Serveur pour l'extraction audio
- `blindtest_*.html` : Exports autonomes générés

## Fichiers ignores

Les caches audio, extraits `.mp3/.webm`, fichiers temporaires, scripts de test locaux et exports réduits `*_reduit.html` ne sont pas destinés au dépôt.

## Licence

MIT
