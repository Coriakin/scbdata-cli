import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

function captureHelp(command: ReturnType<typeof buildProgram>["commands"][number] | ReturnType<typeof buildProgram>): string {
  let output = "";
  command.configureOutput({
    writeOut: (str) => {
      output += str;
    },
    writeErr: (str) => {
      output += str;
    }
  });
  command.outputHelp();
  return output;
}

describe("CLI help output", () => {
  it("includes nested command details in root help", () => {
    const help = captureHelp(buildProgram(["node", "scbdata"]));

    expect(help).toContain("deso from-address <query>");
    expect(help).toContain("deso from-coords <lat> <lon>");
    expect(help).toContain("addresses from-address <query>");
    expect(help).toContain("valresultat <desoId> --election <type> --year <year>");
  });

  it("includes shared deso subcommand options in deso help", () => {
    const desoCommand = buildProgram(["node", "scbdata"]).commands.find((command) => command.name() === "deso");

    expect(desoCommand).toBeDefined();

    const desoHelp = captureHelp(desoCommand!);

    expect(desoHelp).toContain("Shared options for deso subcommands:");
    expect(desoHelp).toContain("--include-geometry");
    expect(desoHelp).toContain('--format <format>                    output format: list, json, csv (default: "list")');
  });
});
