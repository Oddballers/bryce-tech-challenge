/* eslint-disable @typescript-eslint/no-explicit-any */
import { setGlobalOptions } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import axios from "axios";
import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import { join } from "path";
import { writeFileSync } from "fs";
import os from "os";
import Busboy from "busboy";

// Only use dotenv in local development
if (process.env.NODE_ENV !== "production") {
  import("dotenv").then((dotenv) => dotenv.config());
}

setGlobalOptions({ maxInstances: 10 });

// Define secrets once (Firebase Functions v2 best practice)
// They must also be declared in the onRequest options to be accessible via .value()
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");
const GITHUB_USERNAME = defineSecret("GITHUB_USERNAME");

const REPO_NAME = "oddball-code-challenge-repo";
const BRANCH_NAME = "feature/initial-setup";

export const generateCodingChallenge = onRequest(
  { cors: true, secrets: [OPENAI_API_KEY, GITHUB_TOKEN, GITHUB_USERNAME] },

  async (req, res) => { 
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");     
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    logger.info("=== TEST LOG: generateCodingChallenge function triggered ===");
    try {
      // Add logging to debug environment variables
      logger.info("Checking environment variables...");

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
      }

      // Prefer local env values when running locally, otherwise use secret values.
      const openaiKey = process.env.OPENAI_API_KEY || OPENAI_API_KEY.value();
      const githubToken = process.env.GITHUB_TOKEN || GITHUB_TOKEN.value();
      const githubUsername =
        process.env.GITHUB_USERNAME || GITHUB_USERNAME.value();

      const contentType = req.headers?.["content-type"];
      if (!contentType?.includes("multipart/form-data")) {
        res
          .status(400)
          .json({ error: "Content-Type must be multipart/form-data" });
        return;
      }

      logger.info(
        `Raw body length: ${req.rawBody ? req.rawBody.length : "n/a"} bytes`
      );
      // Parse difficulty from multipart form data
      type MultipartFields = {
        difficulty?: string;
        first_name?: string;
        job_title?: string;
        last_name?: string;
      };
      const multipartResult = (await parseMultipart(req)) as {
        resumeBuffer?: Buffer;
        jdBuffer?: Buffer;
        rawError?: string;
      } & MultipartFields;
      const { resumeBuffer, jdBuffer, rawError, difficulty, first_name, last_name, job_title } = multipartResult;

      if (rawError === "UNEXPECTED_END") {
        // Provide a clearer error for client to possibly retry
        res
          .status(400)
          .json({
            error:
              "Malformed multipart form data (unexpected end of form). Ensure you are sending as multipart/form-data with a proper boundary.",
          });
        return;
      }

      if (!resumeBuffer || !jdBuffer) {
        res.status(400).json({
          error: "Both resume and job description files are required.",
          received: {
            resume: !!resumeBuffer,
            jobDescription: !!jdBuffer,
          },
        });
        return;
      }

      const resumeText = resumeBuffer.toString("utf-8");
      const jdText = jdBuffer.toString("utf-8");

      if (!resumeText.trim() || !jdText.trim()) {
        res
          .status(400)
          .json({ error: "Both files must contain text content." });
        return;
      }

      const prompt = `You are an expert technical interviewer. Based on the resume below and the job description, generate a coding challenge that tests relevant skills. The challenge should be appropriate for a(n) ${
        difficulty || "intermediate"
      } and then continue with the rest of the problem description. Take 40% of the user's resume and 60% of the job description when creating this challenge.  
    Add several starter code files for the user to work with.  Make sure to add some bugs in these starter files.  Do not call out in the file where the bug is located.  Keep this a secret. This coding challenge needs to be in text format, styled for a GitHub readme.\n\nResume:\n${resumeText}\n\nJob Description:\n${jdText}\n\nGenerate a coding challenge with the following structure:\n# Coding Challenge\n## Problem Description\n## Requirements\n## Technical Specifications\n## Evaluation Criteria\n## Submission Instructions\n\nCoding Challenge:
    
    *Requirements* 
    - Do not stop until you are done creating the challenge.
    - You must generate sample code file to use in the challenge.
    - Be sure to include the name of the user in the challenge prompt using ${first_name} in the Problem Description, if provided.
    - Be sure to include the ${job_title || ''} in the introduction, if provided.
    - The challenge should be able to be completed in 90 minutes.`;

      logger.info("Making OpenAI API call...");
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 6000,
        },
        {
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 300000,
        }
      );

      const output = response.data.choices[0].message.content.trim();
      logger.info("OpenAI response received, initializing repo...");

      const repoInfo = await initializeGitRepo(
        output,
        githubToken,
        githubUsername,
        last_name,
        job_title
      );
      logger.info("Repository initialized successfully");

      res.json({
        challengeLink: repoInfo?.devUrl,
        githubRepo: repoInfo?.repoUrl,
      });
    } catch (error) {
      logger.error("Error in generateCodingChallenge:", error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        logger.error("Axios error details:", { status, message });
        if (status === 404) {
          res.status(404).json({ error: "OpenAI endpoint not found." });
          return;
        } else if (status === 401) {
          res.status(401).json({ error: "Invalid OpenAI API key." });
          return;
        } else if (status === 429) {
          res
            .status(429)
            .json({ error: "Rate limit exceeded. Try again later." });
          return;
        }
        res.status(503).json({ error: `OpenAI service error: ${message}` });
        return;
      }
      res.status(500).json({
        error: "Unexpected server error while generating challenge.",
        details: (error as Error).message,
      });
    }
  }
);

