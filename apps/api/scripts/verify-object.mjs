// De-risque : valide la qualité du rendu OBJET (fidélité + scène texte) avant de brancher.
// 1. génère une photo d'objet test (vase) ; 2. Nano « mise en situation » + « studio uni ».
import { fal } from '@fal-ai/client';
import { writeFile } from 'node:fs/promises';

fal.config({ credentials: process.env.FAL_KEY });
const save = async (url, out) => {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(out, buf);
  return `${Math.round(buf.length / 1024)} Ko`;
};

// Objet test : packshot d'un vase céramique sur fond blanc (ce qu'une boutique photographierait).
console.log('1) objet test (vase céramique, packshot blanc) …');
const obj = await fal.subscribe('fal-ai/flux/schnell', {
  input: {
    prompt:
      'E-commerce product packshot of a single handmade beige stoneware ceramic vase with a matte ' +
      'speckled glaze and a rounded organic shape, centered on a pure white seamless background, ' +
      'soft even studio lighting, photorealistic, high detail.',
    image_size: 'portrait_4_3',
    num_images: 1,
  },
  logs: false,
});
const objUrl = obj.data.images[0].url;
await save(objUrl, '/tmp/obj-src.png');
console.log('   → /tmp/obj-src.png');

const FIDELITY =
  "Photo produit e-commerce professionnelle : le MÊME objet que sur l'image source. Garde sa forme, " +
  'sa matière, sa couleur, son motif et ses proportions STRICTEMENT identiques — ne modifie AUCUN détail ' +
  "de l'objet.";

async function render(label, prompt, out) {
  const r = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
    input: { prompt, image_urls: [objUrl], num_images: 1, output_format: 'png', resolution: '2K' },
    logs: false,
  });
  console.log(`   ${label} →`, await save(r.data.images[0].url, out));
}

console.log('2) mise en situation (bois clair · salon minimal · lumière douce) …');
await render(
  'mise-en-situation',
  FIDELITY +
    " Mets l'objet en situation dans une scène d'intérieur réaliste et vendeuse (lifestyle). " +
    'Pose-le sur une surface en bois clair, devant un arrière-plan de salon minimaliste (mur clair, ' +
    'décor épuré). Éclairage doux et naturel. Accessoires discrets : quelques livres et une branche. ' +
    'Rendu photoréaliste, cadrage produit centré.',
  '/tmp/obj-scene.png',
);

console.log('3) studio uni …');
await render(
  'studio-uni',
  FIDELITY +
    ' Présente-le en packshot studio sur un fond uni crème clair, éclairage studio doux et homogène, ' +
    'ombre portée subtile, cadrage produit centré, photoréaliste.',
  '/tmp/obj-studio.png',
);
console.log('FIN');
