import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { exiftool } from "exiftool-vendored";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

/* ---------- helper functions ---------- */

function formatAMPM(date) {
  return date.toLocaleString("en-US", { hour12: true });
}

function parseCaptureTime(exif) {
  // priority order (industry standard)
  const candidates = [
    exif.SubSecDateTimeOriginal,
    exif.DateTimeOriginal,
    exif.CreateDate,
    exif.GPSDateTime
  ];

  for (const val of candidates) {
    if (!val) continue;

    // UNIX timestamp
    if (typeof val === "number") {
      return formatAMPM(new Date(val * 1000));
    }

    // exif date string: 2026:01:09 21:17:55
    if (typeof val === "string" && val.includes(" ")) {
      const [d, t] = val.split(" ");
      const iso = d.replace(/:/g, "-") + "T" + t.replace("Z", "");
      const dt = new Date(iso);
      if (!isNaN(dt)) return formatAMPM(dt);
    }
  }
  return null;
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  let dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === "S" || ref === "W") dec *= -1;
  return Number(dec.toFixed(6));
}

function dmsPretty(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  return `${dms[0]}° ${dms[1]}' ${dms[2]}" ${ref}`;
}

/* ---------- routes ---------- */

app.get("/", (req, res) => {
  res.send("Backend OK");
});

app.post("/upload", upload.single("image"), async (req, res) => {
  const filePath = req.file.path;

  try {
    const exif = await exiftool.read(filePath);

    /* ---------- CLEAN DATA ---------- */
    const clean = {};

    // Capture time
    const captured = parseCaptureTime(exif);
    if (captured) clean.CapturedTime = captured;

    // GPS
    if (exif.GPSLatitude && exif.GPSLatitudeRef) {
      clean.Latitude_DMS = dmsPretty(
        exif.GPSLatitude,
        exif.GPSLatitudeRef
      );
      clean.Latitude_Decimal = dmsToDecimal(
        exif.GPSLatitude,
        exif.GPSLatitudeRef
      );
    }

    if (exif.GPSLongitude && exif.GPSLongitudeRef) {
      clean.Longitude_DMS = dmsPretty(
        exif.GPSLongitude,
        exif.GPSLongitudeRef
      );
      clean.Longitude_Decimal = dmsToDecimal(
        exif.GPSLongitude,
        exif.GPSLongitudeRef
      );
    }

    if (clean.Latitude_DMS && clean.Longitude_DMS) {
      clean.GPSPosition = `${clean.Latitude_DMS}, ${clean.Longitude_DMS}`;
    }

    // Camera / device
    if (exif.Make) clean.Make = exif.Make;
    if (exif.Model) clean.Model = exif.Model;
    if (exif.LensModel) clean.Lens = exif.LensModel;

    // Image
    if (exif.ImageWidth) clean.ImageWidth = exif.ImageWidth;
    if (exif.ImageHeight) clean.ImageHeight = exif.ImageHeight;
    if (exif.Megapixels) clean.Megapixels = exif.Megapixels;
    if (exif.MIMEType) clean.MIMEType = exif.MIMEType;

    // File
    clean.FileName = req.file.originalname;
    clean.FileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

    /* ---------- ANALYSIS (SAFE ONLY) ---------- */
    const analysis = {};
    if (exif.ISO) analysis.ISO = exif.ISO;
    if (exif.FNumber) analysis.Aperture = exif.FNumber;
    if (exif.ExposureTime) analysis.ExposureTime = exif.ExposureTime;
    if (exif.WhiteBalance) analysis.WhiteBalance = exif.WhiteBalance;
    if (exif.MeteringMode) analysis.MeteringMode = exif.MeteringMode;

    /* ---------- RAW (EVERYTHING ELSE) ---------- */
    const usedKeys = new Set([
      ...Object.keys(clean),
      "SubSecDateTimeOriginal",
      "DateTimeOriginal",
      "CreateDate",
      "GPSDateTime",
      "GPSLatitude",
      "GPSLatitudeRef",
      "GPSLongitude",
      "GPSLongitudeRef",
      "Make",
      "Model",
      "LensModel",
      "ImageWidth",
      "ImageHeight",
      "Megapixels",
      "MIMEType",
      "ISO",
      "FNumber",
      "ExposureTime",
      "WhiteBalance",
      "MeteringMode"
    ]);

    const raw = {};
    for (const k in exif) {
      if (!usedKeys.has(k)) {
        raw[k] = exif[k];
      }
    }

    res.json({
      clean,
      analysis,
      raw
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlinkSync(filePath);
  }
});

/* ---------- shutdown ---------- */
process.on("exit", () => exiftool.end());

app.listen(10000, () =>
  console.log("Server running on port 10000")
);
