import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares here to handle CORS and JSON parsing
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: "50mb" }));

// Define routes here
app.get("/", (req, res) => {
  res.send("Server is running");
});

// POST /pdf route to generate PDF from HTML content
app.post("/pdf", async (req, res) => {
  const { htmlContent } = req.body;

  if (!htmlContent) {
    return res.status(400).json({ message: "HTML content is required" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "raw", folder: "cvs", format: "pdf" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(pdfBuffer);
    });

    res.json({
      message: "PDF generated and uploaded successfully",
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    });
  } catch (error) {
    console.error("PDF Generation or upload error:", error);
    res
      .status(500)
      .json({ message: "Internal server error: " + error.message });
  }
});

// check server does not run in serverless environment
if (process.env.NODE_ENV !== "prod") {
  app.listen(PORT, () => {
    console.log(`Server is running on PORT ${PORT}`);
  });
}

export default app;
