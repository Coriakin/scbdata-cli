import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

const version = (process.env.RELEASE_VERSION ?? packageJson.version).replace(/^v/, "");
const repository = process.env.GITHUB_REPOSITORY;
const darwinArm64Sha256 = process.env.DARWIN_ARM64_SHA256;
const linuxX64Sha256 = process.env.LINUX_X64_SHA256;
const linuxArm64Sha256 = process.env.LINUX_ARM64_SHA256;

if (!repository || !darwinArm64Sha256 || !linuxX64Sha256 || !linuxArm64Sha256) {
  throw new Error("Missing required environment variables for formula generation.");
}

const baseUrl = `https://github.com/${repository}/releases/download/v${version}`;
const formula = `class Scbdata < Formula
  desc "CLI for DeSO lookups, address extraction, and election result aggregation"
  homepage "https://github.com/${repository}"
  version "${version}"
  license "${packageJson.license}"

  on_macos do
    on_arm do
      url "${baseUrl}/scbdata-v${version}-darwin-arm64.tar.gz"
      sha256 "${darwinArm64Sha256}"
    end
  end

  on_linux do
    on_intel do
      url "${baseUrl}/scbdata-v${version}-linux-x64.tar.gz"
      sha256 "${linuxX64Sha256}"
    end

    on_arm do
      url "${baseUrl}/scbdata-v${version}-linux-arm64.tar.gz"
      sha256 "${linuxArm64Sha256}"
    end
  end

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"scbdata").write_env_script libexec/"bin/scbdata", {}
  end

  test do
    assert_match "DeSO and election data lookup CLI", shell_output("#{bin}/scbdata --help")
  end
end
`;

process.stdout.write(formula);
