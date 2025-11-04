require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const OpenAI = require("openai");
const app = express();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.static("public"));

// In-memory storage for interview data (in production, use a database)
let interviewSessions = {};
let interviewData = {};

app.post("/api/session-token", async (req, res) => {
  try {
    const response = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ANAM_API_KEY}`,
      },
      body: JSON.stringify({
        personaConfig: {
          name: "Cara",
          avatarId: "30fa96d0-26c4-4e55-94a0-517025942e18",
          voiceId: "6bfbe25a-979d-40f3-a92b-5394170af54b",
          llmId: "0934d97d-0c3a-4f33-91b0-5e136a0ef466",
          systemPrompt:
            "You are Cara, a professional interviewer conducting exit interviews for employees leaving the company. Your goal is to gather comprehensive information about their work history, project contributions, skills, knowledge, and institutional memory to create thorough documentation for knowledge transfer. Ask short, concise questions one at a time about their roles, projects, challenges, solutions, lessons learned, and any undocumented processes or insights. Be professional, encouraging, and thorough in your questioning. Guide the conversation naturally while ensuring you cover key areas: detailed work history, project documentation, technical knowledge, process insights, and recommendations for successors. Document key points from their responses for organizational knowledge preservation.",
        },
      }),
    });

    const data = await response.json();
    res.json({ sessionToken: data.sessionToken });
  } catch (error) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Interview endpoints
app.post("/api/start-interview", (req, res) => {
  const { candidateName, position } = req.body;
  const sessionId = Date.now().toString();

  interviewSessions[sessionId] = {
    candidateName,
    position,
    startTime: new Date(),
    status: "active"
  };

  interviewData[sessionId] = {
    responses: [],
    summary: ""
  };

  res.json({ sessionId, message: "Interview session started" });
});

app.post("/api/save-interview-response", (req, res) => {
  const { sessionId, question, response } = req.body;

  if (!interviewData[sessionId]) {
    return res.status(404).json({ error: "Interview session not found" });
  }

  interviewData[sessionId].responses.push({
    question,
    response,
    timestamp: new Date()
  });

  res.json({ message: "Response saved successfully" });
});

// Helper function to generate transcript text from fullResponses array
function generateTranscriptFromResponses(fullResponses) {
  if (!fullResponses || fullResponses.length === 0) {
    return "";
  }
  return fullResponses.map(response => {
    // Assuming responses are strings like "Candidate: Hello" or "Interviewer: Hi"
    return response;
  }).join('\n\n');
}

// Helper function to attempt fetching transcript from Anam.ai (placeholder - may not be available server-side)
async function fetchTranscriptFromAnam(sessionId) {
  // Note: Anam.ai transcripts are typically captured via client-side events (MESSAGE_HISTORY_UPDATED)
  // Server-side API for fetching transcripts may not exist; this is a placeholder
  // For now, return null to fall back to other methods
  console.log(`Attempting to fetch transcript for session ${sessionId} from Anam.ai...`);
  // TODO: Implement if Anam.ai provides a server-side API endpoint
  return null;
}

// Helper function to generate LLM summary
async function generateLLMSummary(transcriptContent, candidateName, position) {
  try {
    const prompt = `Analyze the following exit interview transcript for knowledge transfer documentation. The employee ${candidateName} held the position of ${position} and is leaving the company.

Transcript:
${transcriptContent}

Please provide a detailed analysis in the following JSON format focused on knowledge transfer and documentation. Make sure the JSON is valid and properly formatted:

{
  "keyPoints": "A comprehensive summary of the employee's work history, projects, technical knowledge, processes, and undocumented insights that should be preserved for the organization. Use bullet points or numbered list format.",
  "knowledgeTransfer": "Identify critical knowledge, processes, and insights that need to be documented or transferred to successors. Include any unique skills, workarounds, or institutional knowledge mentioned.",
  "documentationGaps": "Highlight areas where additional documentation or clarification would be valuable for knowledge preservation. Note any incomplete explanations or areas needing further detail.",
  "successorRecommendations": "Provide recommendations for successors taking over this role, including training needs, key contacts, and important processes to learn.",
  "organizationalValue": "Assess the value of the knowledge shared and its importance for organizational continuity and future projects."
}

Respond ONLY with valid JSON. Do not include any text before or after the JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert knowledge management analyst evaluating exit interview transcripts for organizational knowledge transfer. Always respond with valid JSON only, no additional text." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const llmResponse = completion.choices[0].message.content.trim();
    console.log("LLM Response:", llmResponse);

    // Try to parse JSON, if it fails, attempt to extract JSON from the response
    try {
      return JSON.parse(llmResponse);
    } catch (parseError) {
      console.error("JSON parse failed, attempting to extract JSON:", parseError);
      // Try to find JSON in the response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw parseError;
    }
  } catch (error) {
    console.error("LLM analysis failed:", error);
    // Return a fallback summary
    return {
      keyPoints: "Unable to generate detailed analysis due to processing error. Transcript contains employee responses about their work history and knowledge.",
      knowledgeTransfer: "Review transcript for critical knowledge that needs to be documented for organizational continuity.",
      documentationGaps: "Additional documentation may be needed in areas where responses were incomplete.",
      successorRecommendations: "Successors should review the full transcript to understand processes and knowledge areas.",
      organizationalValue: "The transcript contains valuable insights for knowledge transfer and organizational continuity."
    };
  }
}

