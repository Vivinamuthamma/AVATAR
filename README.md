# Anam AI Interview App

A web application that enables video-based structured interviews with AI personas using the Anam AI platform.

## Description

This application provides a professional interface for conducting structured interviews with "Alex", an AI interviewer powered by Anam AI. The app features real-time video streaming and voice interaction, allowing for natural conversational interviews. The system is designed to gather comprehensive information about candidates' work experience, project contributions, technical skills, and problem-solving abilities, with automatic documentation generation for HR and management use.

## Features

- Real-time video interviews with AI interviewer "CARA"
- Voice interaction capabilities
- Structured interview process for software engineering positions
- Automatic documentation generation
- Simple web-based interface
- RESTful API for session management
- Easy setup and deployment

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Anam AI API key

## Installation

1. Clone or download the project files
2. Navigate to the project directory:
   ```bash
   cd anam-app
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Setup

1. Create a `.env` file in the root directory of the project
2. Add your Anam AI API key to the `.env` file:
   ```
   ANAM_API_KEY=your_api_key_here
   ```
   Replace `your_api_key_here` with your actual Anam AI API key.

## Running the App

### Development Mode
To run the app in development mode with automatic restarts:
```bash
npm run dev
```

### Production Mode
To run the app in production mode:
```bash
npm start
```

The server will start on `http://localhost:8000`. Open this URL in your web browser to access the application.

## Usage

1. Open the application in your web browser at `http://localhost:8000`
2. Enter the candidate's name and position applied for in the input fields
3. Click "Start Interview" to begin the structured interview with Alex
4. The AI interviewer will guide the candidate through questions about their experience, projects, and technical skills
5. Click "Stop Interview" when finished
6. Click "Generate Documentation" to create a summary report of the interview
7. Download the generated documentation as a PDF file (with full transcription) and JSON file

### Interview Process
The AI interviewer "Alex" is configured to conduct structured interviews covering:
- Work history and experience
- Project contributions and challenges
- Technical skills and problem-solving abilities
- Career goals and professional development

The system automatically documents all responses and generates comprehensive interview summaries for HR review.

## API Endpoints

### POST /api/session-token
Creates a new session token for the Anam AI client.

**Request Body:** None required (configuration is hardcoded)

**Response:**
```json
{
  "sessionToken": "session_token_string"
}
```

**Error Response:**
```json
{
  "error": "Failed to create session"
}
```

### POST /api/start-interview
Initializes a new interview session.

**Request Body:**
```json
{
  "candidateName": "John Doe",
  "position": "Software Engineer"
}
```

**Response:**
```json
{
  "sessionId": "1234567890",
  "message": "Interview session started"
}
```

### POST /api/save-interview-response
Saves a candidate's response during an interview.

**Request Body:**
```json
{
  "sessionId": "1234567890",
  "question": "Tell me about your most challenging project",
  "response": "I worked on..."
}
```

**Response:**
```json
{
  "message": "Response saved successfully"
}
```

### POST /api/generate-documentation
Generates documentation from interview responses.

**Request Body:**
```json
{
  "sessionId": "1234567890"
}
```

**Response:**
```json
{
  "message": "Documentation generated successfully",
  "fileName": "interview_John_Doe_1234567890.json",
  "documentation": {
    "candidateName": "John Doe",
    "position": "Software Engineer",
    "interviewDate": "2024-01-15T10:30:00.000Z",
    "summary": {
      "totalResponses": 5,
      "keyPoints": "...",
      "recommendations": "..."
    },
    "fullResponses": [...]
  }
}
```

## Project Structure

```
anam-app/
├── src/
│   ├── app.js          # Basic Express server (not used in main app)
│   └── server.js       # Main Express server
├── public/
│   ├── index.html      # Frontend HTML
│   └── script.js       # Frontend JavaScript
├── server.js           # Root entry point
├── package.json        # Project dependencies and scripts
└── README.md           # This file
```

## Technologies Used

- **Backend:** Node.js, Express.js
- **Frontend:** HTML5, JavaScript (ES6 modules)
- **AI Integration:** Anam AI JS SDK
- **Environment Management:** dotenv

## License

This project is licensed under the ISC License.