async function initializeGitRepo(
  cdChallenge: string,
  githubToken: string,
  githubUsername: string,
  last_name?: string,
  job_title?: string
) {
  try {
    const octokit = new Octokit({ auth: githubToken });
    logger.info("Creating GitHub repo...");
    const timestamp = Date.now();
    const slugify = (str?: string) => str ? str.trim().replace(/\s+/g, ' ').toLowerCase().split(' ').join('-') : '';
    const uniqueRepoName = `${REPO_NAME}-${timestamp}-${last_name?.toLowerCase()}-${slugify(job_title)}`;
    const repoResponse = await octokit.rest.repos.createForAuthenticatedUser({
      name: uniqueRepoName,
      private: false,
      description: "Automated coding challenge repository",
      auto_init: true,
    });
    logger.info(`Repository created: ${repoResponse.data.html_url}`);
    const remoteUrl = `https://${githubUsername}:${githubToken}@github.com/${githubUsername}/${uniqueRepoName}.git`;
    const localPath = join(os.tmpdir(), uniqueRepoName);
    logger.info("Cloning repo locally...");
    const git = simpleGit();
    await git.clone(remoteUrl, localPath);
    logger.info("Writing README.md...");
    writeFileSync(
      join(localPath, "README.md"),
      `# ${uniqueRepoName}\n\n${cdChallenge}`
    );
    const repoGit = simpleGit(localPath);
    // Ensure git identity is set for this ephemeral environment (Cloud Functions container)
    const authorName =
      process.env.GIT_AUTHOR_NAME || githubUsername || "automation-bot";
    const authorEmail =
      process.env.GIT_AUTHOR_EMAIL ||
      `${githubUsername || "automation"}@users.noreply.github.com`;
    try {
      await repoGit.addConfig("user.name", authorName);
      await repoGit.addConfig("user.email", authorEmail);
      logger.info(`Configured git author: ${authorName} <${authorEmail}>`);
    } catch (cfgErr) {
      logger.warn("Failed setting local git config (continuing):", cfgErr);
    }
    await repoGit.checkoutLocalBranch(BRANCH_NAME);
    await repoGit.add("README.md");
    try {
      await repoGit.commit("Add coding challenge README");
    } catch (commitErr) {
      if (
        commitErr instanceof Error &&
        /identity unknown/i.test(commitErr.message)
      ) {
        logger.error(
          "Git commit failed due to identity; re-attempting after forcing config"
        );
        try {
          await repoGit.addConfig("user.name", authorName);
          await repoGit.addConfig("user.email", authorEmail);
          await repoGit.commit("Add coding challenge README");
        } catch (retryErr) {
          logger.error("Retry commit failed:", retryErr);
          throw retryErr;
        }
      } else {
        throw commitErr;
      }
    }
    await repoGit.push("origin", BRANCH_NAME);
    logger.info("Repository setup completed successfully");
    return {
      repoUrl: repoResponse.data.html_url,
      branchUrl: `${repoResponse.data.html_url}/tree/${BRANCH_NAME}`,
      devUrl: `https://vscode.dev/github/${githubUsername}/${uniqueRepoName}/tree/${BRANCH_NAME}`,
    };
  } catch (err) {
    logger.error("Error initializing repo:", err);
    throw err;
  }
}

// Helper to parse multipart form data in Firebase Functions v2 reliably.
// Uses req.rawBody when available (provided by Functions) to avoid streaming truncation causing 'Unexpected end of form'.
function parseMultipart(
  req: any
): Promise<{ resumeBuffer?: Buffer; jdBuffer?: Buffer; rawError?: string; [key: string]: any }> {
  return new Promise((resolve) => {
    let resumeBuffer: Buffer | undefined;
    let jdBuffer: Buffer | undefined;
    let finished = false;
    let encounteredUnexpectedEnd = false;
    const fields: { [key: string]: string } = {};

    try {
      const busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB per file
          files: 2,
        },
      });

      busboy.on(
        "file",
        (fieldname: string, file: NodeJS.ReadableStream, info: any) => {
          logger.info(
            `Receiving file field=${fieldname} filename=${info?.filename}`
          );
          const buffers: Buffer[] = [];
          file.on("data", (d: Buffer) => buffers.push(d));
          file.on("limit", () => {
            logger.warn(`File size limit exceeded for field ${fieldname}`);
          });
          file.on("end", () => {
            const buf = Buffer.concat(buffers);
            if (fieldname === "resume") resumeBuffer = buf;
            if (fieldname === "job_description") jdBuffer = buf;
            logger.info(`Completed file field=${fieldname} size=${buf.length}`);
          });
        }
      );

      busboy.on("field", (f: string, v: string) => {
        logger.debug?.(`Field ${f} = ${v} length=${v?.length}`);
        fields[f] = v;
      });

      busboy.on("error", (err: any) => {
        logger.error("Busboy stream error", err);
        if (err?.message?.includes("Unexpected end of form")) {
          encounteredUnexpectedEnd = true;
        }
      });

      const finalize = () => {
        if (finished) return;
        finished = true;
        resolve({
          resumeBuffer,
          jdBuffer,
          rawError: encounteredUnexpectedEnd ? "UNEXPECTED_END" : undefined,
          ...fields,
        });
      };

      busboy.on("finish", finalize);
      busboy.on("close", finalize); // some environments emit close
      busboy.on("end", finalize);

      // Use rawBody when available (Firebase Functions provides full buffer)
      if (req.rawBody) {
        busboy.end(req.rawBody);
      } else {
        // Fallback streaming
        req.pipe(busboy);
      }

      // Safety timeout (in case finish not emitted)
      setTimeout(() => finalize(), 15000);
    } catch (e: any) {
      logger.error("parseMultipart setup failure", e);
      resolve({ rawError: e?.message || "SETUP_ERROR" });
    }
  });
}

