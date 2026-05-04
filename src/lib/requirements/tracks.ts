/**
 * EECS Tracks — official lists from
 * https://catalog.mit.edu/degree-charts/electrical-engineering-computer-science-tracks/
 *
 * Last verified: Fall 2026 subject listings (degree chart; Fall 2025+ cohort).
 */

import type { RequirementNode } from "@/lib/requirements/types";

export const TRACKS_SOURCE_URL =
  "https://catalog.mit.edu/degree-charts/electrical-engineering-computer-science-tracks/";

export type TrackArea = "cs" | "ai_d" | "ee";

/**
 * “One of column A and one of column B” (two distinct subjects). Lists may overlap;
 * the evaluator allocates slot1 before slot2 so one completion cannot satisfy both.
 */
export interface TrackPairSlots {
  slot1: string[];
  slot2: string[];
  slotTitles: [string, string];
}

export interface Track {
  id: string;
  area: TrackArea;
  name: string;
  subjects: string[];
  subRulesNote?: string;
  pairSlots?: TrackPairSlots;
}

/** Application CI-M or AI+D AUS column (MIT EECS tracks chart). */
const APPLICATION_CIM_OR_AI_D_AUS_SUBJECTS = u(
  "18.404",
  "6.3730",
  "6.4200",
  "6.4210",
  "6.5151",
  "6.5831",
  "6.7411",
  "6.8301",
  "6.8371",
  "6.8611",
  "6.8701",
  "6.8711",
);

/** “Centers” column under Centers + (Application CI-M or AI+D AUS) on the chart. */
const AI_D_CENTERS_COLUMN_SUBJECTS = u(
  "6.1220",
  "6.3000",
  "6.3100",
  "6.3260",
  "6.3720",
  "6.3730",
  "6.3900",
  "6.3950",
  "6.4100",
  "6.4110",
  "6.4120",
  "6.4200",
  "6.4400",
  "6.4590",
  "6.5151",
  "6.5831",
  "6.7411",
  "6.8301",
  "6.8371",
  "6.8611",
  "6.8701",
  "6.C35",
  "6.C571",
  "9.660",
  "18.404",
);

/** Hardware & Software: second column (“and one of the following…”). */
const EE_HW_SW_COLUMN_2_SUBJECTS = u(
  "18.404",
  "6.1040",
  "6.1060",
  "6.1100",
  "6.1120",
  "6.1220",
  "6.1400",
  "6.1420",
  "6.1600",
  "6.1810",
  "6.1820",
  "6.1850",
  "6.3900",
  "6.4500",
  "6.4510",
  "6.4550",
  "6.4590",
  "6.5081",
  "6.5831",
  "6.C35",
);

