import {
  getPackageName,
  getPackageVersion,
  readPackageJson,
} from "../packageInfo.js";
import { RELEASE_META } from "../releaseMeta.js";
import { MCP_SERVER_NAME } from "../serverConstants.js";

export class ServerAboutTool {
  name = "server_about";
  description =
    "Returns this MCP server package version, release date, and latest release highlights. Use to confirm which build is running.";

  async run() {
    const pkg = readPackageJson();
    const packageName = getPackageName();
    const version = getPackageVersion();
    const lines = [
      `Package ${packageName} v${version} (${RELEASE_META.releaseDate}).`,
      `MCP server name: ${MCP_SERVER_NAME}.`,
    ];

    return {
      success: true,
      message: lines.join(" "),
      data: {
        mcpServerName: MCP_SERVER_NAME,
        packageName,
        version,
        releaseDate: RELEASE_META.releaseDate,
        latestChanges: [...RELEASE_META.latestChanges],
        description: pkg.description,
        homepage: pkg.homepage,
        repositoryUrl: pkg.repository?.url,
      },
      meta: {
        releaseMetaForVersion: RELEASE_META.forVersion,
        matchesPackageVersion: RELEASE_META.forVersion === version,
      },
    };
  }
}
