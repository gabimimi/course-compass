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

export interface Track {
  id: string;
  area: TrackArea;
  name: string;
  subjects: string[];
  subRulesNote?: string;
}

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
    subjects: u(
      // Centers column (one of)
      "6.1220",
      "6.1400",
      "6.3000",
      "6.3100",
      "6.3260",
      "6.3720",
      "6.3900",
      "6.3950",
      "6.4110",
      "6.4120",
      "6.4400",
      "6.4420",
      "6.4590",
      "6.C01",
      "6.C011",
      "6.C35",
      "6.C395",
      "6.C51",
      "6.C511",
      "6.C571",
      "9.660",
      // Application CI-M / AI+D AUS column (one of)
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
    ),
    subRulesNote:
      "Chart: complete one subject from the Centers list and one from the Application CI-M or AI+D AUS list (not two from the same column alone). Course Compass counts any two subjects from the combined list — verify against the official chart.",
  },

  // -------------------------------------------------------------------------
  // Electrical Engineering tracks
  // -------------------------------------------------------------------------

  {
    id: "ee.biomedical",
    area: "ee",
    name: "Biomedical Systems",
    subjects: ["6.4800", "6.4820", "6.4830", "6.4850", "6.4860", "6.C27"],
    subRulesNote:
      "Chart structure may require specific pairings; verify on the official tracks page.",
  },
  {
    id: "ee.communications",
    area: "ee",
    name: "Communications and Networks",
    subjects: ["6.1800", "6.3000", "6.3010", "6.7411"],
    subRulesNote:
      "Chart may require 6.7411 plus one of {6.1800, 6.3000, 6.3010}; Course Compass uses a flat allowlist.",
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
    subjects: [
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
    subRulesNote:
      "Chart: one of {6.2040, 6.2080, 6.2090} and one of the circuits/systems subjects — Course Compass does not enforce the pairing.",
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
    subjects: [
      "6.2200",
      "6.2210",
      "6.2220",
      "6.2221",
      "6.3100",
      "6.6220",
      "6.7120",
      "6.7121",
    ],
    subRulesNote:
      "Chart: 6.2200 plus one of the others — Course Compass uses a flat allowlist.",
  },
  {
    id: "ee.hardware_design",
    area: "ee",
    name: "Hardware Design",
    subjects: ["6.1920", "6.2050", "6.2060", "6.6010"],
    subRulesNote:
      "Students can take 6.2050 OR 6.2060, but not both (see chart).",
  },
  {
    id: "ee.hw_sw",
    area: "ee",
    name: "Hardware and Software",
    subjects: u(
      "6.1800",
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
      "6.1852",
      "6.3950",
      "6.4500",
      "6.4510",
      "6.4530",
      "6.4550",
      "6.4590",
      "6.5060",
      "6.5080",
      "6.5081",
      "6.5110",
      "6.5120",
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
      "6.5610",
      "6.5620",
      "6.5630",
      "6.5660",
      "6.5810",
      "6.5820",
      "6.5830",
      "6.5831",
      "6.5840",
      "6.5850",
      "6.6410",
      "6.8510",
      "6.8530",
      "6.C35",
      "6.C395",
      "6.C85",
    ),
    subRulesNote:
      "Chart: 6.1800 plus one subject from the second column — Course Compass does not enforce the pairing.",
  },
  {
    id: "ee.nanoelectronics",
    area: "ee",
    name: "Nanoelectronics",
    subjects: ["6.2500", "6.2540", "6.2600", "6.6500"],
    subRulesNote:
      "Chart: 6.2500 plus one of {6.2540, 6.2600, 6.6500}.",
  },
  {
    id: "ee.quantum",
    area: "ee",
    name: "Quantum Systems Engineering",
    subjects: ["6.2400", "6.2410", "6.6400", "6.6410", "6.6420", "6.6450"],
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
