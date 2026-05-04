/**
 * Course 6 major requirement data, transcribed from the official MIT catalog
 * degree charts. Each major links to its source URL; if a chart changes, the
 * file's `catalogYear` should be bumped and the structure updated.
 *
 * Sources verified for the 2025-2026 catalog:
 *   - https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/
 *   - https://catalog.mit.edu/degree-charts/artifical-intelligence-decision-making-course-6-4/
 *   - https://catalog.mit.edu/degree-charts/electrical-engineering-computing-6-5/
 *   - https://catalog.mit.edu/degree-charts/computer-science-molecular-biology-course-6-7/
 *   - https://catalog.mit.edu/degree-charts/computation-cognition-6-9/
 *   - https://catalog.mit.edu/degree-charts/computer-science-economics-data-science-course-6-14/
 *   - https://catalog.mit.edu/degree-charts/eecs-subject-groupings/
 *   - https://catalog.mit.edu/degree-charts/electrical-engineering-computer-science-tracks/
 *
 * 6-1 (Electrical Science and Engineering) and 6-2 (EECS) are not currently
 * listed in the catalog as separate degree charts; they may be available
 * under older curriculum requirements but are not modeled here.
 */

import type {
  AllNode,
  AnyNode,
  CourseNode,
  DepartmentNode,
  MajorRequirement,
  RequirementNode,
  TagNode,
  UnitsOutsideGirNode,
} from "@/lib/requirements/types";
import {
  ADVANCED_UNDERGRAD_SUBJECTS,
  AI_D_ADVANCED_UNDERGRAD_SUBJECTS,
  COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS,
  GROUPINGS_SOURCE_URL,
  PROBABILITY_GROUNDING_SUBJECTS,
  PROJECT_BASED_LAB_SUBJECTS,
  SERC_SUBJECTS,
} from "@/lib/requirements/groupings";
import {
  TRACKS,
  trackNode,
  TRACKS_SOURCE_URL,
  type TrackArea,
} from "@/lib/requirements/tracks";
import { EECS_CHART_SUBJECTS } from "@/lib/requirements/eecsChartFall2026";
import {
  AUS2_SUBJECTS,
  CIM2_SUBJECTS,
  GRAD_AI_D_AUS_SUBJECTS,
  GRAD_AUS2_SUBJECTS,
  GRAD_II_SUBJECTS,
  GROUPINGS_FALL2026_NOTE,
  II_UNDERGRAD_SUBJECTS,
  unionDedupe,
} from "@/lib/requirements/groupingsFall2026";

// ---------------------------------------------------------------------------
// DSL helpers
// ---------------------------------------------------------------------------

/** Two 6-3 restricted elective subjects: union of chart “EECS” bucket + grad lists (MATH SB rule not encoded). */
const FLEX_ELECTIVE_IDS_FALL2026 = unionDedupe(
  EECS_CHART_SUBJECTS,
  GRAD_AI_D_AUS_SUBJECTS,
  GRAD_AUS2_SUBJECTS,
  GRAD_II_SUBJECTS,
);

function all(
  id: string,
  title: string,
  children: RequirementNode[],
  extras: Partial<AllNode> = {},
): AllNode {
  return { kind: "all", id, title, children, ...extras };
}

function any(
  id: string,
  title: string,
  children: RequirementNode[],
  extras: Partial<AnyNode> = {},
): AnyNode {
  return { kind: "any", id, title, children, ...extras };
}

function course(
  id: string,
  title: string,
  acceptedIds: string[],
  extras: Partial<CourseNode> = {},
): CourseNode {
  return { kind: "course", id, title, acceptedIds, ...extras };
}

function tag(
  id: string,
  title: string,
  extras: Omit<TagNode, "kind" | "id" | "title"> = {},
): TagNode {
  return { kind: "tag", id, title, ...extras };
}

/**
 * Builds an AnyNode where each child is a per-track TagNode requiring
 * `count` subjects from that specific track. The student satisfies the
 * parent by completing `count` subjects all from one single track.
 *
 * This correctly models constraints like "two subjects from one CS track" —
 * both subjects must be from the SAME track (e.g., both from Systems), NOT
 * one from Systems and one from Theory.
 */
function perTrackAny(
  id: string,
  title: string,
  areas: TrackArea[],
  count: number,
  description: string,
): AnyNode {
  const children = TRACKS.filter((t) => areas.includes(t.area)).map((t) =>
    trackNode({
      id: `${id}.${t.id}`,
      trackId: t.id,
      count,
      title: t.pairSlots
        ? `${t.name} track (one from each column)`
        : `${t.name} track (${count} of: ${t.subjects.join(", ")})`,
    }),
  );
  return {
    kind: "any",
    id,
    title,
    needed: 1,
    children,
    description,
    sourceUrl: TRACKS_SOURCE_URL,
  };
}

function dept(
  id: string,
  title: string,
  department: string,
  extras: Omit<DepartmentNode, "kind" | "id" | "title" | "department"> = {},
): DepartmentNode {
  return { kind: "department", id, title, department, ...extras };
}

// ---------------------------------------------------------------------------
// General Institute Requirements (shared across all majors)
// ---------------------------------------------------------------------------

const GIR_SOURCE =
  "https://registrar.mit.edu/registration-academics/academic-requirements/general-institute-requirements";

function girScienceCore(prefix: string): AllNode {
  return all(
    `${prefix}.gir.science`,
    "Science Requirement (6 subjects)",
    [
      any(`${prefix}.gir.physics1`, "Physics I", [
        course(`${prefix}.gir.physics1.8-01`, "8.01 Physics I", ["8.01"]),
        course(`${prefix}.gir.physics1.8-011`, "8.011 Physics I", ["8.011"]),
        course(`${prefix}.gir.physics1.8-012`, "8.012 Physics I (Honors)", ["8.012"]),
        course(`${prefix}.gir.physics1.8-01L`, "8.01L Physics I", ["8.01L"]),
      ]),
      any(`${prefix}.gir.physics2`, "Physics II", [
        course(`${prefix}.gir.physics2.8-02`, "8.02 Physics II", ["8.02"]),
        course(`${prefix}.gir.physics2.8-021`, "8.021 Physics II", ["8.021"]),
        course(`${prefix}.gir.physics2.8-022`, "8.022 Physics II (Honors)", ["8.022"]),
      ]),
      any(`${prefix}.gir.calc1`, "Calculus I", [
        course(`${prefix}.gir.calc1.18-01`, "18.01 Calculus I", ["18.01"]),
        course(`${prefix}.gir.calc1.18-01A`, "18.01A Calculus I", ["18.01A"]),
      ]),
      any(`${prefix}.gir.calc2`, "Calculus II", [
        course(`${prefix}.gir.calc2.18-02`, "18.02 Calculus II", ["18.02"]),
        course(`${prefix}.gir.calc2.18-022`, "18.022 Calculus II", ["18.022"]),
        course(`${prefix}.gir.calc2.18-02A`, "18.02A Calculus II", ["18.02A"]),
      ]),
      any(`${prefix}.gir.chem`, "Chemistry", [
        course(`${prefix}.gir.chem.3-091`, "3.091 Solid-State Chemistry", ["3.091"]),
        course(`${prefix}.gir.chem.5-111`, "5.111 Principles of Chemical Science", ["5.111"]),
        course(`${prefix}.gir.chem.5-112`, "5.112 Principles of Chemical Science", ["5.112"]),
      ]),
      any(`${prefix}.gir.bio`, "Biology", [
        course(`${prefix}.gir.bio.7-012`, "7.012 Intro to Biology", ["7.012"]),
        course(`${prefix}.gir.bio.7-013`, "7.013 Intro to Biology", ["7.013"]),
        course(`${prefix}.gir.bio.7-014`, "7.014 Intro to Biology", ["7.014"]),
        course(`${prefix}.gir.bio.7-015`, "7.015 Intro to Biology", ["7.015"]),
        course(`${prefix}.gir.bio.7-016`, "7.016 Intro to Biology", ["7.016"]),
      ]),
    ],
    { sourceUrl: GIR_SOURCE },
  );
}

function girRest(prefix: string, satisfiedNote?: string): TagNode {
  return tag(`${prefix}.gir.rest`, "REST Requirement (2 subjects)", {
    gir: "REST",
    count: 2,
    description: satisfiedNote
      ? `Restricted Electives in Science & Technology. ${satisfiedNote}`
      : "Restricted Electives in Science & Technology. Many major foundation subjects double-count.",
    sourceUrl: GIR_SOURCE,
  });
}

function girLab(prefix: string, satisfiedNote?: string): TagNode {
  return tag(`${prefix}.gir.lab`, "Laboratory Requirement (1 subject, 12 units)", {
    gir: "LAB",
    count: 1,
    description: satisfiedNote
      ? `Single LAB-tagged subject. ${satisfiedNote}`
      : "Single LAB-tagged subject. Often satisfied by a major-program lab.",
    sourceUrl: GIR_SOURCE,
  });
}

