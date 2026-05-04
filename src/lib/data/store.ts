/**
 * Server-side data store: loads the course corpus and embedding index once
 * and keeps them in memory for the lifetime of the Node process.
 *
 * This file imports JSON files via `fs` so it can run inside Next.js API
 * routes without bundler issues. The data files are produced by the
 * `npm run build:data` pipeline.
 */

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Course, CourseIndex, EmbeddingIndex } from "@/lib/data/types";

let coursesCache: Course[] | null = null;
let courseByIdCache: Map<string, Course> | null = null;
let embeddingsCache: EmbeddingIndex | null = null;

async function loadJson<T>(rel: string): Promise<T> {
  const p = path.join(process.cwd(), rel);
  const text = await readFile(p, "utf-8");
  return JSON.parse(text) as T;
}

export async function getCourses(): Promise<Course[]> {
  if (coursesCache) return coursesCache;
  const idx = await loadJson<CourseIndex>("data/build/courses.json");
  coursesCache = idx.courses;
  courseByIdCache = new Map(idx.courses.map((c) => [c.id, c]));
  return coursesCache;
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  if (!courseByIdCache) await getCourses();
  return courseByIdCache?.get(id);
}

export async function getEmbeddings(): Promise<EmbeddingIndex> {
  if (embeddingsCache) return embeddingsCache;
  embeddingsCache = await loadJson<EmbeddingIndex>(
    "data/build/embeddings.json",
  );
  return embeddingsCache;
}
