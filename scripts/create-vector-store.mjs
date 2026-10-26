import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config({
  path: ".env.local",
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const vectorStore = await openai.vectorStores.create({
  name: "Enterprise SOP Knowledge Base",
});

console.log("Vector Store ID:", vectorStore.id);

const file = await openai.files.create({
  file: fs.createReadStream("./knowledge/病歷申請SOP.txt"),
  purpose: "assistants",
});

console.log("Uploaded File ID:", file.id);

await openai.vectorStores.files.create(
  vectorStore.id,
  {
    file_id: file.id,
  }
);

console.log("File added to Vector Store.");
console.log("");
console.log("請把以下內容加入 .env.local：");
console.log(
  `OPENAI_VECTOR_STORE_ID=${vectorStore.id}`
);