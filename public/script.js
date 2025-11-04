import { createClient } from "https://esm.sh/@anam-ai/js-sdk@latest";
import { AnamEvent } from "https://esm.sh/@anam-ai/js-sdk@latest/dist/module/types";

let anamClient = null;
let interviewSessionId = null;
let conversationTranscript = [];

// Get DOM elements
const videoElement = document.getElementById("persona-video");
const statusElement = document.getElementById("status");
const chatHistory = document.getElementById("chat-history");
const liveTranscript = document.getElementById("live-transcript");
const transcriptText = document.getElementById("transcript-text");

// Interview elements
const candidateNameInput = document.getElementById("candidate-name");
const positionInput = document.getElementById("position");
const startInterviewBtn = document.getElementById("start-interview-btn");
const stopInterviewBtn = document.getElementById("stop-interview-btn");
const generateDocBtn = document.getElementById("generate-doc-btn");
const documentationDiv = document.getElementById("documentation");
const docContent = document.getElementById("doc-content");
const downloadDocBtn = document.getElementById("download-doc-btn");

function updateChatHistory(messages) {
  if (!chatHistory) return;
  // Clear existing content
  chatHistory.innerHTML = "";
  if (messages.length === 0) {
    chatHistory.innerHTML = "<p>Start a conversation to see your chat history</p>";
    return;
  }
  // Add each message to the chat history
  messages.forEach((message) => {
    const messageDiv = document.createElement("div");
    messageDiv.style.marginBottom = "10px";
    messageDiv.style.padding = "5px";
    messageDiv.style.borderRadius = "5px";
    if (message.role === "user") {
      messageDiv.style.backgroundColor = "#e3f2fd";
      messageDiv.innerHTML = `<strong>You:</strong> ${message.content}`;
    } else {
      messageDiv.style.backgroundColor = "#f1f8e9";
      messageDiv.innerHTML = `<strong>Cara:</strong> ${message.content}`;
    }
    chatHistory.appendChild(messageDiv);
  });
  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function saveTranscriptToServer(transcript) {
  try {
    const response = await fetch("/api/save-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: interviewSessionId, transcript })
    });
    if (!response.ok) {
      console.error("Failed to save transcript to server");
    }
  } catch (error) {
    console.error("Error saving transcript:", error);
  }
}

async function startChat() {
  try {
    statusElement.textContent = "Starting interview...";

    // Get session token from your server
    const response = await fetch("/api/session-token", {
      method: "POST",
    });
    const { sessionToken } = await response.json();

    // Create the Anam client
    anamClient = createClient(sessionToken);

    // Listen for MESSAGE_HISTORY_UPDATED to update chat history
    anamClient.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
      console.log("Conversation updated:", messages);
      conversationTranscript = messages;
      updateChatHistory(messages);

      // Save transcript to server whenever conversation updates
      if (interviewSessionId && messages.length > 0) {
        saveTranscriptToServer(messages);
      }
    });

    // Listen for real-time transcription events
    anamClient.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (event) => {
      console.log("event", event);

      if (event.role === "persona") {
        // Show persona speaking in real-time
        if (liveTranscript && transcriptText) {
          transcriptText.textContent = transcriptText.textContent + event.content;
        }
      } else if (event.role === "user") {
        // Clear the persona live transcript when the user speaks
        if (liveTranscript && transcriptText) {
          transcriptText.textContent = "";
        }
      }
    });

    // Start streaming to the video element
    await anamClient.streamToVideoElement("persona-video");

    statusElement.textContent = "Interview active";

    console.log("Interview started successfully!");
  } catch (error) {
    console.error("Failed to start interview:", error);
    statusElement.textContent = "Failed to start interview";
  }
}

function stopChat() {
  if (anamClient) {
    // Disconnect the client
    anamClient.stopStreaming();
    anamClient = null;

    // Clear video element
    videoElement.srcObject = null;

    statusElement.textContent = "";

    console.log("Interview stopped.");
  }
}

async function startInterview() {
  const candidateName = candidateNameInput.value.trim();
  const position = positionInput.value.trim();

  if (!candidateName || !position) {
    statusElement.textContent = "Please enter candidate name and position";
    return;
  }

  try {
    statusElement.textContent = "Starting interview session...";

    const response = await fetch("/api/start-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateName, position })
    });

    const data = await response.json();
    interviewSessionId = data.sessionId;

    // Start the video chat
    await startChat();

    // Update UI
    startInterviewBtn.disabled = true;
    stopInterviewBtn.disabled = false;
    generateDocBtn.disabled = false;
    statusElement.textContent = `Interview started for ${candidateName} - ${position}`;

  } catch (error) {
    console.error("Failed to start interview:", error);
    statusElement.textContent = "Failed to start interview";
  }
}

async function stopInterview() {
  // Save transcript to server before stopping
  if (conversationTranscript.length > 0) {
    await saveTranscriptToServer(conversationTranscript);
  }

  stopChat();
  interviewSessionId = null;
  startInterviewBtn.disabled = false;
  stopInterviewBtn.disabled = true;
  generateDocBtn.disabled = true;
  statusElement.textContent = "Interview stopped";

  // Clear chat history and transcript
  updateChatHistory([]);
  if (transcriptText) {
    transcriptText.textContent = "";
  }
}

async function generateDocumentation() {
  if (!interviewSessionId) {
    statusElement.textContent = "No active interview session";
    return;
  }

  try {
    statusElement.textContent = "Generating documentation...";

    const response = await fetch("/api/generate-documentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: interviewSessionId })
    });

    const data = await response.json();

    // Display documentation
    docContent.textContent = JSON.stringify(data.documentation, null, 2);
    documentationDiv.style.display = "block";
    statusElement.textContent = `Documentation generated successfully. Files saved: ${data.pdfFileName} and ${data.jsonFileName}`;

  } catch (error) {
    console.error("Failed to generate documentation:", error);
    statusElement.textContent = "Failed to generate documentation";
  }
}

function downloadDocumentation() {
  const content = docContent.textContent;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview_documentation_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Add event listeners
startInterviewBtn.addEventListener("click", startInterview);
stopInterviewBtn.addEventListener("click", stopInterview);
generateDocBtn.addEventListener("click", generateDocumentation);
downloadDocBtn.addEventListener("click", downloadDocumentation);
