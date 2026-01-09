const express = require("express");
const multer = require("multer");
const fs = require("fs");
const exif = require("exif-parser");
const cors = require("cors");

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Image Detail Extractor Backend Running");
});

app.post("/upload", upload.single("image"), (req, res) => {
  try {
    const buffer = fs.readFileSync(req.file.path);
    const parser = exif.create(buffer);
    const result = parser.parse();

    res.json({
      fileName: req.file.originalname,
      fileSizeKB: (req.file.size / 1024).toFixed(2),
      imageInfo: {
        width: result.imageSize?.width || "Vacant",
        height: result.imageSize?.height || "Vacant"
      },
      exifData: result.tags || "Vacant"
    });
  } catch (err) {
    res.status(500).json({ error: "Image read failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
