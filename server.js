require("dotenv").config();
const express = require("express");
const path = require("path");
const { AssemblyAI } = require("assemblyai");

const aai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
const app = express();
app.use(express.static("public"));

app.use(express.json());

app.get("/token", async (_req, res) => {
  const token = await aai.realtime.createTemporaryToken({ expires_in: 3600 });
  res.json({ token });
});

app.post("/get_summary", async (_req, res) => {
  const text2Summarize = _req.body.input_text;
  const prompt = "Please give me one or two keywords of the transcript."
  const response = await aai.lemur.task({
    prompt: prompt,
    input_text : text2Summarize
  })
  res.json({ response: response });
});


app.set("port", 8000);
const server = app.listen(app.get("port"), () => {
  console.log(
    `Server is running on port http://localhost:${server.address().port}`,
  );
});
