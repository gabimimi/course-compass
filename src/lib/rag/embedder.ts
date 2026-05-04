/**
 * Loads the same all-MiniLM-L6-v2 model used at index build time and embeds
 * a single user query. The pipeline is cached across invocations.
 */

import "server-only";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
let pipelineP: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelineP) {
    pipelineP = pipeline("feature-extraction", MODEL, {
      dtype: "fp32",
    }) as Promise<FeatureExtractionPipeline>;
  }
  return pipelineP;
}

export async function embedQuery(text: string): Promise<number[]> {
  const ex = await getPipeline();
  const out = await ex(text, { pooling: "mean", normalize: true });
  const arr = (out.tolist() as number[][])[0];
  return arr;
}