function girHass(prefix: string, doubleCountNote?: string): AllNode {
  return all(
    `${prefix}.gir.hass`,
    "HASS Requirement (8 subjects, ≥1 each in Arts/Social/Humanities)",
    [
      tag(`${prefix}.gir.hass.a`, "≥1 HASS-A (Arts)", { hass: "HASS-A", count: 1 }),
      tag(`${prefix}.gir.hass.s`, "≥1 HASS-S (Social Sciences)", { hass: "HASS-S", count: 1 }),
      tag(`${prefix}.gir.hass.h`, "≥1 HASS-H (Humanities)", { hass: "HASS-H", count: 1 }),
      // 5 more HASS subjects of any area (distinct from the 3 distribution requirements above)
      tag(`${prefix}.gir.hass.electives`, "5 additional HASS electives (any area)", {
        hass: "HASS",
        count: 5,
        description:
          "5 more HASS-A, HASS-S, or HASS-H subjects beyond the 3 distribution slots. " +
          "MIT also requires a concentration of ≥3 in one area, but Course Compass does not enforce that constraint." +
          (doubleCountNote ? " " + doubleCountNote : ""),
        sourceUrl: GIR_SOURCE,
      }),
    ],
    {
      sourceUrl: GIR_SOURCE,
    },
  );
}

function girCommunication(prefix: string, cimNote?: string): AllNode {
  return all(
    `${prefix}.gir.communication`,
    "Communication Requirement (4 subjects)",
    [
      tag(`${prefix}.gir.cih`, "CI-H / CI-HW (2 subjects)", {
        ci: "CI-H",
        count: 2,
        description:
          "Two HASS-based communication-intensive subjects. CI-HW also counts.",
      }),
      tag(`${prefix}.gir.cim`, "CI-M (2 subjects in major)", {
        ci: "CI-M",
        count: 2,
        description: cimNote
          ? `Two communication-intensive subjects within your major. ${cimNote}`
          : "Two communication-intensive subjects within your major.",
      }),
    ],
    { sourceUrl: GIR_SOURCE },
  );
}

function girAll(
  prefix: string,
  opts: {
    restNote?: string;
    labNote?: string;
    hassDoubleCount?: string;
    cimNote?: string;
  } = {},
): AllNode {
  return all(
    `${prefix}.gir`,
    "General Institute Requirements (17 subjects)",
    [
      girScienceCore(prefix),
      girRest(prefix, opts.restNote),
      girLab(prefix, opts.labNote),
      girHass(prefix, opts.hassDoubleCount),
      girCommunication(prefix, opts.cimNote),
    ],
    { sourceUrl: GIR_SOURCE },
  );
}

/** Registrar / catalog general degree rules (SB units outside GIR). */
const DEGREE_UNITS_OUTSIDE_GIR_URL =
  "https://catalog.mit.edu/mit/undergraduate-education/general-degree-requirements/";

function sbUnitsOutsideGir(majorPrefix: string): UnitsOutsideGirNode {
  return {
    kind: "units_outside_gir",
    id: `${majorPrefix}.graduation.units_outside_gir`,
    title: "≥180 units outside GIR (SB graduation)",
    minUnits: 180,
    description:
      "Science Bachelor programs require at least 180 units in subjects outside the General Institute Requirements. " +
      "Progress here sums units only for completed subjects with **no** GIR tag in our catalog (FireRoad `girAttribute`). " +
      "How subjects apply on your official degree audit may differ — confirm with the registrar.",
    sourceUrl: DEGREE_UNITS_OUTSIDE_GIR_URL,
  };
}

// ---------------------------------------------------------------------------
// Common foundation: intro programming + probability grounding
// ---------------------------------------------------------------------------

function eecsIntroProgramming(prefix: string): AnyNode {
  // 9.C20, 16.C20, 18.C20, CSE.C20 are cross-listed sections of the same
  // "Introduction to Computational Science and Engineering" course.
  const C20_IDS = ["16.C20", "9.C20", "18.C20", "CSE.C20"];
  // 6.100L is a two-term alternative to 6.100A for students with no prior experience.
  const INTRO_A_IDS = ["6.100A", "6.100L", "6.0001"];

  return any(
    `${prefix}.intro`,
    "Introduction to Programming and Computer Science (12 units)",
    [
      // Option 1: 6.1000 alone (12-unit subject for students with some prior experience)
      course(
        `${prefix}.intro.6.1000`,
        "6.1000 Introduction to Programming and Computer Science",
        ["6.1000"],
      ),
      // Option 2: 6.100A + 6.100B (2×6 units)
      all(`${prefix}.intro.6100AB`, "6.100A + 6.100B", [
        course(`${prefix}.intro.6100AB.A`, "6.100A Intro to CS Programming in Python", INTRO_A_IDS),
        course(`${prefix}.intro.6100AB.B`, "6.100B Intro to Computational Thinking and Data Sci.", ["6.100B", "6.0002"]),
      ]),
      // Option 3: 6.100A + C20 variant (9.C20 / 16.C20 / 18.C20 / CSE.C20)
      all(`${prefix}.intro.6100AC20`, "6.100A + C20 (9.C20 / 16.C20 / 18.C20)", [
        course(`${prefix}.intro.6100AC20.A`, "6.100A Intro to CS Programming in Python", INTRO_A_IDS),
        course(`${prefix}.intro.6100AC20.C20`, "16.C20[J] / 9.C20 / 18.C20 Intro to Computational Science and Engineering", C20_IDS),
      ]),
      // Option 4: 6.100A + 6.S080 (special subject combining with 6.100A for REST credit)
      all(`${prefix}.intro.6100AS080`, "6.100A + 6.S080", [
        course(`${prefix}.intro.6100AS080.A`, "6.100A Intro to CS Programming in Python", INTRO_A_IDS),
        course(`${prefix}.intro.6100AS080.S080`, "6.S080", ["6.S080"]),
      ]),
    ],
    {
      description:
        "12 units of intro programming. Choose ONE of: " +
        "(1) 6.1000 alone; " +
        "(2) 6.100A + 6.100B; " +
        "(3) 6.100A + a C20 variant (9.C20, 16.C20, or 18.C20); " +
        "(4) 6.100A + 6.S080. " +
        "6.100L may substitute for 6.100A in options 2–4.",
    },
  );
}