export const generateCodingChallengeV2 = onRequest(
  { cors: true, secrets: [OPENAI_API_KEY, GITHUB_TOKEN, GITHUB_USERNAME] },
  async (req, res) => {
    try {
      // Add logging to debug environment variables
      logger.info("Checking environment variables...");

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
      }

      // Prefer local env values when running locally, otherwise use secret values.
      const openaiKey = process.env.OPENAI_API_KEY || OPENAI_API_KEY.value();
      const githubToken = process.env.GITHUB_TOKEN || GITHUB_TOKEN.value();
      const githubUsername =
        process.env.GITHUB_USERNAME || GITHUB_USERNAME.value();

      const contentType = req.headers?.["content-type"];
      if (!contentType?.includes("multipart/form-data")) {
        res
          .status(400)
          .json({ error: "Content-Type must be multipart/form-data" });
        return;
      }

      logger.info(
        `Raw body length: ${req.rawBody ? req.rawBody.length : "n/a"} bytes`
      );
      const { resumeBuffer, jdBuffer, rawError } = await parseMultipart(req);

      if (rawError === "UNEXPECTED_END") {
        // Provide a clearer error for client to possibly retry
        res
          .status(400)
          .json({
            error:
              "Malformed multipart form data (unexpected end of form). Ensure you are sending as multipart/form-data with a proper boundary.",
          });
        return;
      }

      if (!resumeBuffer || !jdBuffer) {
        res.status(400).json({
          error: "Both resume and job description files are required.",
          received: {
            resume: !!resumeBuffer,
            jobDescription: !!jdBuffer,
          },
        });
        return;
      }

      const resumeText = resumeBuffer.toString("utf-8");
      const jdText = jdBuffer.toString("utf-8");

      if (!resumeText.trim() || !jdText.trim()) {
        res
          .status(400)
          .json({ error: "Both files must contain text content." });
        return;
      }

      const prompt = `You are an expert technical interviewer. Based on the resume below and the job description, generate a coding challenge that tests relevant skills.Take 40% of the user's resume and 60% of the job description when creating this challenge.  Add several starter code files for the user to work with.  Make sure to add some bugs in these starter files.  Do not call out in the file where the bug is located.  Keep this a secret. This coding challenge needs to be in text format, styled for a GitHub readme.\n\nResume:\n${resumeText}\n\nJob Description:\n${jdText}\n\nGenerate a coding challenge with the following structure:\n# Coding Challenge\n## Problem Description\n## Requirements\n## Technical Specifications\n## Evaluation Criteria\n## Submission Instructions\n\nCoding Challenge:`;

      logger.info("Making OpenAI API call...");
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 6000,
        },
        {
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 300000,
        }
      );

      const output = response.data.choices[0].message.content.trim();
      logger.info("OpenAI response received, initializing repo...");

      const repoInfo = await initializeGitRepo(
        output,
        githubToken,
        githubUsername,
      );
      logger.info("Repository initialized successfully");

      res.json({
        challengeLink: repoInfo?.devUrl,
        githubRepo: repoInfo?.repoUrl,
      });
    } catch (error: any) {
      logger.error("Error in generateCodingChallenge:", error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        logger.error("Axios error details:", { status, message });

        if (status === 404) {
          res.status(404).json({ error: "OpenAI endpoint not found." });
          return;
        } else if (status === 401) {
          res.status(401).json({ error: "Invalid OpenAI API key." });
          return;
        } else if (status === 429) {
          res
            .status(429)
            .json({ error: "Rate limit exceeded. Try again later." });
          return;
        }
        res.status(503).json({ error: `OpenAI service error: ${message}` });
        return;
      }

      res.status(500).json({
        error: "Unexpected server error while generating challenge.",
        details: error.message,
      });
    }
  }
);
