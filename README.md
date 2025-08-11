# ARIES: Automated Routines for Intelligent Engineering Scenarios

ARIES is a modern web application that generates personalized coding challenges based on your resume and a job description. It leverages AI to analyze your skills and the requirements of a role, then creates a custom GitHub repository with tailored tasks—helping you prepare for technical interviews or upskill for new opportunities.

## Features

- **AI-Powered Challenge Generation:** Upload your resume and a job description (PDF, DOC, DOCX, or TXT). The app uses AI to create a unique coding challenge and a ready-to-use GitHub repo.
- **Firebase Authentication:** Secure login and sign-up with email/password, password reset, and session persistence.
- **Dark Mode:** Beautiful, responsive UI with global dark mode toggle and persistence.
- **Background Audio:** Fun retro audio on load, with a mute/unmute toggle.
- **Built with:** React 18, Vite, TypeScript, Tailwind CSS, Firebase, and Bun.

## Quick Start (with Bun)

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd bs-challenge
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Set up environment variables:**
   - Copy `.env.example` to `.env` and fill in your Firebase project credentials and function URL.

4. **Run the development server:**
   ```bash
   bun run dev
   ```
   The app will be available at [http://localhost:5173](http://localhost:5173).

5. **Build for production:**
   ```bash
   bun run build
   ```

## Usage

1. **Log in** with your email and password.
2. **Upload your resume and a job description** (drag & drop or browse).
3. **Click "Generate Challenge"** to let ARIES create a personalized coding challenge and GitHub repo for you.
4. **Access your challenge** via the provided links and start coding!

## Tech Stack
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, lucide-react
- **Backend:** Firebase Functions (OpenAI integration, GitHub repo creation)
- **Auth:** Firebase Authentication
- **Package Manager:** Bun

## Environment Variables
See `.env.example` for required variables:
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.
- `VITE_FUNCTION_URL` (your deployed Firebase Function endpoint)

## License
MIT

---

> Built with ❤️ using Bun, React, and Firebase. All your base are belong to us!
