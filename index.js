import express from "express";
import cors from "cors";
import * as puppeteer from "puppeteer";
import puppeteerCore from "puppeteer-core";
import Chromium from "@sparticuz/chromium";
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

// Configure CORS to allow requests from the specified origin
const allowedOrigins = [
  "https://cv-master-client.vercel.app",
  "http://localhost:5173",
];
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(cors(corsOptions));

// Middlewares here to handle JSON parsing
app.use(express.json());

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
    let browser;

    if (process.env.NODE_ENV === "development") {
      // 🔵 Use standard Puppeteer locally
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    // 🔴 Use Puppeteer with Chromium in production
    if (process.env.NODE_ENV === "production") {
      browser = await puppeteerCore.launch({
        args: Chromium.args,
        defaultViewport: Chromium.defaultViewport,
        executablePath: await Chromium.executablePath(),
        headless: Chromium.headless,
      });
    }

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
