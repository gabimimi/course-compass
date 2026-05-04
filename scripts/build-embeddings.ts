/**
 * Builds an embedding index over Course 6 (and key cross-listed) subjects so
 * that the chat agent can do semantic retrieval ("what classes teach
 * distributed systems?").
 *
 * We embed only the Course 6 subjects (the rest of the corpus is reachable
 * by structured filters anyway). This keeps the index small and fast.
 *
 * Run with:  npm run build:embeddings
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";
import type { CourseIndex, EmbeddingIndex } from "../src/lib/data/types";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH = 32;

async function main() {
  const cwd = process.cwd();
  const coursesPath = path.join(cwd, "data/build/courses.json");
  const raw = await readFile(coursesPath, "utf-8");
  const index = JSON.parse(raw) as CourseIndex;

  // Embed the union of Course 6 subjects + cross-listed siblings of Course 6.
  // Other courses (math, HASS, etc.) are reachable by exact-id and tag-filter
  // queries, which don't need embeddings.
  const targetSet = new Set<string>();
  for (const c of index.courses) {
    if (c.department === "6") {
      targetSet.add(c.id);
      for (const j of c.jointSubjects) targetSet.add(j);
      for (const m of c.meetsWith) targetSet.add(m);
    }
  }
  const targets = index.courses.filter((c) => targetSet.has(c.id));
  console.log(`[embed] target subjects: ${targets.length}`);

  console.log(`[embed] loading model: ${MODEL}`);
  const extractor = await pipeline("feature-extraction", MODEL, {
    // Use quantized weights for smaller memory footprint at insignificant
    // quality cost for short passages.
    dtype: "fp32",
  });

  const ids: string[] = [];
  const vectors: number[][] = [];

  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const texts = slice.map(textFor);
    const out = await extractor(texts, {
      pooling: "mean",
      normalize: true,
    });
    // Output is a Tensor of shape [batch, dim]
    const data = out.tolist() as number[][];
    for (let j = 0; j < slice.length; j++) {
      ids.push(slice[j].id);
      vectors.push(data[j]);
    }
    if ((i / BATCH) % 5 === 0) {
      console.log(`  ${Math.min(i + BATCH, targets.length)}/${targets.length}`);
    }
  }

  const dim = vectors[0]?.length ?? 0;
  const out: EmbeddingIndex = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    dim,
    ids,
    vectors,
  };

  const outDir = path.join(cwd, "data/build");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "embeddings.json");
  await writeFile(outPath, JSON.stringify(out));
  const sizeMb = (JSON.stringify(out).length / 1_000_000).toFixed(2);
  console.log(`[write] ${outPath}  (${sizeMb} MB, dim=${dim})`);
}

function textFor(c: { id: string; title: string; description: string }): string {
  return `${c.id} — ${c.title}\n${c.description}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