function u(...ids: string[]): string[] {
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Computer Science tracks
// ---------------------------------------------------------------------------

export const TRACKS: Track[] = [
  {
    id: "cs.architecture",
    area: "cs",
    name: "Computer Architecture",
    subjects: [
      "6.1920",
      "6.2050",
      "6.2060",
      "6.5890",
      "6.5900",
      "6.5930",
      "6.5931",
      "6.5940",
      "6.5951",
    ],
    subRulesNote:
      "Students can take 6.2050 OR 6.2060, but not both (see chart).",
  },
  {
    id: "cs.society",
    area: "cs",
    name: "Computers and Society",
    subjects: ["6.1850", "6.1852", "6.3950", "6.4590", "6.8530", "6.C35", "6.C395", "6.C85"],
  },
  {
    id: "cs.hci",
    area: "cs",
    name: "Human Computer Interaction",
    subjects: [
      "6.1040",
      "6.4500",
      "6.4510",
      "6.4530",
      "6.4550",
      "6.8510",
      "6.8530",
      "6.C35",
      "6.C85",
    ],
  },
  {
    id: "cs.programming",
    area: "cs",
    name: "Programming Principles and Tools",
    subjects: [
      "6.1040",
      "6.1060",
      "6.1100",
      "6.1120",
      "6.5060",
      "6.5080",
      "6.5081",
      "6.5110",
      "6.5120",
    ],
  },
  {
    id: "cs.systems",
    area: "cs",
    name: "Systems",
    subjects: [
      "6.1600",
      "6.1810",
      "6.1820",
      "6.5610",
      "6.5660",
      "6.5810",
      "6.5820",
      "6.5830",
      "6.5831",
      "6.5840",
      "6.5850",
    ],
  },
  {
    id: "cs.theory",
    area: "cs",
    name: "Theory",
    subjects: [
      "18.404",
      "6.1220",
      "6.1400",
      "6.1420",
      "6.5060",
      "6.5210",
      "6.5220",
      "6.5230",
      "6.5240",
      "6.5250",
      "6.5310",
      "6.5320",
      "6.5340",
      "6.5350",
      "6.5370",
      "6.5380",
      "6.5390",
      "6.5400",
      "6.5410",
      "6.5420",
      "6.5430",
      "6.5480",
      "6.5490",
      "6.5620",
      "6.5630",
      "6.6410",
    ],
  },

  // -------------------------------------------------------------------------
  // AI+D tracks
  // -------------------------------------------------------------------------

  {
    id: "ai_d.application_cim_or_aus",
    area: "ai_d",
    name: "Application CI-M or AI+D AUS",
    subjects: [
      "18.404",
      "6.3020",
      "6.3730",
      "6.4200",
      "6.4210",
      "6.4300",
      "6.4610",
      "6.5151",
      "6.5831",
      "6.5931",
      "6.7411",
      "6.8371",
      "6.8611",
      "6.8701",
      "6.8711",
      "6.8801",
    ],
  },
  {
    id: "ai_d.centers",
    area: "ai_d",
    name: "Centers and (Application CI-M or AI+D AUS)",
    subjects: u(...AI_D_CENTERS_COLUMN_SUBJECTS, ...APPLICATION_CIM_OR_AI_D_AUS_SUBJECTS),
    pairSlots: {
      slot1: AI_D_CENTERS_COLUMN_SUBJECTS,
      slot2: APPLICATION_CIM_OR_AI_D_AUS_SUBJECTS,
      slotTitles: [
        "Centers list (one of)",
        "Application CI-M or AI+D AUS (one of)",
      ],
    },
    subRulesNote:
      "Complete one subject listed under the Centers column and one from the Application CI-M or AI+D AUS offerings (two distinct subjects).",
  },

  // -------------------------------------------------------------------------
  // Electrical Engineering tracks
  // -------------------------------------------------------------------------

  {
    id: "ee.biomedical",
    area: "ee",
    name: "Biomedical Systems",
    subjects: u("6.4800", "6.4810", "6.4820", "6.4830", "6.4860"),
    pairSlots: {
      slot1: ["6.4800"],
      slot2: ["6.4810", "6.4820", "6.4830", "6.4860"],
      slotTitles: [
        "6.4800 Imaging (required pairing anchor)",
        "One of the physiology / systems subjects",
      ],
    },
    subRulesNote:
      "6.4800 plus one of 6.4810, 6.4820, 6.4830, or 6.4860 per the official tracks chart.",
  },
  {
    id: "ee.communications",
    area: "ee",
    name: "Communications and Networks",
    subjects: u("6.7411", "6.1800", "6.3000", "6.3010"),
    pairSlots: {
      slot1: ["6.7411"],
      slot2: ["6.1800", "6.3000", "6.3010"],
      slotTitles: ["6.7411 Principles of Digital Communication", "One of the paired subjects"],
    },
    subRulesNote: "6.7411 plus one of 6.1800, 6.3000, or 6.3010.",
  },
  {
    id: "ee.architecture",
    area: "ee",
    name: "Computer Architecture",
    subjects: [
      "6.1920",
      "6.2050",
      "6.2060",
      "6.5890",
      "6.5900",
      "6.5930",
      "6.5931",
      "6.5940",
      "6.5951",
    ],
    subRulesNote:
      "Students can take 6.2050 OR 6.2060, but not both (see chart).",
  },
  {
    id: "ee.devices_circuits",
    area: "ee",
    name: "Devices, Circuits, and Systems",
    subjects: u(
      "6.2040",
      "6.2050",
      "6.2060",
      "6.2080",
      "6.2090",
      "6.2220",
      "6.2221",
      "6.2300",
      "6.2320",
      "6.2500",
    ),
    pairSlots: {
      slot1: ["6.2040", "6.2080", "6.2090"],
      slot2: [
        "6.2040",
        "6.2050",
        "6.2060",
        "6.2080",
        "6.2090",
        "6.2220",
        "6.2221",
        "6.2300",
        "6.2320",
        "6.2500",
      ],
      slotTitles: [
        "First column (one of lab / devices intro)",
        "Second column (one of circuits / systems)",
      ],
    },
    subRulesNote:
      "One subject from the first group and one from the second group on the chart (lists overlap; two distinct completions required).",
  },
  {
    id: "ee.electromagnetics",
    area: "ee",
    name: "Electromagnetics and Photonic Systems",
    subjects: ["6.2210", "6.2300", "6.2320", "6.6210", "6.6320", "6.6331"],
  },
  {
    id: "ee.embedded",
    area: "ee",
    name: "Embedded Systems",
    subjects: ["6.1820", "6.2050", "6.2060", "6.4510"],
  },
  {
    id: "ee.energy",
    area: "ee",
    name: "Energy Systems",
    subjects: u("6.2200", "6.2210", "6.2220", "6.2221"),
    pairSlots: {
      slot1: ["6.2200"],
      slot2: ["6.2210", "6.2220", "6.2221"],
      slotTitles: ["6.2200 Electric Energy Systems", "One follow-on subject"],
    },
    subRulesNote: "6.2200 plus one of 6.2210, 6.2220, or 6.2221 per the official tracks chart.",
  },
  {
    id: "ee.hardware_design",
    area: "ee",
    name: "Hardware Design",
    subjects: u("6.1920", "6.2050", "6.2060"),
    pairSlots: {
      slot1: ["6.1920"],
      slot2: ["6.2050", "6.2060"],
      slotTitles: ["6.1920 Constructive Computer Architecture", "6.2050 or 6.2060 (not both overall)"],
    },
    subRulesNote:
      "Chart lists 6.1920 with 6.2050/6.2060; you cannot count both 6.2050 and 6.2060 toward the degree.",
  },
  {
    id: "ee.hw_sw",
    area: "ee",
    name: "Hardware and Software",
    subjects: u("6.1800", ...EE_HW_SW_COLUMN_2_SUBJECTS),
    pairSlots: {
      slot1: ["6.1800"],
      slot2: EE_HW_SW_COLUMN_2_SUBJECTS,
      slotTitles: ["6.1800 Computer Systems Engineering (CI-M)", "Second column (one of)"],
    },
    subRulesNote: "6.1800 plus one subject from the chart’s second column.",
  },
  {
    id: "ee.nanoelectronics",
    area: "ee",
    name: "Nanoelectronics",
    subjects: u("6.2500", "6.2540", "6.2600"),
    pairSlots: {
      slot1: ["6.2500"],
      slot2: ["6.2540", "6.2600"],
      slotTitles: ["6.2500 Nanoelectronics and Computing Systems", "One of the follow-on subjects"],
    },
    subRulesNote: "6.2500 plus one of 6.2540 or 6.2600 per the official tracks chart.",
  },
  {
    id: "ee.quantum",
    area: "ee",
    name: "Quantum Systems Engineering",
    subjects: u("6.2400", "6.2410"),
    pairSlots: {
      slot1: ["6.2400"],
      slot2: ["6.2410"],
      slotTitles: ["6.2400 Introduction to Quantum Systems Engineering", "6.2410 Quantum Engineering Platforms"],
    },
    subRulesNote: "Both subjects on the chart row are required for this track pairing.",
  },
  {
    id: "ee.systems_science",
    area: "ee",
    name: "Systems Science",
    subjects: [
      "6.3000",
      "6.3010",
      "6.3100",
      "6.3260",
      "6.3720",
      "6.3900",
      "6.4110",
      "6.4200",
      "6.4210",
      "6.4300",
      "6.7120",
      "6.7201",
      "6.7960",
      "6.C01",
      "6.C011",
      "6.C27",
      "6.C51",
      "6.C511",
      "6.C571",
    ],
  },
];

export const TRACKS_BY_ID: Record<string, Track> = Object.fromEntries(
  TRACKS.map((t) => [t.id, t]),
);

export function tracksByArea(area: TrackArea): Track[] {
  return TRACKS.filter((t) => t.area === area);
}

export function unionSubjects(area: TrackArea): string[] {
  const seen = new Set<string>();
  for (const t of TRACKS) {
    if (t.area !== area) continue;
    for (const s of t.subjects) seen.add(s);
  }
  return [...seen];
}

export function trackForSubject(subjectId: string): Track | undefined {
  return TRACKS.find((t) => t.subjects.includes(subjectId));
}

export function trackNode(args: {
  id: string;
  trackId: string;
  count: number;
  title?: string;
}): RequirementNode {
  const t = TRACKS_BY_ID[args.trackId];
  if (!t) throw new Error(`Unknown track: ${args.trackId}`);
  if (t.pairSlots) {
    if (args.count !== 2) {
      throw new Error(
        `Track "${args.trackId}" uses column pairings and must be evaluated with count 2 (got ${args.count}).`,
      );
    }
    const ps = t.pairSlots;
    return {
      kind: "all",
      id: args.id,
      title: args.title ?? `${t.name} track (one from each column)`,
      children: [
        {
          kind: "tag",
          id: `${args.id}.slot1`,
          title: ps.slotTitles[0],
          allowedIds: ps.slot1,
          count: 1,
          sourceUrl: TRACKS_SOURCE_URL,
        },
        {
          kind: "tag",
          id: `${args.id}.slot2`,
          title: ps.slotTitles[1],
          allowedIds: ps.slot2,
          count: 1,
          sourceUrl: TRACKS_SOURCE_URL,
        },
      ],
      childrenAllocateDistinctCourses: true,
      description: t.subRulesNote ? `Track: ${t.subRulesNote}` : undefined,
      sourceUrl: TRACKS_SOURCE_URL,
    };
  }
  return {
    kind: "tag",
    id: args.id,
    title: args.title ?? `${args.count} subject${args.count === 1 ? "" : "s"} from ${t.name} track`,
    allowedIds: t.subjects,
    count: args.count,
    description: t.subRulesNote ? `Track sub-rule: ${t.subRulesNote}` : undefined,
    sourceUrl: TRACKS_SOURCE_URL,
  };
}
