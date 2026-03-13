import { describe, expect, it } from "vitest";
import { normalizeOverpassElement } from "../src/adapters/overpass.js";
import { normalizePrecinctGeometry, normalizeVoteRow } from "../src/adapters/valmyndigheten.js";

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

    expect(result.code).toBe("018001001");
    expect(result.name).toBe("Testdistrikt");
    expect(result.county).toBe("Stockholm");
  });
});
