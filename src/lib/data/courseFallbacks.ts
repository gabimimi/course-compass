/**
 * Minimal Course rows merged into the corpus when missing from `courses.json`.
 * Covers subjects required by the requirement trees but sometimes omitted from an
 * older local snapshot (e.g. before department filters expanded in fetch-courses).
 */

import type { Course } from "@/lib/data/types";

const catalog = (id: string) =>
  `https://catalog.mit.edu/search/?P=${encodeURIComponent(id)}`;

export const COURSE_ID_FALLBACKS: Course[] = [
  {
    id: "3.091",
    title: "Introduction to Solid-State Chemistry",
    description:
      "GIR chemistry option (Materials Science). Same catalog requirements as in FireRoad.",
    totalUnits: 12,
    level: "U",
    girAttribute: "CHEM",
    department: "3",
    offered: { fall: true, spring: true, iap: false, summer: false },
    instructors: [],
    jointSubjects: [],
    meetsWith: [],
    relatedSubjects: [],
    catalogUrl: catalog("3.091"),
    meetings: [],
  },
  {
    id: "CMS.303",
    title: "DJ History, Technique, and Technology",
    description:
      "Comparative Media Studies. Included when local FireRoad snapshot omits CMS subjects.",
    totalUnits: 12,
    level: "U",
    department: "CMS",
    offered: { fall: true, spring: true, iap: false, summer: false },
    instructors: [],
    jointSubjects: [],
    meetsWith: [],
    relatedSubjects: [],
    catalogUrl: catalog("CMS.303"),
    meetings: [],
  },
];
