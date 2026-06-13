# PROJECTCONTEXT.md

# Janhit - Empowering Citizens Through AI

## Overview

Janhit is a multilingual AI-powered Chrome Extension that helps citizens navigate complex government forms, grievance systems, and public service procedures through natural voice conversations.

Instead of manually searching for the correct portal, understanding bureaucratic terminology, and filling lengthy forms, users simply explain their issue in their preferred language. Janhit understands the problem, identifies the appropriate procedure, collects the necessary information through conversation, and assists in generating or autofilling submission-ready forms.

The project aims to bridge the gap between citizens and government services by making civic action accessible to everyone regardless of language, education level, or digital literacy.

---

# Problem Statement

Millions of citizens struggle to access government services and grievance redressal systems because of:

* Complex bureaucratic procedures
* Language barriers
* Low digital literacy
* Confusing government portals
* Lack of awareness about available processes
* Difficulty identifying the correct authority
* Fear of making mistakes while filling forms

As a result, many citizens fail to report issues, claim their rights, file complaints, or access public services even when digital platforms already exist.

There is a need for an intelligent, multilingual, voice-first system that can simplify these procedures and guide citizens through them conversationally.

---

# Solution

Janhit acts as an AI Civic Assistant.

Users can speak naturally in their preferred language and describe their issue.

The system:

1. Understands the user's problem.
2. Identifies the correct government procedure.
3. Guides the user through required information.
4. Generates structured complaint/application drafts.
5. Assists with form filling and autofill.
6. Provides voice-based guidance throughout the process.

The result is a significantly simpler and more accessible way to interact with public systems.

---

# Vision

To become the AI layer between citizens and public services, making government procedures as simple as having a conversation.
listen here, so when the user opens any website Janhit needs to know what the user is browsering so that it can guide through, it even futher, when user is browersing forms it can guide with which placeholder to be filled or even Janhit can auto fill it, that is my intention
---

# Mission

Empower every citizen to access public services, file grievances, and exercise their rights without being limited by language, bureaucracy, or digital complexity.

---

# Target Users

* Citizens with limited digital literacy
* Rural populations
* Senior citizens
* Non-English speakers
* Students
* Working professionals
* First-time users of government portals
* Individuals seeking grievance redressal

---

# Hackathon Category

Open Innovation

---

# Platform

Chrome Extension (Manifest V3)

---

# Core Features

## Voice-Based Interaction

Users can interact with the system using natural speech.

## Multilingual Support

Supports multiple Indian languages using Sarvam AI.

## AI Civic Navigation

Identifies the correct process based on the user's problem.

## Conversational Guidance

Asks relevant questions to gather missing information.

## Smart Form Assistance

Guides users while filling forms and applications.

## AI Form Autofill

Automatically fills compatible form fields.


## Voice Feedback

Provides spoken responses and confirmations.

## Accessibility First

Designed for users with limited technical knowledge.

---

# MVP Scope (Hackathon Version)

## Workflow 1: Municipal Complaints

Examples:

* Broken streetlights
* Garbage collection issues
* Water supply complaints
* Road damage
* Drainage problems

### Output

* Structured complaint
* Ready-to-submit complaint draft

---

## Workflow 2: Banking Grievances

Examples:

* Unauthorized transactions
* Failed refunds
* Double deductions
* Banking service complaints

### Output

* Banking grievance draft
* Ombudsman-ready complaint format

---

# Future Workflows

* RTI Filing Assistance
* Consumer Court Complaints
* Utility Complaints
* e-FIR Guidance
* Government Scheme Assistance
* Permit Applications
* Public Service Requests

---

# User Flow

User Opens Government Website
↓
Activates Janhit Extension
↓
Speaks in Preferred Language
↓
Speech Converted to Text
↓
AI Understands User Intent
↓
System Identifies Appropriate Procedure
↓
AI Collects Required Information
↓
Form Draft Generated
↓
Fields Autofilled
↓
Voice Confirmation Provided
↓
User Reviews and Submits

---

# System Architecture

User Voice
↓
Sarvam Saaras V3 (Speech-to-Text)
↓
Gemini AI (Reasoning Layer)
↓
Intent Detection
↓
Workflow Selection
↓
Information Collection
↓
Form Generation Engine
↓
Chrome Autofill Layer
↓
Sarvam Bulbul V3 (Text-to-Speech)
↓
User

---

# Technology Stack

## Frontend

* HTML
* CSS
* JavaScript
* Chrome Extension APIs
* Manifest V3

## Backend

* Node.js
* Cloudflare Workers

## AI Models

### Reasoning

* Google Gemini 2.5 Flash

Alternative Support:

* OpenAI GPT Models
* GitHub Models

### Speech-to-Text

* Sarvam AI Saaras V3

### Text-to-Speech

* Sarvam AI Bulbul V3

---

# Software Requirements

## Development Environment

* Visual Studio Code
* Git
* Node.js 20+
* Google Chrome

## APIs

* Gemini API Key
* Sarvam AI API Key
* Cloudflare Worker Account

---

# Browser Permissions

* Active Tab
* Microphone Access
* Storage
* Scripting
* Host Permissions

---

# Repository Structure

JANHIT/
/src
├── extension/
│ ├── manifest.json
│ ├── popup/
│ ├── content-scripts/
│ ├── background/
│ ├── assets/
│ └── utils/
│
├── worker/
│ ├── api/
│ ├── prompts/
│ ├── routes/
│ └── services/
│
├── docs/
│ ├── architecture.md
│ ├── api-docs.md
│ └── pitch.md
│
├── README.md
│
└── PROJECTCONTEXT.md

---

# Non-Functional Requirements

## Performance

* Response latency below 3 seconds
* Fast voice interaction

## Accessibility

* Multilingual support
* Voice-first experience

## Scalability

* Support multiple civic workflows
* Modular architecture

## Reliability

* Graceful handling of API failures
* Retry mechanisms

---

# Expected Impact

Janhit reduces the friction between citizens and public institutions.

By converting bureaucratic processes into simple conversations, the platform enables more people to:

* File complaints
* Access public services
* Exercise civic rights
* Report local issues
* Engage with governance systems

---

# Success Metrics

* Time saved during form completion
* Number of successful complaint drafts generated
* Number of supported languages
* User completion rate
* Reduction in manual form-filling effort

---


# Team Mission

Make civic action as easy as having a conversation.

---

# Tagline

Janhit - Empowering Citizens Through AI


let me tell again what is this ai assitant that guide user based on voice frist input . when user hold input shortcut. ai listen what user telling and respone back.

it similar to clickly-ai.com

actually it show not show any transcript or audio caputre . it show directly send data to worker where speach convert into text using sravam ai api