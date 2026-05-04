/**
 * EECS Subject Groupings — official lists from
 * https://catalog.mit.edu/degree-charts/eecs-subject-groupings/
 *
 * These are referenced from major requirement structures (e.g., "at least 2
 * subjects from the AUS list", "at least 1 from Independent Inquiry").
 *
 * Subject IDs use the canonical "X.YYYY" form. Joint-listed subjects keep
 * their primary number; the engine resolves cross-listings via the course
 * data's `jointSubjects` field.
 *
 * Last verified: 2025-2026 catalog; Independent Inquiry list extended to match
 * EECS chart II subjects also used on the Fall 2026 / Fall 2025+ cohort chart
 * (e.g. 6.C395, 6.4300, 6.C01).
 */

export const GROUPINGS_SOURCE_URL =
  "https://catalog.mit.edu/degree-charts/eecs-subject-groupings/";

/** "Advanced Undergraduate Subjects (AUS) 2" — used by 6-3 and others. */
export const ADVANCED_UNDERGRAD_SUBJECTS: string[] = [
  "6.1040",
  "6.1060",
  "6.1100",
  "6.1120",
  "6.1420",
  "6.1600",
  "6.1810",
  "6.1820",
  "6.1920",
  "6.2040",
  "6.2050",
  "6.2060",
  "6.2061",
  "6.2080",
  "6.2090",
  "6.2200",
  "6.2220",
  "6.2221",
  "6.2400",
  "6.2530",
  "6.3100",
  "6.3260",
  "6.3720",
  "6.3730",
  "6.4210",
  "6.4400",
  "6.4420",
  "6.4510",
  "6.4830",
  "6.4860",
  "6.5081",
  "6.5151",
  "6.5831",
  "6.5931",
  "6.6331",
  "6.7120",
  "6.8301",
  "6.8371",
  "6.8611",
  "6.8701",
  "6.8711",
  "6.8721",
  "6.8801",
  "6.9000",
  "6.C25",
  "6.C27",
  "6.C571",
  "18.404",
];

/** "Independent Inquiry" subject list. */
export const INDEPENDENT_INQUIRY_SUBJECTS: string[] = [
  "6.1040",
  "6.1060",
  "6.1100",
  "6.1120",
  "6.1420",
  "6.1820",
  "6.1850",
  "6.2040",
  "6.2050",
  "6.2061",
  "6.2221",
  "6.2370",
  "6.2410",
  "6.3730",
  "6.4120",
  "6.4200",
  "6.4210",
  "6.4300",
  "6.4420",
  "6.4510",
  "6.4530",
  "6.4590",
  "6.4610",
  "6.4880",
  "6.5151",
  "6.8301",
  "6.8611",
  "6.8701",
  "6.9000",
  "6.9030",
  "6.C01",
  "6.C011",
  "6.C25",
  "6.C35",
  "6.C395",
  "6.UAR",
];

/** "Communication-Intensive in the Major (CI-M)" subject list. */
export const COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS: string[] = [
  "6.1800",
  "6.1850",
  "6.2040",
  "6.2050",
  "6.2060",
  "6.2061",
  "6.2220",
  "6.2221",
  "6.2370",
  "6.2600",
  "6.4200",
  "6.4210",
  "6.4590",
  "6.4860",
  "6.4880",
  "6.8301",
  "6.8611",
  "6.9030",
  "6.UAR",
  "6.UAT",
];

/** "Advanced Departmental Laboratory Subjects" list. */
export const ADVANCED_DEPT_LAB_SUBJECTS: string[] = [
  "6.1040",
  "6.1060",
  "6.1100",
  "6.1820",
  "6.1920",
  "6.2040",
  "6.2050",
  "6.2060",
  "6.2061",
  "6.2090",
  "6.2092",
  "6.2220",
  "6.2221",
  "6.2370",
  "6.2410",
  "6.2540",
  "6.2600",
  "6.3100",
  "6.4200",
  "6.4400",
  "6.4420",
  "6.4550",
  "6.4570",
  "6.4860",
  "6.4880",
  "6.5081",
  "6.8301",
  "6.8611",
  "6.8701",
  "6.8801",
  "6.9030",
  "6.C35",
];

/** "Probability Grounding Subjects" list — required by most majors. */
export const PROBABILITY_GROUNDING_SUBJECTS: string[] = [
  "6.1200", // Mathematics for Computer Science
  "6.3700", // Introduction to Probability
  "6.3800", // Introduction to Inference
  "18.05", // Introduction to Probability and Statistics
  "18.600", // Probability and Random Variables
];

/** "Project-Based Design Lab (PLAB)" list — used by 6-5. */
export const PROJECT_BASED_LAB_SUBJECTS: string[] = [
  "6.1100",
  "6.1820",
  "6.2040",
  "6.2050",
  "6.2060",
  "6.2220",
  "6.2370",
  "6.2410",
  "6.2600",
  "6.4200",
  "6.4420",
  "6.4510",
  "6.4550",
  "6.4860",
];

/**
 * AI+D-specific Advanced Undergraduate Subjects (from the 6-4 chart).
 * This is a subset of the general AUS list, restricted to AI+D-relevant
 * subjects. Used as one of the 6-4 elective slots.
 */
export const AI_D_ADVANCED_UNDERGRAD_SUBJECTS: string[] = [
  "6.3020",
  "6.3730",
  "6.4210",
  "6.4300",
  "6.5151",
  "6.5831",
  "6.5931",
  "6.7411",
  "6.8371",
  "6.8611",
  "6.8701",
  "6.8711",
  "6.8801",
  "18.404",
];

/** SERC-qualified subjects (Social and Ethical Responsibilities of Computing). */
export const SERC_SUBJECTS: string[] = [
  "6.3900",
  "6.3950",
  "6.4300",
  "6.4590",
  "6.8611",
  "6.C01",
  "6.C40",
];
