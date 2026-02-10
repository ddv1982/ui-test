import chalk from "chalk";
import ora, { type Ora } from "ora";

export const ui = {
  success: (msg: string) => console.log(chalk.green("✔ ") + msg),
  error: (msg: string) => console.error(chalk.red("✖ ") + msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠ ") + msg),
  info: (msg: string) => console.log(chalk.blue("ℹ ") + msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  heading: (msg: string) => console.log(chalk.bold.underline(msg)),
  step: (msg: string) => console.log(chalk.cyan("  → ") + msg),

  spinner(text: string): Ora {
    return ora({ text, color: "cyan" });
  },

  table(rows: string[][]) {
    if (rows.length === 0) return;
    const colWidths = rows[0].map((_, col) =>
      Math.max(...rows.map((row) => (row[col] ?? "").length))
    );
    for (const row of rows) {
      const line = row
        .map((cell, i) => cell.padEnd(colWidths[i]))
        .join("  ");
      console.log("  " + line);
    }
  },
};