app.post("/api/generate-documentation", async (req, res) => {
  const { sessionId } = req.body;

  // For testing purposes, allow generating docs even if session not in memory
  // Try to find existing files first
  const interviewsDirPath = path.join(__dirname, '..', 'interviews');
  // Look for any JSON file that ends with the sessionId
  const files = fs.readdirSync(interviewsDirPath);
  const jsonFileNameExisting = files.find(file => file.endsWith(`${sessionId}.json`));
  const jsonPathExisting = jsonFileNameExisting ? path.join(interviewsDirPath, jsonFileNameExisting) : null;

  let session = null;
  let data = null;

  if (fs.existsSync(jsonPathExisting)) {
    // Load from existing file
    try {
      const existingDoc = JSON.parse(fs.readFileSync(jsonPathExisting, 'utf8'));
      session = {
        candidateName: existingDoc.candidateName,
        position: existingDoc.position,
        startTime: new Date(existingDoc.interviewDate),
        status: "completed"
      };
      data = { responses: existingDoc.fullResponses || [] };
    } catch (error) {
      console.error("Error loading existing documentation:", error);
    }
  }

  if (!session) {
    // Fallback to in-memory session
    if (!interviewData[sessionId] || !interviewSessions[sessionId]) {
      return res.status(404).json({ error: "Interview session not found" });
    }
    session = interviewSessions[sessionId];
    data = interviewData[sessionId];
  }

  // Read and parse transcript file
  let transcriptMessages = [];
  let transcriptContent = "";
  const transcriptPath = path.join(__dirname, '..', 'interviews', `transcript-${sessionId}.txt`);
  console.log(`Looking for transcript at: ${transcriptPath}`);
  console.log(`File exists check: ${fs.existsSync(transcriptPath)}`);

  // First try session-specific transcript
  if (fs.existsSync(transcriptPath)) {
    transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
    console.log(`Found session transcript, length: ${transcriptContent.length}`);
  } else {
    // Try to fetch from Anam.ai (if available)
    const anamTranscript = await fetchTranscriptFromAnam(sessionId);
    if (anamTranscript) {
      transcriptContent = anamTranscript;
      console.log(`Fetched transcript from Anam.ai, length: ${transcriptContent.length}`);
      // Save it for future use
      fs.writeFileSync(transcriptPath, transcriptContent, 'utf8');
    } else {
      // Generate from existing JSON fullResponses as fallback
      const jsonPath = path.join(__dirname, '..', 'interviews', `interview_${session.candidateName.replace(/\s+/g, '_')}_${sessionId}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          transcriptContent = generateTranscriptFromResponses(jsonData.fullResponses || []);
          if (transcriptContent) {
            console.log(`Generated transcript from JSON, length: ${transcriptContent.length}`);
            // Save it for future use
            fs.writeFileSync(transcriptPath, transcriptContent, 'utf8');
          } else {
            console.log(`No transcript data available in JSON`);
          }
        } catch (error) {
          console.error("Error generating transcript from JSON:", error);
        }
      } else {
        console.log(`No transcript files found and no JSON available`);
      }
    }
  }

  if (transcriptContent) {
    console.log(`Transcript content preview: ${transcriptContent.substring(0, 200)}...`);

    // Parse transcript into messages array - handle multiple formats robustly
    let formatDetected = 'unknown';

    if (transcriptContent.includes('Interviewer:') && transcriptContent.includes('Candidate:')) {
      formatDetected = 'Interviewer/Candidate';
    } else if (transcriptContent.includes('Cara:') && transcriptContent.includes('User:')) {
      formatDetected = 'Cara/User';
    } 
    console.log(`Detected transcript format: ${formatDetected}`);

    // Parse based on detected format
    let speakerLabels = [];
    if (formatDetected === 'Interviewer/Candidate') {
      speakerLabels = ['Interviewer:', 'Candidate:'];
    } else if (formatDetected === 'Cara/User') {
      speakerLabels = ['Cara:', 'User:'];
    } 

    if (speakerLabels.length > 0) {
      const lines = transcriptContent.split('\n').filter(line => {
        return line.trim() && speakerLabels.some(label => line.includes(label));
      });

      console.log(`Found ${lines.length} message lines in ${formatDetected} format`);

      transcriptMessages = [];
      let currentMessage = '';
      lines.forEach(line => {
        const isSpeakerLine = speakerLabels.some(label => line.includes(label));
        if (isSpeakerLine) {
          if (currentMessage) transcriptMessages.push(currentMessage);
          currentMessage = line;
        } else if (currentMessage) {
          currentMessage += ' ' + line.trim();
        }
      });
      if (currentMessage) transcriptMessages.push(currentMessage);
    }

    console.log(`Parsed ${transcriptMessages.length} messages from transcript`);
  }

  // Generate LLM summary from transcript
  let llmSummary = null;
  if (transcriptContent) {
    llmSummary = await generateLLMSummary(transcriptContent, session.candidateName, session.position);
  }

  // Generate documentation summary
  const documentation = {
    candidateName: session.candidateName,
    position: session.position,
    interviewDate: session.startTime,
    summary: {
      totalResponses: transcriptMessages.length,
      keyPoints: llmSummary ? llmSummary.keyPoints : "Transcript captured but LLM analysis unavailable.",
      insights: llmSummary ? {
        knowledgeTransfer: llmSummary.knowledgeTransfer,
        documentationGaps: llmSummary.documentationGaps
      } : {},
      recommendations: llmSummary ? llmSummary.successorRecommendations : "Review the transcript for knowledge transfer insights and successor guidance.",
      organizationalValue: llmSummary ? llmSummary.organizationalValue : "The transcript contains valuable insights for organizational knowledge preservation."
    },
    fullResponses: transcriptMessages,
    transcript: transcriptContent
  };

  // Create interviews directory if it doesn't exist
  const interviewsDir = path.join(__dirname, '..', 'interviews');
  if (!fs.existsSync(interviewsDir)) {
    fs.mkdirSync(interviewsDir, { recursive: true });
  }

  // Generate PDF report
  const pdfFileName = `interview_${session.candidateName.replace(/\s+/g, '_')}_${sessionId}.pdf`;
  const pdfPath = path.join(interviewsDir, pdfFileName);

  const doc = new PDFDocument();
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  // PDF Header
  doc.fontSize(24).text('Exit Interview Report', { align: 'center' });
  doc.moveDown(1.5);
  doc.fontSize(16).text(`Employee: ${session.candidateName}`);
  doc.text(`Position: ${session.position}`);
  doc.text(`Interview Date: ${session.startTime.toLocaleDateString()} ${session.startTime.toLocaleTimeString()}`);
  doc.moveDown(1.5);

  // Summary Section
  doc.fontSize(18).text('Knowledge Transfer Summary');
  doc.moveDown(1);
  doc.fontSize(14).text(`Total Responses: ${documentation.summary.totalResponses}`);
  doc.moveDown(0.5);
  doc.text(`Key Points:`, { underline: true });
  doc.moveDown(0.5);
  // Handle key points as array or string
  const keyPoints = Array.isArray(documentation.summary.keyPoints) ? documentation.summary.keyPoints : documentation.summary.keyPoints.split('\n');
  keyPoints.forEach(point => {
    if (point.trim()) {
      doc.text(`• ${point.trim()}`);
      doc.moveDown(0.3);
    }
  });
  doc.moveDown(0.5);
  if (documentation.summary.insights && documentation.summary.insights.knowledgeTransfer) {
    doc.text(`Knowledge Transfer:`, { underline: true });
    doc.moveDown(0.5);
    const ktItems = Array.isArray(documentation.summary.insights.knowledgeTransfer) ? documentation.summary.insights.knowledgeTransfer : documentation.summary.insights.knowledgeTransfer.split('\n');
    ktItems.forEach(item => {
      if (item.trim()) {
        doc.text(`• ${item.trim()}`);
        doc.moveDown(0.3);
      }
    });
    doc.moveDown(0.5);
  }
  if (documentation.summary.insights && documentation.summary.insights.documentationGaps) {
    doc.text(`Documentation Gaps:`, { underline: true });
    doc.moveDown(0.5);
    const dgItems = Array.isArray(documentation.summary.insights.documentationGaps) ? documentation.summary.insights.documentationGaps : documentation.summary.insights.documentationGaps.split('\n');
    dgItems.forEach(item => {
      if (item.trim()) {
        doc.text(`• ${item.trim()}`);
        doc.moveDown(0.3);
      }
    });
    doc.moveDown(0.5);
  }
  doc.text(`Successor Recommendations:`, { underline: true });
  doc.moveDown(0.5);
  const recItems = Array.isArray(documentation.summary.recommendations) ? documentation.summary.recommendations : documentation.summary.recommendations.split('\n');
  recItems.forEach(item => {
    if (item.trim()) {
      doc.text(`• ${item.trim()}`);
      doc.moveDown(0.3);
    }
  });
  doc.moveDown(0.5);
  doc.text(`Organizational Value:`, { underline: true });
  doc.moveDown(0.5);
  const ovItems = Array.isArray(documentation.summary.organizationalValue) ? documentation.summary.organizationalValue : documentation.summary.organizationalValue.split('\n');
  ovItems.forEach(item => {
    if (item.trim()) {
      doc.text(`• ${item.trim()}`);
      doc.moveDown(0.3);
    }
  });
  doc.moveDown(1);

  // Full Transcription
  doc.fontSize(16).text('Interview Transcription');
  doc.moveDown();

  // Use transcript content from file
  if (transcriptContent) {
    transcriptMessages.forEach((message, index) => {
      if (message.trim()) {
        doc.fontSize(12).text(`${index + 1}. ${message}`);
        doc.moveDown(0.5);
      }
    });
  } else {
    doc.fontSize(12).text('No transcript available.');
  }

  doc.end();

  // Save JSON data as well
  const jsonFileName = `interview_${session.candidateName.replace(/\s+/g, '_')}_${sessionId}.json`;
  const jsonPath = path.join(interviewsDir, jsonFileName);
  fs.writeFileSync(jsonPath, JSON.stringify(documentation, null, 2));

  writeStream.on('finish', () => {
    res.json({
      message: "Documentation generated successfully",
      pdfFileName,
      jsonFileName,
      documentation
    });
  });

  writeStream.on('error', (error) => {
    console.error('Error writing PDF:', error);
    res.status(500).json({ error: "Failed to generate PDF" });
  });
});

// Save transcript endpoint
app.post("/api/save-transcript", (req, res) => {
  const { sessionId, transcript } = req.body;

  console.log(`Save transcript request received for sessionId: ${sessionId}`);
  console.log(`Transcript array length: ${transcript ? transcript.length : 'undefined'}`);

  if (!sessionId || !transcript) {
    console.error("Missing sessionId or transcript");
    return res.status(400).json({ error: "Session ID and transcript are required" });
  }

  try {
    // Create interviews directory if it doesn't exist
    const interviewsDir = path.join(__dirname, '..', 'interviews');
    console.log(`Interviews directory: ${interviewsDir}`);
    if (!fs.existsSync(interviewsDir)) {
      fs.mkdirSync(interviewsDir, { recursive: true });
      console.log("Created interviews directory");
    }

    // Save transcript to file
    const transcriptFileName = `transcript-${sessionId}.txt`;
    const transcriptPath = path.join(interviewsDir, transcriptFileName);
    console.log(`Saving transcript to: ${transcriptPath}`);

    // Convert transcript array to readable text format
    const transcriptText = transcript.map(msg =>
      `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`
    ).join('\n\n');

    console.log(`Transcript text length: ${transcriptText.length}`);
    console.log(`Transcript text preview: ${transcriptText.substring(0, 200)}...`);

    fs.writeFileSync(transcriptPath, transcriptText, 'utf8');

    console.log(`Transcript saved successfully to ${transcriptPath}`);

    // Verify file was written
    if (fs.existsSync(transcriptPath)) {
      const stats = fs.statSync(transcriptPath);
      console.log(`File exists, size: ${stats.size} bytes`);
    }

    res.json({ message: "Transcript saved successfully", fileName: transcriptFileName });
  } catch (error) {
    console.error("Failed to save transcript:", error);
    res.status(500).json({ error: "Failed to save transcript" });
  }
});

// New endpoint to generate missing transcripts for all sessions
app.post("/api/generate-missing-transcripts", async (req, res) => {
  try {
    const interviewsDir = path.join(__dirname, '..', 'interviews');
    if (!fs.existsSync(interviewsDir)) {
      return res.status(404).json({ error: "Interviews directory not found" });
    }

    const files = fs.readdirSync(interviewsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file.startsWith('interview_'));

    let processed = 0;
    let generated = 0;
    let errors = [];

    for (const jsonFile of jsonFiles) {
      try {
        const jsonPath = path.join(interviewsDir, jsonFile);
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Extract sessionId from filename (assuming format: interview_Name_sessionId.json)
        const parts = jsonFile.replace('interview_', '').replace('.json', '').split('_');
        const sessionId = parts[parts.length - 1]; // Last part is sessionId

        const transcriptPath = path.join(interviewsDir, `transcript-${sessionId}.txt`);

        if (!fs.existsSync(transcriptPath)) {
          // Try to generate transcript
          let transcriptContent = "";

          // First, try fetching from Anam.ai
          const anamTranscript = await fetchTranscriptFromAnam(sessionId);
          if (anamTranscript) {
            transcriptContent = anamTranscript;
            console.log(`Fetched transcript for session ${sessionId} from Anam.ai`);
          } else {
            // Fallback to generating from fullResponses
            transcriptContent = generateTranscriptFromResponses(jsonData.fullResponses || []);
            if (transcriptContent) {
              console.log(`Generated transcript for session ${sessionId} from JSON`);
            } else {
              console.log(`No transcript data available for session ${sessionId}`);
              continue;
            }
          }

          // Save the transcript
          fs.writeFileSync(transcriptPath, transcriptContent, 'utf8');
          generated++;
          console.log(`Saved transcript for session ${sessionId}`);
        }

        processed++;
      } catch (error) {
        console.error(`Error processing ${jsonFile}:`, error);
        errors.push({ file: jsonFile, error: error.message });
      }
    }

    res.json({
      message: `Processed ${processed} sessions, generated ${generated} transcripts`,
      processed,
      generated,
      errors
    });
  } catch (error) {
    console.error("Error generating missing transcripts:", error);
    res.status(500).json({ error: "Failed to generate missing transcripts" });
  }
});

app.listen(8000, () => {
  console.log("Server running on http://localhost:8000");
});
