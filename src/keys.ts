// Keys come from the macOS Keychain (or the box's stand-in for it, which reads ~/.secrets/<service>.<account>).
// They are read in-process and never printed or passed in argv.
import { execFileSync } from "node:child_process";

export function secret(service: string, account = "assay"): string {
  try {
    return execFileSync("security", ["find-generic-password", "-a", account, "-s", service, "-w"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`missing secret ${service} / ${account}: security add-generic-password -a ${account} -s ${service} -w`);
  }
}
