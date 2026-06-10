const fs = require('fs');

const htmlPath = String.raw`C:\Users\admin-local\Nextcloud\COPIERCREER\PROJETS FINIS\blindteststudio\blindtest_Et_j'ai_crié! (1).html`;

async function repairHtml() {
  if (!fs.existsSync(htmlPath)) {
    console.error("❌ Le fichier HTML n'existe pas :", htmlPath);
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Recherche du tableau JSON des chansons dans le code exporté
  const songsRegex = /const songs=(\[.*\]);(?=\r?\nlet cur=0)/;
  const match = html.match(songsRegex);

  if (!match) {
    console.error("❌ Impossible de trouver les données des chansons dans le fichier HTML.");
    return;
  }

  let songs;
  try {
    songs = JSON.parse(match[1]);
  } catch (e) {
    console.error("❌ Erreur de parsing des chansons :", e);
    return;
  }

  let modified = false;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (!song.mp3Data) {
      console.log(`⏳ Téléchargement de l'extrait pour : ${song.artist} - ${song.title}...`);
      try {
        const response = await fetch('http://localhost:3478/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeUrl: song.youtubeUrl,
            query: `${song.artist || ''} ${song.title || ''}`.trim(),
            start: song.start,
            duration: song.duration,
            artist: song.artist,
            title: song.title
          })
        });

        const data = await response.json();
        if (response.ok && data.ok && data.dataUrl) {
          song.mp3Data = data.dataUrl;
          song.mp3Name = data.filename || `${song.artist} - ${song.title}.mp3`;
          song.mp3FromYoutube = true;
          modified = true;
          console.log(`✅ Succès : L'extrait MP3 a été ajouté.`);
        } else {
          console.error(`❌ Échec pour ${song.title} : ${data.error}`);
        }
      } catch (error) {
        console.error(`❌ Erreur réseau (${error.message}). Le serveur d'extraction est-il bien lancé ?`);
      }
    } else {
      console.log(`⏩ L'extrait MP3 est déjà présent pour : ${song.artist} - ${song.title}`);
    }
  }

  if (modified) {
    const newSongsJson = JSON.stringify(songs);
    html = html.replace(songsRegex, () => `const songs=${newSongsJson};`);
    
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log("\n🎉 Fichier HTML réparé avec succès ! Les extraits MP3 y sont maintenant intégrés.");
  } else {
    console.log("\nℹ Aucune modification n'a été apportée.");
  }
}

repairHtml();