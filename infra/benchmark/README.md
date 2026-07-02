# @vitrine/benchmark — Benchmark IA M3.0

Harnais de comparaison des modèles fal.ai candidats pour le moteur de rendu VITRINE,
sur de **vraies photos de vêtements**, AVANT de bâtir le pipeline (M3).
Critères : **fidélité** (texture/motif/couleur/coupe), **latence**, **coût**.

## Modèles benchés (slugs vérifiés sur fal.ai)

| Colonne | Endpoint fal | Rendu | Coût estimé |
|---|---|---|---|
| FASHN v1.6 | `fal-ai/fashn/tryon/v1.6` | `model` (porté par mannequin) | ~0,075 $ |
| Kling Kolors | `fal-ai/kling/v1-5/kolors-virtual-try-on` | `model` (swap candidat) | ~0,07 $ |
| Nano Banana Pro | `fal-ai/nano-banana-pro/edit` | `hanger` / `folded` / `studio` | ~0,134 $ |

Variante Nano moins chère : `fal-ai/nano-banana/edit` (~0,039 $) — swap du slug dans `config.ts`
(`FAL_ENDPOINTS.nanobanana`), penser à ajuster `COST_USD_PER_CALL`.

## Lancer le benchmark

```bash
# 1. Clé API fal (https://fal.ai/dashboard/keys)
export FAL_KEY=xxxxxxxx-xxxx-xxxx-xxxx:yyyyyyyyyyyyyyyy

# 2. Déposer 10-15 photos JPG/PNG de vêtements sur cintre dans :
#    infra/benchmark/inputs/   (cf. inputs/README.md)

# 3. Lancer (depuis la racine du monorepo)
pnpm --filter @vitrine/benchmark bench
```

Chaque vêtement déclenche **5 appels** (FASHN + Kling + Nano ×3) lancés en parallèle,
avec try/catch par appel : un modèle qui échoue n'arrête pas le run.
Coût d'un run complet ≈ **0,55 $ / vêtement** (~8 $ pour 15 photos).

Les images de mannequin par défaut (try-on FASHN/Kling) sont des URLs publiques
placeholder définies dans `config.ts` (`MANNEQUIN_IMAGES`) — **à remplacer** par vos
mannequins de référence pour un benchmark définitif.

## Lire les résultats

Tout est écrit dans `infra/benchmark/outputs/` (gitignoré) :

- `outputs/{vêtement}/{modèle}-{type}.png` — chaque rendu individuel ;
- `outputs/results.json` — données brutes (latence ms, coût, erreurs) ;
- `outputs/report.html` — **ouvrir dans un navigateur** : grille visuelle
  (lignes = vêtements ; colonnes = Source, FASHN, Kling, Nano cintre/plié/studio)
  avec latence & coût par cellule, puis tableau récapitulatif par modèle.

Juger la **fidélité à l'œil** sur la grille (surtout motifs, logos, textes), puis
départager avec le récap latence/coût. Pour regénérer le rapport sans relancer
d'appels : `pnpm --filter @vitrine/benchmark report`.

## Décision attendue en sortie de M3.0

1. `model` → FASHN v1.6 confirmé ? (sinon swap Kling via config, prévu au plan)
2. `hanger|folded|studio` → Nano Banana Pro ou variante Flash (coût ÷3) si fidélité équivalente ?
3. Prompts de `config.ts` (`NANO_PROMPTS`) à affiner selon les dérives observées.
