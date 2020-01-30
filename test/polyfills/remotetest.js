"use strict";

global.Promise = require("bluebird");
// Enable long stack traces
Promise.config({
  longStackTraces: true
});

// By default, promises fail silently if you don't attach a .catch() handler to them.
//This tool keeps track of unhandled rejections globally. If any remain unhandled at the end of your process, it logs them to STDERR and exits with code 1.
const hardRejection = require("hard-rejection");
// Install the unhandledRejection listeners
hardRejection();

const path = require("path");
const fs = require("fs-extra");
const cli = require("cli-color");
const _ = require("lodash");
const browserstack = require("./browserstack");
const normalizeUserAgent = require("../../lib/index").normalizeUserAgent;
const TestJob = require("./test-job");

// Grab all the browsers from BrowserStack which are officially supported by the polyfil service.
const TOML = require("@iarna/toml");
const browserlist = TOML.parse(
  fs.readFileSync(path.join(__dirname, "./browsers.toml"), "utf-8")
).browsers;
const browsers = browserlist.filter(
  uaString => normalizeUserAgent(uaString) !== "other/0.0.0"
);

const testResultsFile = path.join(__dirname, "results.json");
const testResults = {};
const pollTick = 100;
const testBrowserTimeout = 120000;
const mode = "control";
// const mode = ["all", "targeted", "control"].filter(x => x in argv)[0] || "all";
const url = "http://localhost:8080/?mode=" + mode;
const tunnelId =
  "build:" +
  (process.env.CIRCLE_BUILD_NUM || process.env.NODE_ENV || "null") +
  "_" +
  new Date().toISOString();
const jobs = browsers.map(
  browser =>
    new TestJob(
      url,
      mode,
      browser,
      tunnelId,
      browserstack.creds,
      testBrowserTimeout,
      pollTick,
      browserstack,
      true
    )
);
const tunnel = browserstack.tunnel(true);
const printProgress = (function() {
  let previousPrint;
  return jobs => {
    const out = ["-".repeat(80)];
    let readyCount = 0;
    jobs.forEach(job => {
      let msg = "";
      switch (job.state) {
        case "complete": {
          if (job.results.failed) {
            msg = cli.red(
              `✘ ${job.results.total} tests, ${job.results.failed} failures`
            );
          } else {
            msg = cli.green(`✓ ${job.results.total} tests`);
          }
          msg += `  ${job.duration} seconds to complete`;
          break;
        }
        case "error": {
          msg = cli.red(`⚠️  ${job.results}`);
          break;
        }
        case "ready": {
          readyCount += 1;
          break;
        }
        case "running": {
          msg =
            job.results.runnerCompletedCount + "/" + job.results.runnerCount;
          if (job.results.failed) {
            msg += cli.red("  ✘ " + job.results.failed);
          }
          const timeWaiting = Math.floor(
            (Date.now() - job.lastUpdateTime) / 1000
          );
          if (timeWaiting > 5) {
            msg += cli.yellow("  🕒  " + timeWaiting + "s");
          }
          break;
        }
        default: {
          msg = job.state;
          const timeWaiting = Math.floor(
            (Date.now() - job.lastUpdateTime) / 1000
          );
          if (timeWaiting > 5) {
            msg += cli.yellow("  🕒  " + timeWaiting + "s");
          }
        }
      }
      if (msg) {
        out.push(
          ` • Browser: ${job.ua.padEnd(
            " ",
            20
          )} Testing mode: ${job.mode.padEnd(" ", 8)} ${msg}`
        );
      }
    });
    if (readyCount) {
      out.push(" + " + readyCount + " job(s) queued");
    }
    const print = out.join("\n") + "\n";
    if (previousPrint !== print) {
      process.stdout.write(print);
    }
    previousPrint = print;
  };
}());

(async function() {
  try {
    await tunnel.openTunnel();
    const cliFeedbackTimer = setInterval(() => printProgress(jobs), pollTick);
    // Run jobs within concurrency limits
    await new Promise((resolve, reject) => {
      const results = [];
      let resolvedCount = 0;
      function pushJob() {
        results.push(
          jobs[results.length]
            .run()
            .then(job => {
              if (job.state === "complete") {
                const [family, version] = job.ua.split("/");
                _.set(
                  testResults,
                  [family, version, job.mode],
                  job.getResultSummary()
                );
              }
              resolvedCount++;
              if (results.length < jobs.length) {
                pushJob();
              } else if (resolvedCount === jobs.length) {
                resolve();
              }
              return job;
            })
            .catch(e => {
              console.log(e.stack || e);
              reject(e);
            })
        );
      }
      const concurrency = 5;
      for (let i = 0; i < concurrency && i < jobs.length; i++) {
        pushJob();
      }
    });

    await fs.outputJSON(testResultsFile, testResults);

    clearTimeout(cliFeedbackTimer);

    printProgress(jobs);

    await tunnel.closeTunnel().then(() => console.log("Tunnel closed"));

    const totalFailureCount = jobs.reduce(
      (out, job) => out + (job.state === "complete" ? job.results.failed : 1),
      0
    );
    if (totalFailureCount) {
      console.log(cli.bold.white("\nFailures:"));
      jobs.forEach(job => {
        if (job.results && job.results.tests) {
          job.results.tests.forEach(test => {
            console.log(" - " + job.ua + ":");
            console.log("    -> " + test.name);
            console.log(
              "       " +
                url.replace(/test\/director/, "test/tests") +
                "&feature=" +
                test.failingSuite
            );
            console.log("       " + test.message);
          });
        } else if (job.state !== "complete") {
          console.log(
            " • " +
              job.ua +
              " (" +
              job.mode +
              "): " +
              cli.red(job.results || "No results")
          );
        }
      });
      console.log("");
      throw new Error("Failures detected");
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
    process.exit(1);
  }
}());
