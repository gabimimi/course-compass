/**
 * Canonical types used throughout Course Compass.
 * Shapes are derived from the FireRoad API but normalized for our use.
 */

export type GirAttribute =
  | "PHY1"
  | "PHY2"
  | "CHEM"
  | "BIOL"
  | "CAL1"
  | "CAL2"
  | "REST"
  | "LAB"
  | "LAB2";

export type HassAttribute = "HASS-A" | "HASS-S" | "HASS-H" | "HASS-E";

export type CommunicationRequirement = "CI-H" | "CI-HW" | "CI-M";

export type Term = "fall" | "spring" | "iap" | "summer";

export interface MeetingTime {
  /** "M" | "T" | "W" | "R" | "F" | "S" | "U" — single character per day */
  day: "M" | "T" | "W" | "R" | "F" | "S" | "U";
  /** Hour in 24-hour time, e.g., 9 means 9:00 AM, 14.5 means 2:30 PM */
  startHour: number;
  endHour: number;
  location?: string;
  /** "Lecture" | "Recitation" | "Lab" | "Design" */
  kind?: string;
}

export interface Course {
  /** e.g., "6.1010" */
  id: string;
  title: string;
  description: string;
  totalUnits: number;
  level: "U" | "G";

  girAttribute?: GirAttribute;
  hassAttribute?: HassAttribute;
  communicationRequirement?: CommunicationRequirement;

  prerequisitesRaw?: string;
  corequisitesRaw?: string;

  offered: {
    fall: boolean;
    spring: boolean;
    iap: boolean;
    summer: boolean;
  };

  instructors: string[];
  /** Sibling subject IDs that are joint listings (same class, different number). */
  jointSubjects: string[];
  /** Subjects this is "meets with" (separate course numbers, shared meetings). */
  meetsWith: string[];
  /** Related subjects per FireRoad (used as a fallback signal in retrieval). */
  relatedSubjects: string[];
  /** Department ID, e.g., "6", "18", "8". */
  department: string;

  /** URL to the official MIT catalog entry. */
  catalogUrl: string;

  /** Average student rating from FireRoad (0–7), if available. */
  rating?: number;

  /**
   * Parsed meeting times for the most recent term we have data for.
   * If unavailable, this is empty (the user should treat schedule as TBA).
   */
  meetings: MeetingTime[];
  /** Raw schedule string from FireRoad (preserved for debugging/citation). */
  scheduleRaw?: string;
}

export interface CourseIndex {
  /** Generation timestamp. */
  generatedAt: string;
  /** All Course 6 (+ key cross-listed) subjects. */
  courses: Course[];
}

export interface EmbeddingIndex {
  generatedAt: string;
  model: string;
  dim: number;
  /** Parallel arrays: ids[i] corresponds to vectors[i]. */
  ids: string[];
  vectors: number[][];
}
