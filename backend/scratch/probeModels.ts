import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function listModels() {
  try {
    // The listModels method isn't directly on genAI in the new SDKs always, 
    // but let's try to just test a few model names.
    const modelsToTest = [
      "gemini-1.5-flash",
      "models/gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-pro"
    ];

    for (const m of modelsToTest) {
      try {
        console.log(`Testing model: ${m}...`);
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent("Hello");
        console.log(`✅ Success with ${m}: ${result.response.text().substring(0, 20)}...`);
        return m; // found it
      } catch (e: any) {
        console.log(`❌ Failed with ${m}: ${e.message}`);
      }
    }
  } catch (err: any) {
    console.error("General error:", err.message);
  }
}

listModels();
