import { describe, expect, it } from "vitest";
import { normalizeOverpassElement } from "../src/adapters/overpass.js";
import {
  normalizePrecinctGeometry,
  normalizeVoteRow,
  normalizeVoteRows,
  selectVoteSheetName
} from "../src/adapters/valmyndigheten.js";

describe("normalizeOverpassElement", () => {
  it("maps overpass tags to an address record", () => {
    const result = normalizeOverpassElement({
      id: 1,
      type: "node",
      lat: 59.33,
      lon: 18.06,
      tags: {
        "addr:street": "Drottninggatan",
        "addr:housenumber": "1",
        "addr:postcode": "111 51"
      }
    });

    expect(result).toMatchObject({
      id: "node/1",
      street: "Drottninggatan",
      houseNumber: "1",
      postcode: "111 51"
    });
  });
});

describe("normalizeVoteRow", () => {
  it("extracts precinct metadata and party votes", () => {
    const result = normalizeVoteRow(
      {
        Valdistriktskod: "018001001",
        Valdistriktsnamn: "Testdistrikt",
        Rostberattigade: 1000,
        "Avgivna roster": 800,
        "Rost_S": 300,
        "Rost_M": 200
      },
      "riksdag",
      2022
    );

    expect(result).toMatchObject({
      precinctCode: "018001001",
      precinctName: "Testdistrikt",
      eligibleVoters: 1000,
      totalVotes: 800,
      partyVotes: {
        S: 300,
        M: 200
      }
    });
  });

  it("accepts Valmyndigheten shorthand vote-row field names", () => {
    const result = normalizeVoteRow(
      {
        Lkfv: "018001003",
        Vdnamn: "Testdistrikt 3",
        "Röster S": 120,
        "Röster M": 90
      },
      "riksdag",
      2022
    );

    expect(result).toMatchObject({
      precinctCode: "018001003",
      precinctName: "Testdistrikt 3",
      partyVotes: {
        S: 120,
        M: 90
      }
    });
  });

  it("aggregates long-form party rows by precinct", () => {
    const result = normalizeVoteRows(
      [
        {
          Valdistriktskod: "01803944",
          Valdistriktnamn: "Hägersten 44",
          Parti: "S",
          Röster: 300,
          Röstberättigade: 1000
        },
        {
          Valdistriktskod: "01803944",
          Valdistriktnamn: "Hägersten 44",
          Parti: "M",
          Röster: 200,
          Röstberättigade: 1000
        }
      ],
      "riksdag",
      2022
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      precinctCode: "01803944",
      precinctName: "Hägersten 44",
      eligibleVoters: 1000,
      partyVotes: {
        S: 300,
        M: 200
      }
    });
  });
});

describe("normalizePrecinctGeometry", () => {
  it("normalizes geometry metadata", () => {
    const result = normalizePrecinctGeometry({
      type: "Feature",
      properties: {
        valdistriktskod: "018001001",
        valdistriktsnamn: "Testdistrikt",
        lan: "Stockholm"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.0, 59.0],
            [18.1, 59.0],
            [18.1, 59.1],
            [18.0, 59.1],
            [18.0, 59.0]
          ]
        ]
      }
    });

    expect(result).not.toBeNull();
    expect(result.code).toBe("018001001");
    expect(result.name).toBe("Testdistrikt");
    expect(result.county).toBe("Stockholm");
  });

  it("accepts normalized precinct property names", () => {
    const result = normalizePrecinctGeometry({
      type: "Feature",
      properties: {
        valdistrikt_kod: "018001002",
        valdistrikt_namn: "Testdistrikt 2",
        lans_namn: "Stockholm"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.0, 59.0],
            [18.1, 59.0],
            [18.1, 59.1],
            [18.0, 59.1],
            [18.0, 59.0]
          ]
        ]
      }
    });

    expect(result).not.toBeNull();
    expect(result?.code).toBe("018001002");
    expect(result?.name).toBe("Testdistrikt 2");
  });

  it("accepts Valmyndigheten shorthand property names", () => {
    const result = normalizePrecinctGeometry({
      type: "Feature",
      properties: {
        Lkfv: "018001003",
        Vdnamn: "Testdistrikt 3"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.0, 59.0],
            [18.1, 59.0],
            [18.1, 59.1],
            [18.0, 59.1],
            [18.0, 59.0]
          ]
        ]
      }
    });

    expect(result).not.toBeNull();
    expect(result?.code).toBe("018001003");
    expect(result?.name).toBe("Testdistrikt 3");
  });
});

describe("selectVoteSheetName", () => {
  it("prefers the election-specific vote sheet over Information", () => {
    expect(selectVoteSheetName(["Information", "roster_RD", "PivotAntal"], "riksdag")).toBe("roster_RD");
    expect(selectVoteSheetName(["Information", "roster_KF"], "kommun")).toBe("roster_KF");
    expect(selectVoteSheetName(["Information", "roster_RF"], "region")).toBe("roster_RF");
  });
});
