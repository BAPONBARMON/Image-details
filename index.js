const express = require("express");
const multer = require("multer");
const fs = require("fs");
const exifParser = require("exif-parser");
const sharp = require("sharp");
const cors = require("cors");

const app = express();
app.use(cors());

/* multer setup */
const upload = multer({ dest: "uploads/" });

/* home check */
app.get("/", (req, res) => {
  res.send("Image Detail Extractor Backend Running");
});

/* helpers */
function isValidValue(v){
  if(v === null || v === undefined) return false;
  if(typeof v === "number" && v < 1000000000) return false; // block 1970
  if(typeof v === "string" && v.trim() === "") return false;
  if(typeof v === "string" && v.includes("0000:00:00")) return false;
  return true;
}

/* upload route */
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const buffer = fs.readFileSync(filePath);

    /* ===== EXIF ===== */
    let exifData = {};
    try {
      const parser = exifParser.create(buffer);
      const exif = parser.parse();
      for (let key in exif.tags) {
        if (isValidValue(exif.tags[key])) {
          exifData[key] = exif.tags[key];
        }
      }
    } catch (e) {
      exifData = {};
    }

    /* ===== IMAGE STRUCTURE ===== */
    const image = sharp(buffer);
    const meta = await image.metadata();

    const imageInfo = {
      width: meta.width || null,
      height: meta.height || null,
      format: meta.format || null,
      space: meta.space || null,
      channels: meta.channels || null,
      depth: meta.depth || null,
      density: meta.density || null
    };

    /* ===== BASIC ANALYSIS (pixel based) ===== */
    let analysis = {};
    try {
      const stats = await image.stats();
      analysis = {
        brightness:
          stats.channels[0].mean < 60
            ? "Low"
            : stats.channels[0].mean > 180
            ? "High"
            : "Normal",
        contrast:
          stats.channels[0].stdev < 20
            ? "Low"
            : stats.channels[0].stdev > 80
            ? "High"
            : "Normal"
      };
    } catch {
      analysis = {};
    }

    /* ===== RESPONSE ===== */
    res.json({
      file: {
        name: req.file.originalname,
        sizeKB: (req.file.size / 1024).toFixed(2),
        mime: req.file.mimetype
      },
      image: imageInfo,
      exif: exifData,
      analysis: analysis,
      note:
        Object.keys(exifData).length === 0
          ? "Metadata missing or stripped (e.g., WhatsApp image)"
          : "Metadata extracted from image"
    });

    /* cleanup */
    fs.unlinkSync(filePath);

  } catch (err) {
    res.status(500).json({
      error: "Image processing failed",
      details: err.message
    });
  }
});

/* server start */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
