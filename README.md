# BlindTest Studio

Application éducative de création de blindtests avec génération LLM, préparation audio locale et présentation autonome.

**Version : 1.0.5**

## Fonctionnalités

- Création de blindtests interactifs
- Génération de questions avec LLM
- Signalement des propositions LLM dont le lien au thème est trop vague
- Préparation audio locale
- Normalisation du volume entre chansons pendant la lecture
- Interface utilisateur moderne et réactive
- Mode hors-ligne (PWA)
- Révélation artiste/titre globale ou indépendante par vignette
- Export HTML autonome avec audio embarqué quand disponible
- Export HTML autonome avec normalisation audio intégrée

## Technologies utilisées

- HTML5, CSS3, JavaScript (ES6+)
- Service Worker pour le mode hors-ligne
- Web Audio API pour la lecture audio
- Web Audio API `DynamicsCompressorNode` pour lisser les écarts de volume
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

La lecture audio applique automatiquement une normalisation en temps réel afin de limiter les différences de volume entre les extraits.

## Génération LLM

La génération de playlist accepte les réponses JSON directes ou enveloppées par un worker Albert/n8n, par exemple `songs`, `playlist`, `output`, `response` ou `data`.

Les prompts demandent un lien vérifiable avec le thème (titre, paroles, sujet, clip ou contexte culturel connu). Les justifications vagues sont signalées dans le tableau de validation.

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
