# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [1.0.6] - 2026-06-12

### Corrections
- Correction du cache par défaut du service d'extraction audio : les fichiers temporaires sont maintenant stockés hors de `public/`.
- Message plus clair lorsque le service audio local `localhost:3478` n'est pas joignable.

### Maintenance
- Mise à jour du cache PWA du service worker.

## [1.0.5] - 2026-06-12

### Corrections
- Renforcement des consignes LLM pour exiger un lien concret et vérifiable entre chaque chanson et le thème.
- Signalement dans le tableau des justifications trop vagues ou suspectes, notamment pour les thèmes abstraits comme les vacances.

### Maintenance
- Mise à jour du cache PWA du service worker.

## [1.0.4] - 2026-06-12

### Ajouts
- Ajout d'une normalisation du volume via Web Audio API pour réduire les écarts sonores entre les chansons.
- Injection de cette normalisation dans les exports HTML autonomes générés.

### Corrections
- Amélioration de la lecture des réponses Albert/n8n : prise en charge des réponses enveloppées (`songs`, `playlist`, `output`, `data`, etc.).
- Extraction JSON plus robuste lorsque le LLM ajoute du texte, du markdown ou des balises de raisonnement autour de la réponse.

### Maintenance
- Mise à jour du cache PWA du service worker.

## [1.0.3] - 2026-06-11

### Corrections
- Correction du bouton de révélation artiste/titre : le bouton général agit sur toutes les vignettes, tandis que le bouton d'une vignette ne modifie plus que cette vignette.
- Mise à jour du modèle d'export pour que les blindtests générés conservent ce comportement en mode autonome.

### Maintenance
- Nettoyage des fichiers temporaires, caches audio et exports réduits générés localement.
- Simplification du `.gitignore` avec des règles génériques pour les artefacts audio, caches et fichiers de test locaux.
- Mise à jour du cache PWA du service worker.

## [1.0.2] - 2025-06-09

### Modifications
- Mise à jour de index.html

## [Unreleased]
### Ajouts
- Ajout de la fonctionnalité de recherche de chansons
- Ajout de la fonctionnalité de création de playlists
- Ajout de la fonctionnalité d'authentification utilisateur

### Corrections
- Correction du bug d'affichage des titres de chansons
- Correction du bug de sauvegarde des préférences utilisateur

### Améliorations
- Amélioration de l'interface utilisateur
- Optimisation des performances de recherche
- Amélioration de la gestion des erreurs

## [1.0.0] - 2023-XX-XX

### Ajouts
- Projet initial

### Corrections
- Aucun

### Améliorations
- Aucun

## [0.1.0] - 2023-XX-XX

### Ajouts
- Structure de base du projet

### Corrections
- Aucun

### Améliorations
- Aucun
