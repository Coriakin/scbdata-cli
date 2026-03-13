import { describe, expect, it } from "vitest";
import { formatOutput } from "../src/output.js";

describe("formatOutput", () => {
  it("formats json", () => {
    expect(formatOutput({ desoId: "1234A5678B901" }, "json")).toContain("\"desoId\"");
  });

  it("formats list output", () => {
    expect(formatOutput({ desoId: "1234A5678B901" }, "list")).toContain("desoId: 1234A5678B901");
  });

  it("formats nested list output without dumping one-line geojson", () => {
    const text = formatOutput(
      {
        desoId: "0180C4640",
        geometry: {
          type: "Feature",
          id: "abc",
          properties: { desokod: "0180C4640" },
          geometry: {
            type: "Polygon",
            coordinates: []
          }
        }
      },
      "list"
    );

    expect(text).toContain("geometry:");
    expect(text).toContain("geometryType: Polygon");
    expect(text).not.toContain('"coordinates"');
  });

  it("formats address lists as readable address lines", () => {
    const text = formatOutput(
      [
        {
          id: "node/1",
          street: "Sturehillsvägen",
          houseNumber: "25",
          postcode: "117 56",
          city: "Stockholm",
          lat: 59.3,
          lon: 18.0,
          source: "overpass"
        }
      ],
      "list"
    );

    expect(text).toContain("Sturehillsvägen 25, 117 56 Stockholm");
    expect(text).not.toContain("id:");
  });

  it("formats csv output", () => {
    expect(formatOutput([{ street: "Main", houseNumber: "1" }], "csv")).toContain("street,houseNumber");
  });
});