function probabilityGrounding(prefix: string, includeLinearAlgebra = false): AnyNode {
  const children: CourseNode[] = [
    course(`${prefix}.prob.6.3700`, "6.3700 Introduction to Probability", ["6.3700", "6.041"]),
    course(`${prefix}.prob.6.3800`, "6.3800 Introduction to Inference", ["6.3800"]),
    course(`${prefix}.prob.18.05`, "18.05 Introduction to Probability and Statistics", ["18.05"]),
    course(`${prefix}.prob.18.600`, "18.600 Probability and Random Variables", ["18.600"]),
  ];
  if (includeLinearAlgebra) {
    children.push(
      course(`${prefix}.prob.18.06`, "18.06 Linear Algebra", ["18.06"]),
      course(`${prefix}.prob.18.C06`, "18.C06 Linear Algebra and Optimization", ["18.C06"]),
    );
  }
  return any(`${prefix}.prob`, "Probability / Linear Algebra (12 units)", children, {
    description: includeLinearAlgebra
      ? "6-3 lets you choose either a probability subject or a linear algebra subject here."
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// 6-3: Computer Science and Engineering
// ---------------------------------------------------------------------------

const SOURCE_6_3 =
  "https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/";

const major6_3: MajorRequirement = {
  id: "6-3",
  name: "Computer Science and Engineering (Course 6-3)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_3,
  notes:
    "Transcribed from the official MIT catalog 2025-2026 degree chart. " +
    "Key constraint: the two track requirements ('2 from a CS track' and '2 from a CS/AI+D/EE track') each require BOTH subjects from the SAME specific track — you cannot mix tracks within a single requirement. " +
    "Both requirements together need at least 4 distinct track courses (though the engine currently evaluates them independently and will show 'complete' for each once you have 2 from any matching track). " +
    "The two restricted electives (flex) do not reuse subjects already counted on another line (core, GIR, track electives, etc.), except AUS2/CIM2/II cross-cutting overlap per the chart.",
  root: all("6-3.root", "6-3 — Computer Science and Engineering", [
    girAll("6-3", {
      restNote:
        "Can be satisfied by 6.1910 and 6.1200[J] (when taken under 18.062[J]) in the Departmental Program.",
      labNote: "Satisfied by 6.1010 in the Departmental Program.",
      hassDoubleCount:
        "Two HASS subjects can be satisfied by 6.3260[J] and 6.4590[J] (taken as part of a track).",
    }),
    sbUnitsOutsideGir("6-3"),

    all("6-3.cs", "Computer Science Requirements", [
      eecsIntroProgramming("6-3"),
      course("6-3.cs.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-3.cs.6.1020", "6.1020 Software Construction", ["6.1020"]),
      course("6-3.cs.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      course("6-3.cs.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      any("6-3.cs.theory", "6.1400[J] OR 6.1220[J]", [
        course("6-3.cs.6.1400", "6.1400[J] Computability and Complexity Theory", ["6.1400"]),
        course("6-3.cs.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220", "6.046"]),
      ]),
      any("6-3.cs.systems", "6.1800 OR 6.1810 OR 6.5831", [
        course("6-3.cs.6.1800", "6.1800 Computer Systems Engineering (CI-M)", ["6.1800", "6.033"]),
        course("6-3.cs.6.1810", "6.1810 Operating System Engineering", ["6.1810"]),
        course("6-3.cs.6.5831", "6.5831 Database Systems", ["6.5831"]),
      ]),
      course("6-3.cs.6.1903", "6.1903 Introduction to Low-level Programming in C and Assembly", ["6.1903", "6.1904"]),
      course("6-3.cs.6.1910", "6.1910 Computation Structures", ["6.1910", "6.004"]),
      probabilityGrounding("6-3", true),
    ]),

    all("6-3.electives", "Elective subjects (6 subjects + cross-cutting constraints)", [
      perTrackAny(
        "6-3.electives.cs1",
        "Two subjects from ONE specific CS track",
        ["cs"],
        2,
        "You must pick ONE of the six CS tracks and take BOTH subjects from that single track. " +
          "You cannot mix subjects from different tracks (e.g., one from Systems + one from Theory does NOT satisfy this). " +
          "This is a separate requirement from the CS/AI+D/EE track requirement below — you need distinct courses for each.",
      ),
      perTrackAny(
        "6-3.electives.cs_aid_ee",
        "Two subjects from ONE specific CS, AI+D, or EE track",
        ["cs", "ai_d", "ee"],
        2,
        "A second track requirement: pick ONE track (CS, AI+D, or EE) and take BOTH subjects from that single track. " +
          "This can be the same CS track as above (but those are different course slots — you need 4 distinct track courses total) " +
          "or a completely different track. Most students pick a different area to broaden their preparation.",
      ),
      dept(
        "6-3.electives.flex",
        "Restricted electives: satisfy a 6-3, 6-4, 6-5, or 18 degree requirement (two subjects)",
        "6",
        {
          minNumber: 1000,
          count: 2,
          undergradOnly: true,
          description:
            "Two subjects that each satisfy a degree requirement in 6-3, 6-4, 6-5, or 18. " +
            "Cannot double-count with the four subjects used for the two track-elective rows above, or with any other line on this sheet (core, GIR, etc.), except where the AUS / CI-M / II cross-cutting rows explicitly allow overlap. " +
            "Modeled here as any 6.1xxx–6.9xxx undergrad subject.",
        },
      ),
      tag("6-3.electives.aus", "Cross-cutting: ≥2 electives must be Advanced Undergraduate Subjects (AUS)", {
        allowedIds: ADVANCED_UNDERGRAD_SUBJECTS,
        count: 2,
        description:
          "Of the 6 elective subjects, at least 2 must be on the Advanced Undergraduate Subjects list. " +
          "A single course can satisfy this AND a track requirement simultaneously (double-counting allowed here).",
        sourceUrl: GROUPINGS_SOURCE_URL,
      }),
      tag("6-3.electives.ii", "Cross-cutting: ≥1 subject on II or grad_II", {
        allowedIds: unionDedupe(II_UNDERGRAD_SUBJECTS, GRAD_II_SUBJECTS),
        count: 1,
        description:
          "At least one elective must be from the Independent Inquiry (II) or grad_II list. " +
          "The same course can also satisfy a track requirement.",
        sourceUrl: GROUPINGS_SOURCE_URL,
      }),
    ],
    {
      restrictedElectiveRule: {
        flexChildId: "6-3.electives.flex",
        consumeFromChildIds: ["6-3.electives.cs1", "6-3.electives.cs_aid_ee"],
      },
    },
  ),
  ]),
};

/** Fall 2025+ cohort; Fall 2026 subject listings (AUS2/CIM2/II, expanded systems header, no 6.1903). */
const SOURCE_6_3_F2026 =
  "https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/";

const major6_3_2026_2027: MajorRequirement = {
  id: "6-3",
  name: "Computer Science and Engineering (Course 6-3)",
  department: "6",
  catalogYear: "2026-2027",
  sourceUrl: SOURCE_6_3_F2026,
  notes:
    "Fall 2025+ cohort per official EECS chart; subjects as of Fall 2026. " +
    GROUPINGS_FALL2026_NOTE +
    " Two track requirements each need both subjects from the same named track. " +
    "Composite tracks with two columns on the official EECS tracks page (e.g. AI+D Centers, several EE tracks) are modeled as two sub-slots with distinct completed courses. Single-column tracks with footnotes (e.g. 6.2050 vs 6.2060) may still need a quick check against the chart. " +
    "Each completed subject counts at most once toward a required subject but may satisfy multiple cross-cutting constraints. " +
    "The two restricted electives do not reuse subjects counted elsewhere on the sheet (core, GIR, tracks, …); AUS2/CIM2/II cross-cutting rows omit those ids when deciding overlap per chart.",
  root: all("6-3.root", "6-3 — Computer Science and Engineering", [
    girAll("6-3", {
      restNote:
        "Can be satisfied by 6.1910 and 6.1200[J] (when taken under 18.062[J]) in the Departmental Program.",
      labNote: "Satisfied by 6.1010 in the Departmental Program.",
      hassDoubleCount:
        "Two HASS subjects can be satisfied by 6.3260[J] and 6.4590[J] (taken as part of a track).",
    }),
    sbUnitsOutsideGir("6-3"),

    all("6-3.cs", "Computer Science Requirements", [
      eecsIntroProgramming("6-3"),
      course("6-3.cs.6.1200", "6.1200[J] Mathematics for Computer Science (discrete math)", ["6.1200", "18.062"]),
      any("6-3.cs.math63", "One 6-3 mathematics subject (probability, inference, or linear algebra)", [
        course("6-3.cs.math63.18.05", "18.05 Introduction to Probability and Statistics", ["18.05"]),
        course("6-3.cs.math63.18.06", "18.06 Linear Algebra", ["18.06"]),
        course("6-3.cs.math63.18.C06", "18.C06 Linear Algebra and Optimization", ["18.C06"]),
        course("6-3.cs.math63.6.3700", "6.3700 Introduction to Probability", ["6.3700", "6.041"]),
        course("6-3.cs.math63.6.3800", "6.3800 Introduction to Inference", ["6.3800"]),
        course("6-3.cs.math63.6.C06", "6.C06[J] Linear Algebra and Optimization", ["6.C06"]),
      ]),
      course("6-3.cs.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-3.cs.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      course("6-3.cs.6.1910", "6.1910 Computation Structures", ["6.1910", "6.004"]),
      course("6-3.cs.6.1020", "6.1020 Software Construction", ["6.1020"]),
      any("6-3.cs.theory", "6.1400[J] OR 6.1220[J]", [
        course("6-3.cs.6.1400", "6.1400[J] Computability and Complexity Theory", ["6.1400"]),
        course("6-3.cs.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220", "6.046"]),
      ]),
      any("6-3.cs.systems", "Systems header subject", [
        course("6-3.cs.6.1800", "6.1800 Computer Systems Engineering (CI-M)", ["6.1800", "6.033"]),
        course("6-3.cs.6.1810", "6.1810 Operating System Engineering", ["6.1810"]),
        course("6-3.cs.6.5660", "6.5660 Computational Cognitive Science", ["6.5660"]),
        course("6-3.cs.6.5830", "6.5830 Operating Systems & Virtualization", ["6.5830"]),
        course("6-3.cs.6.5831", "6.5831 Database Systems", ["6.5831"]),
        course("6-3.cs.6.5840", "6.5840 Distributed Computer Systems Engineering", ["6.5840"]),
      ]),
    ]),

    all("6-3.electives", "Elective subjects (6 subjects + cross-cutting constraints)", [
      perTrackAny(
        "6-3.electives.cs1",
        "Two subjects from ONE specific CS track",
        ["cs"],
        2,
        "Pick ONE of the six CS tracks and take BOTH subjects from that track. " +
          "You cannot mix subjects from different CS tracks.",
      ),
      perTrackAny(
        "6-3.electives.cs_aid_ee",
        "Two subjects from ONE specific CS, AI+D, or EE track",
        ["cs", "ai_d", "ee"],
        2,
        "Pick ONE track (CS, AI+D, or EE) and take BOTH subjects from that track. " +
          "Typically distinct from your first track requirement; four distinct track courses total.",
      ),
      tag("6-3.electives.flex", "Restricted electives (EECS flex list or designated graduate lists)", {
        allowedIds: FLEX_ELECTIVE_IDS_FALL2026,
        count: 2,
        description:
          "Two subjects from the chart EECS list, or grad_AI+D_AUS, grad_AUS2, grad_II, or Course 18 per the Math elective rule (similar-content restriction not modeled). " +
          "Cannot reuse the four subjects counted toward the two track-elective rows above; CI-M, AUS2, and II cross-cutting rules may still overlap per the chart. " +
          "Course Compass also excludes any subject already counted on another line of your sheet (core, GIR, tracks, etc.), except AUS2/CIM2/II rows where the chart allows overlap. " +
          "Allowed IDs here are the union of the transcribed EECS bucket and those graduate lists.",
        sourceUrl: SOURCE_6_3_F2026,
      }),
      tag("6-3.electives.aus2", "Cross-cutting: ≥2 subjects on AUS2 or grad_AUS2", {
        allowedIds: unionDedupe(AUS2_SUBJECTS, GRAD_AUS2_SUBJECTS),
        count: 2,
        description:
          "At least two completed subjects toward the degree must appear on the AUS2 or grad_AUS2 list. " +
          "The same course may satisfy this and other requirements per chart.",
        sourceUrl: SOURCE_6_3_F2026,
      }),
      tag("6-3.electives.cim2", "Cross-cutting: ≥2 subjects on the CIM2 list", {
        allowedIds: CIM2_SUBJECTS,
        count: 2,
        description:
          "At least two completed subjects must be on the EECS CI-M (CIM2) list.",
        sourceUrl: SOURCE_6_3_F2026,
      }),
      tag("6-3.electives.ii", "Cross-cutting: ≥1 subject on II or grad_II", {
        allowedIds: unionDedupe(II_UNDERGRAD_SUBJECTS, GRAD_II_SUBJECTS),
        count: 1,
        description:
          "At least one completed subject must satisfy Independent Inquiry (II or grad_II list).",
        sourceUrl: SOURCE_6_3_F2026,
      }),
    ],
    {
      restrictedElectiveRule: {
        flexChildId: "6-3.electives.flex",
        consumeFromChildIds: ["6-3.electives.cs1", "6-3.electives.cs_aid_ee"],
      },
    },
  ),
  ]),
};

// ---------------------------------------------------------------------------
// 6-4: Artificial Intelligence and Decision Making
// ---------------------------------------------------------------------------

const SOURCE_6_4 =
  "https://catalog.mit.edu/degree-charts/artifical-intelligence-decision-making-course-6-4/";

const major6_4: MajorRequirement = {
  id: "6-4",
  name: "Artificial Intelligence and Decision Making (Course 6-4)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_4,
  notes:
    "Transcribed from the official 2025-2026 chart. The 'Centers' requirement is modeled as 5 sub-anys (one each from Data / Model / Decision / Computation / Human-centric). The 6.4110/6.4400/6.C571 dual-counting restrictions are noted but not enforced.",
  root: all("6-4.root", "6-4 — AI and Decision Making", [
    girAll("6-4", {
      restNote: "Satisfied by 6.1200[J] and 18.C06[J] in the Departmental Program.",
      labNote: "Satisfied by 6.1010 in the Departmental Program.",
    }),
    sbUnitsOutsideGir("6-4"),

    all("6-4.fundamentals", "Fundamentals", [
      eecsIntroProgramming("6-4"),
      course("6-4.fnd.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-4.fnd.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      course("6-4.fnd.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      any("6-4.fnd.linalg", "Linear Algebra (18.C06[J] or 18.06)", [
        course("6-4.fnd.18.C06", "18.C06[J] Linear Algebra and Optimization", ["18.C06"]),
        course("6-4.fnd.18.06", "18.06 Linear Algebra", ["18.06"]),
      ]),
      probabilityGrounding("6-4", false),
    ]),

    all("6-4.centers", "Centers (5 subjects, one from each area)", [
      any("6-4.centers.data", "Data-centric (one of)", [
        course("6-4.centers.6.3720", "6.3720 Introduction to Statistical Data Analysis", ["6.3720"]),
        course("6-4.centers.6.3900", "6.3900 Introduction to Machine Learning", ["6.3900", "6.036"]),
        course("6-4.centers.6.C01", "6.C01 Modeling with Machine Learning", ["6.C01"]),
      ]),
      any("6-4.centers.model", "Model-centric (one of)", [
        course("6-4.centers.6.3000", "6.3000 Signal Processing", ["6.3000", "6.003"]),
        course("6-4.centers.6.3100", "6.3100 Dynamical System Modeling and Control Design", ["6.3100"]),
        course("6-4.centers.6.4110a", "6.4110 Representation, Inference, and Reasoning in AI", ["6.4110"]),
        course("6-4.centers.6.4420", "6.4420[J] Computational Design and Fabrication", ["6.4420"]),
        course("6-4.centers.6.4400a", "6.4400 Computer Graphics", ["6.4400"]),
      ]),
      any("6-4.centers.decision", "Decision-centric (one of)", [
        course("6-4.centers.6.3100b", "6.3100 Dynamical System Modeling and Control Design", ["6.3100"]),
        course("6-4.centers.6.4110b", "6.4110 Representation, Inference, and Reasoning in AI", ["6.4110"]),
        course("6-4.centers.6.C571a", "6.C571[J] Optimization Methods", ["6.C571"]),
      ]),
      any("6-4.centers.computation", "Computation-centric (one of)", [
        course("6-4.centers.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220", "6.046"]),
        course("6-4.centers.6.1400", "6.1400[J] Computability and Complexity Theory", ["6.1400"]),
        course("6-4.centers.6.4400b", "6.4400 Computer Graphics", ["6.4400"]),
        course("6-4.centers.6.C571b", "6.C571[J] Optimization Methods", ["6.C571"]),
      ]),
      any("6-4.centers.human", "Human-centric (one of)", [
        course("6-4.centers.6.3260", "6.3260[J] Networks", ["6.3260"]),
        course("6-4.centers.6.3950", "6.3950 AI, Decision Making, and Society", ["6.3950"]),
        course("6-4.centers.6.4120", "6.4120[J] Computational Cognitive Science", ["6.4120", "9.660"]),
        course("6-4.centers.6.4590", "6.4590[J] Foundations of Information Policy", ["6.4590"]),
        course("6-4.centers.6.C35", "6.C35[J] Interactive Data Visualization and Society", ["6.C35"]),
      ]),
    ]),

    any("6-4.cim_application", "Application CI-M (one of)", [
      course("6-4.cim.6.4200", "6.4200[J] Robotics: Science and Systems (CI-M)", ["6.4200"]),
      course("6-4.cim.6.4210", "6.4210 Robotic Manipulation (CI-M)", ["6.4210"]),
      course("6-4.cim.6.8611", "6.8611 Quantitative Methods for NLP (CI-M)", ["6.8611"]),
    ]),

    all("6-4.electives", "Electives", [
      dept("6-4.elec.flex", "One subject from Course 6 or Course 18", "6", {
        minNumber: 1000,
        count: 1,
        undergradOnly: true,
        description:
          "Approximated as 'any 6.xxxx undergraduate subject'. The official rule is 'one subject that satisfies a degree requirement in Course 6 or Course 18'.",
      }),
      tag("6-4.elec.aid_aus", "One subject from the AI+D AUS list", {
        allowedIds: AI_D_ADVANCED_UNDERGRAD_SUBJECTS,
        count: 1,
        sourceUrl: SOURCE_6_4,
      }),
      tag("6-4.elec.cim2", "Second CI-M subject (from CIM-2 list)", {
        allowedIds: COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS,
        count: 1,
        description:
          "Beyond the Application CI-M, students must satisfy at least one program requirement or elective with a second CI-M subject.",
        sourceUrl: GROUPINGS_SOURCE_URL,
      }),
      tag("6-4.elec.serc", "SERC subject (Social and Ethical Responsibilities of Computing)", {
        allowedIds: SERC_SUBJECTS,
        count: 1,
        description:
          "Students must satisfy at least one program requirement or elective with a SERC-qualified subject.",
        sourceUrl: SOURCE_6_4,
      }),
    ]),
  ]),
};

// ---------------------------------------------------------------------------
// 6-5: Electrical Engineering with Computing
// ---------------------------------------------------------------------------

const SOURCE_6_5 =
  "https://catalog.mit.edu/degree-charts/electrical-engineering-computing-6-5/";

const major6_5: MajorRequirement = {
  id: "6-5",
  name: "Electrical Engineering with Computing (Course 6-5)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_5,
  notes:
    "Transcribed from the official 2025-2026 chart. The two-EE-track structure (2 from one track + 2 from another) is approximated as 'four EE-track subjects'; the engine doesn't yet enforce that they come from two distinct tracks.",
  root: all("6-5.root", "6-5 — Electrical Engineering with Computing", [
    girAll("6-5", {
      restNote:
        "Satisfied by 18.C06[J] and one of 6.1910 / 6.2000 / 6.3700 / 18.05.",
      labNote: "Can be satisfied by 6.9000 in the Departmental Program.",
    }),
    sbUnitsOutsideGir("6-5"),

    all("6-5.fundamentals", "Fundamentals", [
      course("6-5.fnd.6.100A", "6.100A Intro to CS Programming in Python", ["6.100A"]),
      any("6-5.fnd.discrete", "6.120A or 6.1200[J]", [
        course("6-5.fnd.6.120A", "6.120A Discrete Mathematics and Proof for CS", ["6.120A"]),
        course("6-5.fnd.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      ]),
      course("6-5.fnd.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      course("6-5.fnd.6.1903", "6.1903 Intro to Low-level Programming in C and Assembly", ["6.1903", "6.1904"]),
      any("6-5.fnd.linalg", "Linear Algebra (18.C06[J] or 18.06)", [
        course("6-5.fnd.18.C06", "18.C06[J] Linear Algebra and Optimization", ["18.C06"]),
        course("6-5.fnd.18.06", "18.06 Linear Algebra", ["18.06"]),
      ]),
      probabilityGrounding("6-5", false),
    ]),

    all("6-5.system_centers", "System Design Centers (3 subjects)", [
      course("6-5.sys.6.1910", "6.1910 Computation Structures", ["6.1910", "6.004"]),
      course("6-5.sys.6.2000", "6.2000 Electrical Circuits: Modeling and Design of Physical Systems", ["6.2000"]),
      course("6-5.sys.6.3000", "6.3000 Signal Processing", ["6.3000", "6.003"]),
    ]),

    course(
      "6-5.system_lab",
      "System Design Lab: 6.9000 Engineering for Impact",
      ["6.9000"],
      { description: "Counts as the LAB GIR." },
    ),

    tag("6-5.ee_tracks", "Four EE-track subjects (2 from one track + 2 from another)", {
      allowedIds: [
        // Union of all EE track subjects
        "6.4800",
        "6.4810",
        "6.4820",
        "6.4830",
        "6.4860",
        "6.7411",
        "6.1800",
        "6.3010",
        "6.1920",
        "6.2050",
        "6.2060",
        "6.5931",
        "6.2040",
        "6.2080",
        "6.2090",
        "6.2220",
        "6.2221",
        "6.2300",
        "6.2320",
        "6.2500",
        "6.2210",
        "6.2370",
        "6.6331",
        "6.1820",
        "6.4510",
        "6.2200",
        "6.2400",
        "6.2410",
        "6.2540",
        "6.2600",
        "6.3260",
        "6.3720",
        "6.3900",
        "6.4110",
        "6.4200",
        "6.4300",
        "6.4210",
        "6.7120",
        "6.C27",
        "6.C01",
        "6.C571",
      ],
      count: 4,
      description:
        "Official rule: 2 from one EE track + 2 from another EE track (different tracks). Course Compass currently checks 'four EE-track subjects' without enforcing the two-distinct-tracks rule.",
      sourceUrl: TRACKS_SOURCE_URL,
    }),

    dept(
      "6-5.flex",
      "Two Course 6 subjects satisfying a 6-3, 6-4, or 6-5 requirement",
      "6",
      {
        count: 2,
        undergradOnly: true,
        minNumber: 1000,
        description:
          "Approximated as 'any two 6.xxxx undergraduate subjects'. The official rule is two subjects that satisfy a 6-3, 6-4, or 6-5 requirement.",
      },
    ),

    tag("6-5.plab", "Project-Based Lab (PLAB) requirement", {
      allowedIds: PROJECT_BASED_LAB_SUBJECTS,
      count: 1,
      description:
        "At least one program requirement or elective must be from the PLAB list.",
      sourceUrl: GROUPINGS_SOURCE_URL,
    }),
  ]),
};

// ---------------------------------------------------------------------------
// 6-7: Computer Science and Molecular Biology
// ---------------------------------------------------------------------------

const SOURCE_6_7 =
  "https://catalog.mit.edu/degree-charts/computer-science-molecular-biology-course-6-7/";

const BIOLOGY_RESTRICTED_ELECTIVES = [
  "7.08",
  "7.093",
  "7.094",
  "7.20",
  "7.21",
  "7.23",
  "7.24",
  "7.26",
  "7.27",
  "7.28",
  "7.29",
  "7.30",
  "7.31",
  "7.32",
  "7.33",
  "7.35",
  "7.371",
  "7.45",
  "7.46",
  "7.49",
  "9.17",
  "9.26",
];

const major6_7: MajorRequirement = {
  id: "6-7",
  name: "Computer Science and Molecular Biology (Course 6-7)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_7,
  notes:
    "Transcribed from the official 2025-2026 interdisciplinary degree chart. Note that 6-7 is administered jointly with Course 7.",
  root: all("6-7.root", "6-7 — CS and Molecular Biology", [
    girAll("6-7", {
      restNote: "Can be satisfied by 5.12 and 6.C06[J] in the Departmental Program.",
      labNote: "Satisfied by 7.003[J] or 20.109 in the Departmental Program.",
    }),
    sbUnitsOutsideGir("6-7"),

    all("6-7.math_intro", "Mathematics and Introductory", [
      course("6-7.math.6.100A", "6.100A Intro to CS Programming in Python", ["6.100A"]),
      course("6-7.math.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      course("6-7.math.6.C06", "6.C06[J] Linear Algebra and Optimization", ["6.C06", "18.C06"]),
    ]),

    all("6-7.chem", "Chemistry", [
      course("6-7.chem.5.12", "5.12 Organic Chemistry I", ["5.12"]),
      course("6-7.chem.5.601", "5.601 Thermodynamics I", ["5.601"]),
    ]),

    any("6-7.intro_lab", "Introductory Laboratory", [
      all("6-7.lab.7003_20109", "7.003[J] + 20.109", [
        course("6-7.lab.7.003", "7.003[J] Fundamentals of Experimental Molecular Biology", ["7.003"]),
        course("6-7.lab.20.109", "20.109 Applied Molecular Biology Laboratory (CI-M)", ["20.109"]),
      ]),
      course("6-7.lab.20.129", "20.129 Laboratory Fundamentals in Biological Engineering (CI-M)", ["20.129"]),
    ]),

    all("6-7.cs_foundation", "CS Foundational Subjects", [
      course("6-7.cs.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-7.cs.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      any("6-7.cs.ml", "Machine Learning (one of)", [
        course("6-7.cs.6.3900", "6.3900 Introduction to Machine Learning", ["6.3900", "6.036"]),
        course("6-7.cs.6.C01_C53", "6.C01 + 6.C53 (Modeling with ML for Biology)", ["6.C01"]),
      ]),
    ]),

    all("6-7.bio_foundation", "Biology Foundational Subjects", [
      course("6-7.bio.7.03", "7.03 Genetics", ["7.03"]),
      any("6-7.bio.biochem", "Biochemistry (7.05 or 5.07[J])", [
        course("6-7.bio.7.05", "7.05 General Biochemistry", ["7.05"]),
        course("6-7.bio.5.07", "5.07[J] Introduction to Biological Chemistry", ["5.07"]),
      ]),
      course("6-7.bio.7.06", "7.06 Cell Biology", ["7.06"]),
    ]),

    any("6-7.compbio", "Computational Biology (one of)", [
      course("6-7.cb.7.51", "7.51 Genomics and Evolution of Infectious Disease", ["7.51"]),
      course("6-7.cb.6.8701", "6.8701[J] Computational Biology: Genomes, Networks, Evolution", ["6.8701", "6.047"]),
      all("6-7.cb.7.093_094", "7.093 + 7.094", [
        course("6-7.cb.7.093", "7.093 Modern Biostatistics", ["7.093"]),
        course("6-7.cb.7.094", "7.094 Modern Computational Biology", ["7.094"]),
      ]),
      course("6-7.cb.7.32", "7.32 Systems Biology", ["7.32"]),
      course("6-7.cb.7.33", "7.33[J] Evolutionary Biology: Concepts, Models and Computation", ["7.33"]),
      course("6-7.cb.7.91", "7.91[J] Introduction to Computational Molecular Biology", ["7.91"]),
    ]),

    any("6-7.tech_comm", "Technical Communication (one of)", [
      course("6-7.tc.6.UAR", "6.UAR Seminar in Undergraduate Advanced Research (CI-M)", ["6.UAR"]),
      course("6-7.tc.6.UAT", "6.UAT Oral Communication (CI-M)", ["6.UAT"]),
      course("6-7.tc.7.20J", "7.20[J] Communication in Experimental Biology (CI-M)", ["7.20"]),
    ]),

    tag("6-7.electives", "Two electives (Bio Restricted, AI+D AUS, or Comp Bio)", {
      allowedIds: [
        ...BIOLOGY_RESTRICTED_ELECTIVES,
        ...AI_D_ADVANCED_UNDERGRAD_SUBJECTS,
        "7.51",
        "6.8701",
        "7.32",
        "7.33",
        "7.91",
      ],
      count: 2,
    }),
  ]),
};

// ---------------------------------------------------------------------------
// 6-9: Computation and Cognition
// ---------------------------------------------------------------------------

const SOURCE_6_9 =
  "https://catalog.mit.edu/degree-charts/computation-cognition-6-9/";

const BCS_BRAIN_NEUROPHYSIOLOGY = ["9.09", "9.13", "9.18", "9.21", "9.35", "9.36", "9.40", "9.42"];
const BCS_COMP_COGNITION = ["9.19", "9.39", "9.49", "9.53", "9.66", "9.85"];

const major6_9: MajorRequirement = {
  id: "6-9",
  name: "Computation and Cognition (Course 6-9)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_9,
  notes:
    "Transcribed from the official 2025-2026 interdisciplinary degree chart. Joint Course 6 + Course 9 program.",
  root: all("6-9.root", "6-9 — Computation and Cognition", [
    girAll("6-9", {
      restNote:
        "Can be satisfied by 9.01 and one math/CS subject in the Departmental Program (e.g., 6.1200, 6.2000, 6.3000, 6.3700, 18.03, 18.05, 18.06, 18.600, 18.C06).",
      labNote: "Satisfied by a laboratory subject in the Departmental Program.",
      hassDoubleCount: "9.85 can satisfy a HASS subject in the Departmental Program.",
    }),
    sbUnitsOutsideGir("6-9"),

    all("6-9.required", "Required Subjects", [
      course("6-9.req.6.100A", "6.100A Intro to CS Programming in Python", ["6.100A"]),
      course("6-9.req.9.01", "9.01 Introduction to Neuroscience", ["9.01"]),
      any("6-9.req.linalg", "Linear Algebra", [
        course("6-9.req.18.06", "18.06 Linear Algebra", ["18.06"]),
        course("6-9.req.18.C06", "18.C06[J] Linear Algebra and Optimization", ["18.C06"]),
      ]),
      any("6-9.req.discrete_diffeq", "Discrete math or differential equations", [
        course("6-9.req.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
        course("6-9.req.6.120A", "6.120A Discrete Mathematics and Proof for CS", ["6.120A"]),
        course("6-9.req.18.03", "18.03 Differential Equations", ["18.03"]),
      ]),
      any("6-9.req.prob", "Probability or Statistics", [
        course("6-9.req.6.3700", "6.3700 Introduction to Probability", ["6.3700", "6.041"]),
        course("6-9.req.18.05", "18.05 Introduction to Probability and Statistics", ["18.05"]),
        course("6-9.req.18.600", "18.600 Probability and Random Variables", ["18.600"]),
        course("6-9.req.6.3800", "6.3800 Introduction to Inference", ["6.3800"]),
        course("6-9.req.9.07", "9.07 Statistics for Brain and Cognitive Science", ["9.07"]),
      ]),
    ]),

    all("6-9.eecs", "EECS Program Subjects", [
      course("6-9.eecs.6.3900", "6.3900 Introduction to Machine Learning", ["6.3900", "6.036"]),
      tag("6-9.eecs.cs2", "Two of: 6.1010, 6.1210, 6.2000", {
        allowedIds: ["6.1010", "6.1210", "6.2000"],
        count: 2,
      }),
      any("6-9.eecs.signals_or_ai", "Signals/control or AI", [
        course("6-9.eecs.6.3000", "6.3000 Signal Processing", ["6.3000", "6.003"]),
        course("6-9.eecs.6.3100", "6.3100 Dynamical System Modeling and Control Design", ["6.3100"]),
        course("6-9.eecs.6.3950", "6.3950 AI, Decision Making, and Society", ["6.3950"]),
        course("6-9.eecs.6.4110", "6.4110 Representation, Inference, and Reasoning in AI", ["6.4110"]),
      ]),
    ]),

    all("6-9.bcs", "BCS Program Subjects", [
      tag("6-9.bcs.brain", "Brain Systems / Neurophysiology (one of)", {
        allowedIds: BCS_BRAIN_NEUROPHYSIOLOGY,
        count: 1,
      }),
      tag("6-9.bcs.comp_cog", "Computation and Cognition (one of)", {
        allowedIds: BCS_COMP_COGNITION,
        count: 1,
      }),
    ]),

    tag("6-9.electives", "One Program Elective", {
      allowedIds: [
        "6.4100",
        "6.4200",
        "6.8301",
        "6.8611",
        ...BCS_BRAIN_NEUROPHYSIOLOGY,
        ...BCS_COMP_COGNITION,
        "9.24",
        "9.26",
        "9.42",
        "9.60",
        "6.3800",
        "2.74",
        "6.1040",
        "16.84",
        "6.C25",
        "6.4210",
        "6.1120",
      ],
      count: 1,
    }),

    tag("6-9.lab", "One Laboratory subject (CI-M)", {
      allowedIds: [
        "6.2040",
        "6.2050",
        "6.2060",
        "6.2370",
        "6.4200",
        "6.4880",
        "9.17",
        "9.59",
        "9.60",
      ],
      count: 1,
    }),

    any("6-9.advanced", "Advanced Project (CI-M)", [
      course("6-9.ap.6.UAR", "6.UAR Seminar in Undergraduate Advanced Research (CI-M)", ["6.UAR"]),
      course("6-9.ap.9.URG", "9.URG Research and Communication in Neuroscience and Cognitive Science (CI-M)", ["9.URG"]),
      course("6-9.ap.9.URX", "9.URX Projects in the Science of Intelligence (CI-M)", ["9.URX"]),
      course("6-9.ap.6.4200", "6.4200[J] Robotics: Science and Systems (CI-M)", ["6.4200"]),
      course("6-9.ap.6.4210", "6.4210 Robotic Manipulation (CI-M)", ["6.4210"]),
      course("6-9.ap.6.8301", "6.8301 Advances in Computer Vision (CI-M)", ["6.8301"]),
      course("6-9.ap.6.8611", "6.8611 Quantitative Methods for NLP (CI-M)", ["6.8611"]),
    ]),
  ]),
};

// ---------------------------------------------------------------------------
// 6-14: Computer Science, Economics, and Data Science
// ---------------------------------------------------------------------------

const SOURCE_6_14 =
  "https://catalog.mit.edu/degree-charts/computer-science-economics-data-science-course-6-14/";

// Course IDs for 6-14 economics electives, verified against the MIT catalog
// (catalog.mit.edu/search/?P=14.XX) and the FireRoad corpus on 2026-05-02.
const ECON_DATA_SCIENCE = [
  "14.20", // Industrial Organization: Competitive Strategy and Public Policy
  "14.27", // Economics of Digitization
  "14.36", // Advanced Econometrics
  "14.38", // Inference on Causal and Structural Parameters Using ML and AI
  "14.39", // Large-Scale Decision-Making and Inference
  "14.41", // Public Finance and Public Policy
  "14.42", // Environmental Policy and Economics
  "14.43", // Economics of Energy, Innovation, and Sustainability
  "14.44", // Energy Economics and Policy
  "14.45", // Climate and Energy in the Global Economy
  "14.64", // Labor Economics and Public Policy
  "14.75", // Political Economy and Economic Development
  "14.76", // Firms, Markets, Trade and Growth
  "15.780", // Analytics of Operations Management
];

const ECON_THEORY = [
  "14.04", // Intermediate Microeconomic Theory
  "14.12", // Economic Applications of Game Theory
  "14.13", // Psychology and Economics
  "14.15", // Networks (joint with 6.3260[J])
  "14.16", // Strategy and Information
  "14.19", // Market Design
  "14.26", // Organizational Economics
  "14.54", // International Trade
];

const major6_14: MajorRequirement = {
  id: "6-14",
  name: "Computer Science, Economics, and Data Science (Course 6-14)",
  department: "6",
  catalogYear: "2025-2026",
  sourceUrl: SOURCE_6_14,
  notes:
    "Transcribed from the official 2025-2026 interdisciplinary degree chart. Joint Course 6 + Course 14 program. Course IDs were re-audited against catalog.mit.edu individual subject pages on 2026-05-02 because the chart's HTML strips IDs from elective rows; previously published IDs may have errors.",
  root: all("6-14.root", "6-14 — CS, Economics, and Data Science", [
    girAll("6-14", {
      restNote: "Can be satisfied by 6.1200[J] and 18.06 in the Departmental Program.",
      labNote: "Satisfied by 14.32 in the Departmental Program.",
      hassDoubleCount:
        "Between 1 and 3 HASS subjects can be satisfied by Departmental-Program subjects.",
    }),
    sbUnitsOutsideGir("6-14"),

    all("6-14.math", "Mathematics", [
      course("6-14.math.18.06", "18.06 Linear Algebra", ["18.06"]),
    ]),

    all("6-14.computation", "Computation / Algorithms", [
      eecsIntroProgramming("6-14"),
      course("6-14.cs.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      any("6-14.cs.algo", "Algorithms (one of)", [
        course("6-14.cs.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
        course("6-14.cs.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220", "6.046"]),
      ]),
    ]),

    all("6-14.econ", "Economics", [
      any("6-14.econ.14.01", "14.01 (or 14.03)", [
        course("6-14.econ.14.01a", "14.01 Principles of Microeconomics", ["14.01"]),
        course("6-14.econ.14.03", "14.03 Microeconomic Theory and Public Policy", ["14.03"]),
      ]),
      course("6-14.econ.14.32", "14.32 Econometric Data Science", ["14.32"]),
    ]),

    any("6-14.prob", "Introductory Probability and Statistics (one of)", [
      course("6-14.prob.14.30", "14.30 Introduction to Statistical Methods in Economics", ["14.30"]),
      course("6-14.prob.18.600", "18.600 Probability and Random Variables", ["18.600"]),
      course("6-14.prob.6.3700", "6.3700 Introduction to Probability", ["6.3700", "6.041"]),
    ]),

    all("6-14.data_science", "Data Science", [
      course("6-14.ds.6.3900", "6.3900 Introduction to Machine Learning", ["6.3900", "6.036"]),
    ]),

    any("6-14.project_cim", "Project-based CI-M (one of)", [
      course("6-14.pj.6.UAR", "6.UAR Seminar in Undergraduate Advanced Research (CI-M)", ["6.UAR"]),
      course("6-14.pj.6.UAT", "6.UAT Oral Communication (CI-M)", ["6.UAT"]),
      course("6-14.pj.14.33", "14.33 Communicating with Data (CI-M)", ["14.33"]),
    ]),

    any("6-14.econ_cim", "Economics CI-M (one of)", [
      course("6-14.ecim.14.05", "14.05 Intermediate Macroeconomics (CI-M)", ["14.05"]),
      course("6-14.ecim.14.18", "14.18 Mathematical Economic Modeling (CI-M)", ["14.18"]),
      course(
        "6-14.ecim.14.33",
        "14.33 Research and Communication in Economics (CI-M)",
        ["14.33"],
      ),
      course("6-14.ecim.14.35", "14.35 Why Markets Fail (CI-M)", ["14.35"]),
    ]),

    any("6-14.cs_elective", "CS elective (one of)", [
      course("6-14.cse.6.3260", "6.3260[J] Networks (joint with 14.15[J])", ["6.3260", "14.15"]),
      course(
        "6-14.cse.6.C395",
        "6.C395[J] Algorithmic and Human Decision-Making (joint with 14.C395[J])",
        ["6.C395", "14.C395"],
      ),
      course("6-14.cse.6.C571", "6.C571[J] Optimization Methods", ["6.C571"]),
      course(
        "6-14.cse.15.053",
        "15.053 Optimization Methods in Business Analytics",
        ["15.053"],
      ),
    ]),

    all("6-14.econ_electives", "Three Economics electives (≥1 from each group)", [
      tag("6-14.econ.elec.ds", "Data Science group (≥1)", {
        allowedIds: ECON_DATA_SCIENCE,
        count: 1,
      }),
      tag("6-14.econ.elec.theory", "Theory group (≥1)", {
        allowedIds: ECON_THEORY,
        count: 1,
      }),
      tag("6-14.econ.elec.any", "Third economics elective (any group)", {
        allowedIds: [...ECON_DATA_SCIENCE, ...ECON_THEORY],
        count: 1,
      }),
    ]),
  ]),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2023-2024 / 2024-2025 archived versions
//
// Class of 2027 students enrolled in Fall 2023 and declare under the 2023-2024
// or 2024-2025 catalog. Both catalog years are identical for all EECS majors
// except the differences documented below.
//
// Key differences from 2025-2026:
//  6-3: CS Systems requirement is 6.1800 ONLY (no 6.1810 or 6.5831 alternatives),
//       restricted elective allows "6-2, 6-3, 6-4, or 18" (not 6-5).
//  6-4: Application CI-M does NOT include 6.4210 Robotic Manipulation.
//  6-5: Does NOT exist in 2023-2024 / 2024-2025 catalogs (new for 2025-2026).
//  6-7, 6-9, 6-14: No structural changes between catalog years.
// ---------------------------------------------------------------------------

const SOURCE_6_3_2024 =
  "https://catalog.mit.edu/archive/2023-2024/degree-charts/computer-science-engineering-course-6-3/";

const major6_3_v2024: MajorRequirement = {
  id: "6-3",
  name: "Computer Science and Engineering (Course 6-3)",
  department: "6",
  catalogYear: "2023-2024",
  sourceUrl: SOURCE_6_3_2024,
  notes:
    "2023-2024 / 2024-2025 catalog. Key differences from 2025-2026: (1) CS Systems " +
    "requirement is 6.1800 ONLY — no 6.1810 or 6.5831 alternatives; (2) restricted " +
    "electives allow subjects from 6-2, 6-3, 6-4, or 18 (not 6-5). The per-track " +
    "constraint ('2 from one specific track') applies in both years.",
  root: all("6-3.root", "6-3 — Computer Science and Engineering", [
    girAll("6-3", {
      restNote:
        "Can be satisfied by 6.1910 and 6.1200[J] (when taken under 18.062[J]) in the Departmental Program.",
      labNote: "Satisfied by 6.1010 in the Departmental Program.",
      hassDoubleCount:
        "Two HASS subjects can be satisfied by 6.3260[J] and 6.4590[J] (taken as part of a track).",
    }),
    sbUnitsOutsideGir("6-3"),

    all("6-3.cs", "Computer Science Requirements", [
      eecsIntroProgramming("6-3"),
      course("6-3.cs.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-3.cs.6.1020", "6.1020 Software Construction", ["6.1020"]),
      course("6-3.cs.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      course("6-3.cs.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      any("6-3.cs.theory", "6.1400[J] OR 6.1220[J]", [
        course("6-3.cs.6.1400", "6.1400[J] Computability and Complexity Theory", ["6.1400"]),
        course("6-3.cs.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220", "6.046"]),
      ]),
      // 2023-2024: 6.1800 ONLY — no 6.1810 / 6.5831 alternatives
      course("6-3.cs.systems", "6.1800 Computer Systems Engineering (CI-M)", ["6.1800", "6.033"]),
      course("6-3.cs.6.1903", "6.1903 Introduction to Low-level Programming in C and Assembly", ["6.1903", "6.1904"]),
      course("6-3.cs.6.1910", "6.1910 Computation Structures", ["6.1910", "6.004"]),
      probabilityGrounding("6-3", true),
    ]),

    all("6-3.electives", "Elective subjects (6 subjects + cross-cutting constraints)", [
      perTrackAny(
        "6-3.electives.cs1",
        "Two subjects from ONE specific CS track",
        ["cs"],
        2,
        "Pick ONE of the six CS tracks and take BOTH subjects from that track. " +
          "You cannot mix subjects from different tracks.",
      ),
      perTrackAny(
        "6-3.electives.cs_aid_ee",
        "Two subjects from ONE specific CS, AI+D, or EE track",
        ["cs", "ai_d", "ee"],
        2,
        "A second track requirement: pick ONE track and take BOTH subjects from it. " +
          "Most students pick a different area to broaden preparation.",
      ),
      dept(
        "6-3.electives.flex",
        "Restricted electives: satisfy a 6-2, 6-3, 6-4, or 18 degree requirement (two subjects)",
        "6",
        {
          minNumber: 1000,
          count: 2,
          undergradOnly: true,
          description:
            "2023-2024: two subjects each satisfying a degree requirement in 6-2, 6-3, 6-4, or 18 " +
            "(note: 6-2 not 6-5). Cannot double-count with the four track electives or with any other line (core, GIR, etc.) except AUS/CI-M/II cross-overlap per the chart. " +
            "Modeled as any 6.1xxx–6.9xxx undergrad subject.",
        },
      ),
      tag("6-3.electives.aus", "Cross-cutting: ≥2 electives must be Advanced Undergraduate Subjects (AUS)", {
        allowedIds: ADVANCED_UNDERGRAD_SUBJECTS,
        count: 2,
        description:
          "At least 2 of the 6 electives must be on the AUS list. " +
          "A course can satisfy this AND a track requirement simultaneously.",
        sourceUrl: GROUPINGS_SOURCE_URL,
      }),
      tag("6-3.electives.ii", "Cross-cutting: ≥1 subject on II or grad_II", {
        allowedIds: unionDedupe(II_UNDERGRAD_SUBJECTS, GRAD_II_SUBJECTS),
        count: 1,
        description:
          "At least one elective must be from the Independent Inquiry (II) or grad_II list. " +
          "The same course can also satisfy a track requirement.",
        sourceUrl: GROUPINGS_SOURCE_URL,
      }),
    ],
    {
      restrictedElectiveRule: {
        flexChildId: "6-3.electives.flex",
        consumeFromChildIds: ["6-3.electives.cs1", "6-3.electives.cs_aid_ee"],
      },
    },
  ),
  ]),
};

const SOURCE_6_4_2024 =
  "https://catalog.mit.edu/archive/2023-2024/degree-charts/artifical-intelligence-decision-making-course-6-4/";

const major6_4_v2024: MajorRequirement = {
  id: "6-4",
  name: "Artificial Intelligence and Decision Making (Course 6-4)",
  department: "6",
  catalogYear: "2023-2024",
  sourceUrl: SOURCE_6_4_2024,
  notes:
    "2023-2024 / 2024-2025 catalog. Key differences from 2025-2026: (1) Application CI-M " +
    "does NOT include 6.4210 Robotic Manipulation; (2) AI+D AUS list is smaller (no 6.7411, " +
    "6.8711[J], 6.C27, 6.C571 in AUS; 6.4300 not listed). " +
    "The Centers structure (5 subjects, one from each area) is the same.",
  root: all("6-4.root", "6-4 — AI and Decision Making", [
    girAll("6-4", {
      restNote: "Satisfied by 6.1200[J] and 18.C06[J] in the Departmental Program.",
    }),
    sbUnitsOutsideGir("6-4"),

    all("6-4.core", "Fundamentals", [
      eecsIntroProgramming("6-4"),
      course("6-4.core.6.1010", "6.1010 Fundamentals of Programming", ["6.1010", "6.009"]),
      course("6-4.core.6.1200", "6.1200[J] Mathematics for Computer Science", ["6.1200", "18.062"]),
      course("6-4.core.18.C06", "18.C06[J] Linear Algebra and Optimization", ["18.C06", "18.06"]),
      course("6-4.core.6.1210", "6.1210 Introduction to Algorithms", ["6.1210", "6.006"]),
      probabilityGrounding("6-4"),
    ]),
    all("6-4.centers", "Centers (one from each)", [
      any("6-4.centers.data", "Data-centric (one of)", [
        course("6-4.centers.6.3010", "6.3010 Signal Processing", ["6.3010"]),
        course("6-4.centers.6.3900", "6.3900 Introduction to Machine Learning", ["6.3900"]),
      ]),
      any("6-4.centers.model", "Model-centric (one of)", [
        course("6-4.centers.6.3720", "6.3720 Introduction to Statistical Data Analysis", ["6.3720"]),
        course("6-4.centers.6.3900b", "6.3900 Introduction to Machine Learning", ["6.3900"]),
        course("6-4.centers.6.4110", "6.4110 Representation, Inference, and Reasoning in AI", ["6.4110"]),
        course("6-4.centers.6.4400", "6.4400 Computer Graphics", ["6.4400"]),
      ]),
      any("6-4.centers.decision", "Decision-centric (one of)", [
        course("6-4.centers.6.3100", "6.3100 Dynamical System Modeling and Control Design", ["6.3100"]),
        course("6-4.centers.6.4110b", "6.4110 Representation, Inference, and Reasoning in AI", ["6.4110"]),
        course("6-4.centers.6.C571", "6.C571[J] Optimization Methods", ["6.C571"]),
        course("6-4.centers.6.1220", "6.1220[J] Design and Analysis of Algorithms", ["6.1220"]),
      ]),
      any("6-4.centers.computation", "Computation-centric (one of)", [
        course("6-4.centers.6.1220b", "6.1220[J] Design and Analysis of Algorithms", ["6.1220"]),
        course("6-4.centers.6.4400b", "6.4400 Computer Graphics", ["6.4400"]),
        course("6-4.centers.6.C571b", "6.C571[J] Optimization Methods", ["6.C571"]),
        course("6-4.centers.6.3260", "6.3260[J] Networks", ["6.3260"]),
      ]),
      any("6-4.centers.human", "Human-centric (one of)", [
        course("6-4.centers.6.3260b", "6.3260[J] Networks", ["6.3260"]),
        course("6-4.centers.6.3950", "6.3950 AI, Decision Making, and Society", ["6.3950"]),
        course("6-4.centers.6.4120", "6.4120[J] Computational Cognitive Science", ["6.4120", "9.660"]),
        course("6-4.centers.6.4590", "6.4590[J] Foundations of Information Policy", ["6.4590"]),
      ]),
    ]),
    // 2023-2024: Application CI-M does NOT include 6.4210
    any("6-4.cim_application", "Application CI-M (one of)", [
      course("6-4.cim.6.4200", "6.4200[J] Robotics: Science and Systems (CI-M)", ["6.4200"]),
      course("6-4.cim.6.8301", "6.8301 Advances in Computer Vision (CI-M)", ["6.8301"]),
      course("6-4.cim.6.8611", "6.8611 Quantitative Methods for NLP (CI-M)", ["6.8611"]),
    ]),
    any("6-4.comm_cim", "Communication CI-M (one of)", [
      course("6-4.comm.6.UAT", "6.UAT Oral Communication (CI-M)", ["6.UAT"]),
      course("6-4.comm.6.UAR", "6.UAR Seminar in Undergraduate Advanced Research (CI-M)", ["6.UAR"]),
    ]),
    // 2023-2024 AI+D AUS (smaller list)
    tag("6-4.aus_aid", "One subject from AI+D Advanced Undergraduate Subjects list", {
      allowedIds: [
        "18.404", "6.3730", "6.5151", "6.5831", "6.8371", "6.8701", "6.8711",
      ],
      count: 1,
      description:
        "2023-2024: one subject from the AI+D AUS list. " +
        "Approved subjects: 18.404, 6.3730, 6.5151, 6.5831, 6.8371, 6.8701, 6.8711.",
      sourceUrl: SOURCE_6_4_2024,
    }),
    tag("6-4.elec.cim2", "Second CI-M subject (from CI-M list)", {
      allowedIds: COMMUNICATION_INTENSIVE_IN_MAJOR_SUBJECTS,
      count: 1,
      description:
        "Beyond the Application CI-M, students must satisfy at least one requirement with a second CI-M subject.",
      sourceUrl: GROUPINGS_SOURCE_URL,
    }),
    tag("6-4.serc", "SERC-qualified subject", {
      allowedIds: ["6.3900", "6.3950", "6.4590", "6.8301", "6.8611"],
      count: 1,
      description:
        "2023-2024: at least one program requirement or elective must be SERC-qualified. " +
        "Approved: 6.3900, 6.3950, 6.4590, 6.8301, 6.8611.",
      sourceUrl: SOURCE_6_4_2024,
    }),
    dept("6-4.elec.flex", "One subject satisfying a 6 or 18 degree requirement", "6", {
      minNumber: 1000,
      count: 1,
      undergradOnly: true,
      description: "2023-2024: one subject satisfying a Course 6 or Course 18 degree requirement.",
    }),
  ]),
};

// ---------------------------------------------------------------------------
// MAJORS registry — keyed by [majorId][catalogYear]
// ---------------------------------------------------------------------------

/** All available catalog years, newest first. */
export const CATALOG_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"] as const;
export type CatalogYear = (typeof CATALOG_YEARS)[number];

/**
 * Multi-year registry.  Access with MAJORS_BY_YEAR["6-3"]["2023-2024"].
 * If a major didn't exist in a given catalog year (e.g., 6-5 before 2025-2026),
 * that key is absent — callers should fall back to the nearest available year.
 */
export const MAJORS_BY_YEAR: Record<string, Partial<Record<CatalogYear, MajorRequirement>>> = {
  "6-3": {
    "2026-2027": major6_3_2026_2027,
    "2025-2026": major6_3,
    "2024-2025": major6_3_v2024,
    "2023-2024": major6_3_v2024,
  },
  "6-4": {
    "2026-2027": major6_4,
    "2025-2026": major6_4,
    "2024-2025": major6_4_v2024,
    "2023-2024": major6_4_v2024,
  },
  "6-5": {
    "2026-2027": major6_5,
    "2025-2026": major6_5,
    // 6-5 did not exist before 2025-2026
  },
  "6-7": {
    "2026-2027": major6_7,
    "2025-2026": major6_7,
    "2024-2025": major6_7,
    "2023-2024": major6_7,
  },
  "6-9": {
    "2026-2027": major6_9,
    "2025-2026": major6_9,
    "2024-2025": major6_9,
    "2023-2024": major6_9,
  },
  "6-14": {
    "2026-2027": major6_14,
    "2025-2026": major6_14,
    "2024-2025": major6_14,
    "2023-2024": major6_14,
  },
};

/** Helper: get the best available MajorRequirement for a major + catalog year. */
export function getMajor(
  majorId: string,
  catalogYear: CatalogYear,
): MajorRequirement | undefined {
  const byYear = MAJORS_BY_YEAR[majorId];
  if (!byYear) return undefined;
  // Try exact year first, then fall back to nearest available.
  if (byYear[catalogYear]) return byYear[catalogYear];
  for (const y of CATALOG_YEARS) {
    if (byYear[y]) return byYear[y];
  }
  return undefined;
}

export const MAJORS: Record<string, MajorRequirement> = {
  "6-3": major6_3_2026_2027,
  "6-4": major6_4,
  "6-5": major6_5,
  "6-7": major6_7,
  "6-9": major6_9,
  "6-14": major6_14,
};

export const MAJOR_LIST: MajorRequirement[] = [
  major6_3_2026_2027,
  major6_4,
  major6_5,
  major6_7,
  major6_9,
  major6_14,
];

// Reference imports (kept here so a future requirement file referencing
// `trackNode` doesn't trigger an unused-import warning when this module
// re-exports it).
export { trackNode };
