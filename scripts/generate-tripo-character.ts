/**
 * Generate one reference-approved character with Fal's Tripo H3.1 endpoint.
 * This is an offline asset-authoring script; never import it into the web app.
 *
 * FAL_KEY must be supplied in the environment or the repository's ignored .env.
 *   npx tsx scripts/generate-tripo-character.ts jack assets/tripo/references/jack.png --dry-run
 *   npx tsx scripts/generate-tripo-character.ts jack assets/tripo/references/jack.png
 * Rerun the same command to resume its saved request, including after a timeout.
 * A deliberately new paid attempt needs --version v2 (separate receipt and output).
 * If submission was interrupted before its request ID was saved, find that ID in
 * Fal's dashboard, then rerun with --request-id ID. Never silently submit again.
 *
 * Reference copies: assets/tripo/references/<id>[-<version>].png
 * Durable receipts: assets/tripo/jobs/<id>[-<version>].json
 * Untouched output: assets/tripo/source/<id>[-<version>]-original.glb
 * Schema: https://fal.ai/models/tripo3d/h3.1/image-to-3d/api
 * Current advertised generation cost for these settings: $0.60, excluding retries.
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MODEL = "tripo3d/h3.1/image-to-3d";
const QUEUE = "https://queue.fal.run";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type FileResult = {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
};
type Result = {
  model_mesh: FileResult;
  model_urls: {
    glb?: FileResult | null;
    fbx?: FileResult | null;
    pbr_model?: FileResult | null;
    base_model?: FileResult | null;
  };
  rendered_image?: FileResult | null;
};
type Receipt = {
  schemaVersion: 1;
  character: string;
  version: string | null;
  model: typeof MODEL;
  createdAt: string;
  updatedAt: string;
  input: {
    sourcePath: string;
    referencePath: string;
    sha256: string;
    bytes: number;
    mimeType: "image/png";
  };
  parameters: ReturnType<typeof parametersFor>;
  fingerprint: string;
  state:
    | "prepared"
    | "submitting"
    | "submission-uncertain"
    | "rejected"
    | "queued"
    | "completed"
    | "failed"
    | "downloaded";
  request?: {
    requestId: string;
    statusUrl: string;
    responseUrl: string;
    cancelUrl?: string;
  };
  lastStatus?: string;
  lastError?: string;
  result?: Result;
  output?: {
    path: string;
    sha256: string;
    bytes: number;
    downloadedAt: string;
    format: "GLB 2.0";
  };
};

function hash(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parametersFor(id: string) {
  const seed = (purpose: string) =>
    createHash("sha256")
      .update(`big-money-poker:tripo-h3.1:${id}:${purpose}`)
      .digest()
      .readUInt32BE(0) & 0x7fffffff;
  return {
    face_limit: 60000,
    texture: true,
    pbr: true,
    texture_quality: "detailed" as const,
    geometry_quality: "detailed" as const,
    texture_alignment: "original_image" as const,
    orientation: "default" as const,
    auto_size: false,
    quad: false,
    model_seed: seed("geometry"),
    texture_seed: seed("texture"),
  };
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function optionalFile(path: string) {
  try {
    return await readFile(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function saveReceipt(path: string, receipt: Receipt) {
  receipt.updatedAt = new Date().toISOString();
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function lockJob(path: string): Promise<() => Promise<void>> {
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: hostname() }),
    );
    await handle.close();
    return async () => {
      await unlink(path);
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = JSON.parse(await readFile(path, "utf8")) as {
      pid: number;
      host: string;
    };
    if (
      owner.host !== hostname() ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0
    )
      throw new Error(
        "This job has a lock from another host or an invalid owner; inspect the lock before retrying.",
      );
    try {
      process.kill(owner.pid, 0);
    } catch (probe) {
      if ((probe as NodeJS.ErrnoException).code === "ESRCH") {
        await unlink(path);
        return lockJob(path);
      }
      throw new Error(
        "Cannot verify the existing job lock; refusing a concurrent submission.",
      );
    }
    throw new Error(`This job is already running (process ${owner.pid}).`);
  }
}

function queueUrl(value: unknown) {
  if (typeof value !== "string")
    throw new Error("Queue response is missing a request URL.");
  const url = new URL(value);
  if (url.origin !== QUEUE || url.username || url.password)
    throw new Error(
      "Refusing to send Fal credentials to an unexpected queue host.",
    );
  return url.href;
}

function validateGlb(bytes: Buffer) {
  if (
    bytes.length < 20 ||
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Error(
      "Downloaded artifact is not a complete GLB 2.0 file; original output was not written.",
    );
  let offset = 12;
  let chunks = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length)
      throw new Error("Truncated GLB chunk header.");
    const length = bytes.readUInt32LE(offset);
    const kind = bytes.readUInt32LE(offset + 4);
    if (length % 4 !== 0 || offset + 8 + length > bytes.length)
      throw new Error("Invalid GLB chunk length.");
    if (chunks === 0) {
      if (kind !== 0x4e4f534a)
        throw new Error("GLB is missing its initial JSON chunk.");
      const json = JSON.parse(
        bytes.toString("utf8", offset + 8, offset + 8 + length),
      );
      if (json.asset?.version !== "2.0")
        throw new Error("Unsupported glTF asset version.");
    }
    offset += 8 + length;
    chunks++;
  }
  if (chunks === 0 || offset !== bytes.length)
    throw new Error("Invalid GLB chunk layout.");
}

async function writeOriginal(path: string, bytes: Buffer) {
  const existing = await optionalFile(path);
  if (existing) {
    if (hash(existing) !== hash(bytes))
      throw new Error(
        "An original asset already exists with different bytes; use a new --version, never overwrite it.",
      );
    return;
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    // Publish complete bytes atomically without replacing an existing original.
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (hash(await readFile(path)) !== hash(bytes))
      throw new Error(
        "A different original appeared during download; it was preserved.",
      );
  } finally {
    await unlink(temporary);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: npx tsx scripts/generate-tripo-character.ts <character-id> <reference.png> [--version v2] [--request-id ID] [--timeout-seconds 900] [--dry-run]\nSame command resumes its receipt. --version explicitly starts a separate paid attempt. --request-id recovers an uncertain submission. --dry-run performs no writes or network requests.",
    );
    return;
  }
  const [id, imagePath, ...flags] = args;
  if (
    !id ||
    !imagePath ||
    !/^[a-z][a-z0-9-]{0,47}$/.test(id) ||
    imagePath.startsWith("--")
  )
    throw new Error(
      "Provide a lowercase character ID and an explicit PNG image path. Use --help for usage.",
    );
  let version: string | null = null,
    requestId: string | null = null,
    timeoutSeconds = 900,
    dryRun = false;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === "--dry-run") dryRun = true;
    else if (flag === "--version") {
      version = flags[++i];
      if (!version || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(version))
        throw new Error(
          "--version requires a short lowercase version name, e.g. v2.",
        );
    } else if (flag === "--request-id") {
      requestId = flags[++i];
      if (!requestId || !/^[A-Za-z0-9_-]{8,128}$/.test(requestId))
        throw new Error("Invalid --request-id.");
    } else if (flag === "--timeout-seconds") {
      timeoutSeconds = Number(flags[++i]);
      if (
        !Number.isFinite(timeoutSeconds) ||
        timeoutSeconds < 10 ||
        timeoutSeconds > 3600
      )
        throw new Error("--timeout-seconds must be between 10 and 3600.");
    } else throw new Error(`Unknown option: ${flag}`);
  }

  const job = version ? `${id}-${version}` : id;
  const inputPath = resolve(imagePath);
  const referencePath = resolve(ROOT, `assets/tripo/references/${job}.png`);
  const receiptPath = resolve(ROOT, `assets/tripo/jobs/${job}.json`);
  const outputPath = resolve(ROOT, `assets/tripo/source/${job}-original.glb`);
  const image = await readFile(inputPath);
  if (!image.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error(
      "The reference must be a PNG file; no input was submitted.",
    );
  const inputHash = hash(image);
  const parameters = parametersFor(id);
  const fingerprint = hash(
    JSON.stringify({ model: MODEL, inputHash, parameters }),
  );
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          character: id,
          job,
          model: MODEL,
          parameters,
          imageSha256: inputHash,
          referencePath,
          receiptPath,
          outputPath,
          estimatedGenerationUsd: 0.6,
          networkRequests: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const path of [referencePath, receiptPath, outputPath])
    await mkdir(dirname(path), { recursive: true });
  const unlock = await lockJob(`${receiptPath}.lock`);
  try {
    const saved = await optionalFile(receiptPath);
    let receipt: Receipt;
    if (saved) {
      receipt = JSON.parse(saved.toString("utf8")) as Receipt;
      if (
        receipt.schemaVersion !== 1 ||
        receipt.character !== id ||
        receipt.version !== version ||
        receipt.model !== MODEL ||
        receipt.input?.sha256 !== inputHash ||
        receipt.fingerprint !== fingerprint
      )
        throw new Error(
          "Input or generation settings do not match the saved receipt. Resume using the original image/settings, or explicitly choose a new --version.",
        );
    } else {
      if (await optionalFile(outputPath))
        throw new Error(
          "An original model already exists without this receipt. Use --version to create a separate asset.",
        );
      const now = new Date().toISOString();
      receipt = {
        schemaVersion: 1,
        character: id,
        version,
        model: MODEL,
        createdAt: now,
        updatedAt: now,
        input: {
          sourcePath: inputPath,
          referencePath: relative(ROOT, referencePath),
          sha256: inputHash,
          bytes: image.length,
          mimeType: "image/png",
        },
        parameters,
        fingerprint,
        state: "prepared",
      };
      await saveReceipt(receiptPath, receipt);
    }

    const reference = await optionalFile(referencePath);
    if (reference && hash(reference) !== inputHash)
      throw new Error(
        "The archived reference differs; use a new --version to preserve it.",
      );
    if (!reference) await writeOriginal(referencePath, image);

    if (receipt.output) {
      const existing = await optionalFile(outputPath);
      if (existing) {
        validateGlb(existing);
        if (hash(existing) !== receipt.output.sha256)
          throw new Error(
            "The downloaded original differs from its receipt; refusing to overwrite it.",
          );
        console.log(
          `${job}: original GLB already verified at ${relative(ROOT, outputPath)}. No network request needed.`,
        );
        return;
      }
    }

    if (requestId) {
      if (receipt.request && receipt.request.requestId !== requestId)
        throw new Error(
          "This receipt already belongs to a different request ID.",
        );
      if (!receipt.request) {
        const base = `${QUEUE}/${MODEL}/requests/${encodeURIComponent(requestId)}`;
        receipt.request = {
          requestId,
          statusUrl: `${base}/status`,
          responseUrl: base,
          cancelUrl: `${base}/cancel`,
        };
        receipt.state = "queued";
        delete receipt.lastError;
        await saveReceipt(receiptPath, receipt);
      }
    }

    const key = process.env.FAL_KEY;
    if (!key)
      throw new Error(
        "FAL_KEY is required in the server environment or ignored .env. No generation request was submitted.",
      );
    const headers = {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    };
    if (!receipt.request) {
      if (receipt.state !== "prepared")
        throw new Error(
          "An earlier submission may have been charged. Recover its request ID from Fal and rerun with --request-id ID, or explicitly choose a new --version. No duplicate request was sent.",
        );
      // Persist this sentinel BEFORE the chargeable operation. Even if the HTTP
      // response gets lost, a later run cannot inadvertently submit a duplicate.
      receipt.state = "submitting";
      await saveReceipt(receiptPath, receipt);
      try {
        // A permanent exclusive claim also prevents duplicate paid calls if two
        // processes simultaneously recover a stale process lock after a crash.
        const claim = await open(`${receiptPath}.submission`, "wx", 0o600);
        try {
          await claim.writeFile(
            JSON.stringify({
              fingerprint,
              createdAt: new Date().toISOString(),
            }),
          );
          await claim.sync();
        } finally {
          await claim.close();
        }
        const response = await fetch(`${QUEUE}/${MODEL}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...parameters,
            image_url: `data:image/png;base64,${image.toString("base64")}`,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!response.ok) {
          receipt.state =
            response.status < 500 ? "rejected" : "submission-uncertain";
          receipt.lastError = `Submission HTTP ${response.status}`;
          await saveReceipt(receiptPath, receipt);
          throw new Error(
            `Fal submission returned HTTP ${response.status}; receipt retained. No automatic retry.`,
          );
        }
        const queued = (await response.json()) as {
          request_id?: string;
          status_url?: string;
          response_url?: string;
          cancel_url?: string;
        };
        if (!queued.request_id) throw new Error("Fal returned no request ID.");
        receipt.request = {
          requestId: queued.request_id,
          statusUrl: queueUrl(queued.status_url),
          responseUrl: queueUrl(queued.response_url),
          ...(queued.cancel_url
            ? { cancelUrl: queueUrl(queued.cancel_url) }
            : {}),
        };
        receipt.state = "queued";
        await saveReceipt(receiptPath, receipt);
      } catch (error) {
        if (receipt.state === "submitting") {
          receipt.state = "submission-uncertain";
          receipt.lastError =
            "Submission interrupted or queue response invalid; recover the existing request ID before resuming.";
          await saveReceipt(receiptPath, receipt);
        }
        throw error;
      }
    }

    const request = receipt.request!;
    const statusUrl = queueUrl(request.statusUrl),
      responseUrl = queueUrl(request.responseUrl);
    console.log(
      `${job}: resuming request ${request.requestId}; receipt ${relative(ROOT, receiptPath)}.`,
    );
    if (receipt.state === "failed")
      throw new Error(
        "This saved request failed. Inspect it in Fal; a new paid attempt needs an explicit --version.",
      );
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (!receipt.result) {
      if (Date.now() >= deadline)
        throw new Error(
          "Polling timed out. The saved job is still resumable; rerun the same command.",
        );
      const response = await fetch(statusUrl, {
        headers,
        signal: AbortSignal.timeout(
          Math.min(30000, Math.max(1, deadline - Date.now())),
        ),
      });
      if (!response.ok)
        throw new Error(
          `Status HTTP ${response.status}. Rerun the same command to resume; no new request will be submitted.`,
        );
      const status = (await response.json()) as { status: string };
      if (status.status !== receipt.lastStatus) {
        receipt.lastStatus = status.status;
        await saveReceipt(receiptPath, receipt);
        console.log(`${job}: ${status.status}.`);
      }
      if (["FAILED", "CANCELLED", "CANCELED"].includes(status.status)) {
        receipt.state = "failed";
        await saveReceipt(receiptPath, receipt);
        throw new Error(
          "Generation failed or was cancelled; receipt retained. No automatic new submission.",
        );
      }
      if (status.status === "COMPLETED") {
        const resultResponse = await fetch(responseUrl, {
          headers,
          signal: AbortSignal.timeout(30000),
        });
        if (!resultResponse.ok)
          throw new Error(
            `Result HTTP ${resultResponse.status}. Receipt retained; rerun to fetch this same result.`,
          );
        receipt.result = (await resultResponse.json()) as Result;
        receipt.state = "completed";
        await saveReceipt(receiptPath, receipt);
        break;
      }
      if (!["IN_QUEUE", "IN_PROGRESS"].includes(status.status))
        throw new Error(
          "Unexpected queue status; receipt retained for inspection.",
        );
      await delay(Math.min(5000, Math.max(0, deadline - Date.now())));
    }

    const result = receipt.result!;
    const file = result.model_urls?.glb ?? result.model_mesh;
    if (!file?.url)
      throw new Error("Result contains no model URL; receipt retained.");
    const downloadUrl = new URL(file.url);
    if (
      downloadUrl.protocol !== "https:" ||
      downloadUrl.username ||
      downloadUrl.password
    )
      throw new Error("Refusing an unexpected asset download URL.");
    // Never include Fal authorization in asset downloads or fetch preview images.
    const download = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(120000),
    });
    if (!download.ok)
      throw new Error(
        `Asset download HTTP ${download.status}; rerun to download the saved result.`,
      );
    const model = Buffer.from(await download.arrayBuffer());
    validateGlb(model);
    await writeOriginal(outputPath, model);
    receipt.output = {
      path: relative(ROOT, outputPath),
      sha256: hash(model),
      bytes: model.length,
      downloadedAt: new Date().toISOString(),
      format: "GLB 2.0",
    };
    receipt.state = "downloaded";
    await saveReceipt(receiptPath, receipt);
    console.log(
      `${job}: saved exact original GLB (${Math.round(model.length / 1024)} KiB) to ${relative(ROOT, outputPath)}. Provenance: ${relative(ROOT, receiptPath)}.`,
    );
  } finally {
    await unlock();
  }
}

main().catch((error: unknown) => {
  // Do not print request bodies, headers, or SDK errors that might contain keys.
  const message =
    error instanceof Error
      ? error.message
      : "Character generation failed; saved receipts are resumable.";
  const key = process.env.FAL_KEY;
  console.error(key ? message.replaceAll(key, "[redacted]") : message);
  process.exitCode = 1;
});
