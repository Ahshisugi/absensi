import fs from "fs";
import path from "path";
import https from "https";

const modelsDir = path.join(process.cwd(), "public", "models");

if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const files = [
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

const legacyFiles = [
  "ssd_mobilenetv1_model-shard1",
  "face_landmark_68_model-shard1",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];

const baseUrl = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Tangani redirect
          downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Gagal mengunduh ${url}: ${response.statusCode} ${response.statusMessage}`,
            ),
          );
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  console.log("Memulai unduhan model face-api.js ke public/models...");

  for (const file of legacyFiles) {
    const dest = path.join(modelsDir, file);
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
      console.log(`Menghapus file lama ${file}`);
    }
  }

  for (const file of files) {
    const dest = path.join(modelsDir, file);
    const url = baseUrl + file;
    console.log(`Mengunduh ${file}...`);
    try {
      await downloadFile(url, dest);
      console.log(`Selesai mengunduh ${file}`);
    } catch (error) {
      console.error(`Gagal mengunduh ${file}:`, error);
      process.exit(1);
    }
  }
  console.log("Semua model face-api.js berhasil diunduh!");
}

main();
