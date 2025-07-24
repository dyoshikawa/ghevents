#!/usr/bin/env node

import { Command } from "commander";
import { gheventsCommand } from "./commands/ghevents.js";

const program = new Command();

program
  .name("ghevents")
  .description("CLI tool to fetch GitHub events and export to XML")
  .version("0.1.0");

program.addCommand(gheventsCommand);

program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
